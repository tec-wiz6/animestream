// ============================================================
// REWIND — COMPLETE WORKING APP WITH HIANIME BACKEND
// ============================================================

const ANILIST_URL = 'https://graphql.anilist.co';
const JIKAN_URL = 'https://api.jikan.moe/v4';
const WATCHLIST_KEY = 'rewind_watchlist_v1';
const HIANIME_API_BASE = '/api/hianime';

// ---- state ----
let state = {
  view: 'home',
  genre: 'all',
  query: '',
  page: 1,
  items: [],
  loading: false
};

// ---- DOM ----
const $ = (sel) => document.querySelector(sel);
const shelf = $('#shelf');
const shelfTitle = $('#shelfTitle');
const shelfCount = $('#shelfCount');
const loadMoreBtn = $('#loadMore');
const searchInput = $('#searchInput');
const clearSearchBtn = $('#clearSearch');
const slotLed = $('#slotLed');
const slotReadout = $('#slotReadout');
const genreRow = $('#genreRow');
const caseModal = $('#caseModal');
const caseContent = $('#caseContent');
const toastTemplate = $('#toastTemplate');

// ============================================================
// WATCHLIST
// ============================================================
function getWatchlist() {
  try { return JSON.parse(localStorage.getItem(WATCHLIST_KEY)) || {}; }
  catch { return {}; }
}
function saveWatchlist(list) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
}
function isSaved(id) {
  return !!getWatchlist()[id];
}
function toggleSave(anime) {
  const list = getWatchlist();
  if (list[anime.id]) {
    delete list[anime.id];
    showToast(`Removed "${anime.title}" from your shelf`);
  } else {
    list[anime.id] = {
      id: anime.id,
      title: anime.title,
      image: anime.image,
      type: anime.type,
      score: anime.score
    };
    showToast(`Added "${anime.title}" to your shelf`);
  }
  saveWatchlist(list);
  return !!list[anime.id];
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg) {
  const el = toastTemplate.content.firstElementChild.cloneNode(true);
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ============================================================
// NORMALIZE
// ============================================================
function fromAniList(m) {
  return {
    id: `al-${m.id}`,
    malId: m.idMal || null,
    title: m.title?.english || m.title?.romaji || 'Untitled',
    romaji: m.title?.romaji || '',
    description: (m.description || 'No synopsis available.').replace(/<[^>]*>/g, ''),
    image: m.coverImage?.large || m.coverImage?.extraLarge || null,
    type: m.format || 'TV',
    episodes: m.episodes || '?',
    score: m.averageScore ? (m.averageScore / 10).toFixed(1) : null,
    year: m.startDate?.year || 'TBA',
    status: m.status || 'Unknown',
    genres: m.genres || [],
    studio: m.studios?.nodes?.[0]?.name || 'Unknown studio',
  };
}
function fromJikan(a) {
  return {
    id: `mal-${a.mal_id}`,
    malId: a.mal_id,
    title: a.title_english || a.title,
    romaji: a.title,
    description: a.synopsis || 'No synopsis available.',
    image: a.images?.jpg?.large_image_url || a.images?.jpg?.image_url || null,
    type: a.type || 'TV',
    episodes: a.episodes || '?',
    score: a.score ? a.score.toFixed(1) : null,
    year: a.year || (a.aired?.from ? a.aired.from.split('-')[0] : 'TBA'),
    status: a.status || 'Unknown',
    genres: (a.genres || []).map(g => g.name),
    studio: a.studios?.[0]?.name || 'Unknown studio',
  };
}

// ============================================================
// DATA FETCHING (AniList + Jikan)
// ============================================================
async function fetchTrending(page = 1, genre = 'all') {
  const genreClause = genre !== 'all' ? `, genre: "${GENRE_MAP[genre]}"` : '';
  const query = `
    query {
      Page(page: ${page}, perPage: 18) {
        pageInfo { hasNextPage }
        media(type: ANIME, sort: TRENDING_DESC, isAdult: false${genreClause}) {
          id idMal title { romaji english } description
          coverImage { large extraLarge } format episodes averageScore
          startDate { year } status genres studios(isMain: true) { nodes { name } }
        }
      }
    }`;
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query }),
  });
  const data = await res.json();
  const media = data?.data?.Page?.media || [];
  return { items: media.map(fromAniList), hasMore: !!data?.data?.Page?.pageInfo?.hasNextPage };
}

async function fetchSearch(q, page = 1) {
  const res = await fetch(`${JIKAN_URL}/anime?q=${encodeURIComponent(q)}&page=${page}&limit=18&sfw=true`);
  const data = await res.json();
  const items = (data.data || []).map(fromJikan);
  const hasMore = !!data?.pagination?.has_next_page;
  return { items, hasMore };
}

async function fetchFullByMalId(malId) {
  const res = await fetch(`${JIKAN_URL}/anime/${malId}/full`);
  const data = await res.json();
  return data.data ? fromJikan(data.data) : null;
}

async function fetchEpisodesFromJikan(malId) {
  try {
    const res = await fetch(`${JIKAN_URL}/anime/${malId}/episodes`);
    const data = await res.json();
    return data.data || [];
  } catch (e) {
    return [];
  }
}

const GENRE_MAP = {
  1: 'Action', 4: 'Comedy', 8: 'Drama', 10: 'Fantasy',
  22: 'Romance', 24: 'Sci-Fi', 36: 'Slice of Life',
};

// ============================================================
// HIANIME — search, episodes, embed (frontend helpers)
// ============================================================
async function searchHiAnime(title) {
  try {
    const res = await fetch(`${HIANIME_API_BASE}?action=search&query=${encodeURIComponent(title)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.results || [];
  } catch (e) {
    console.log('HiAnime search failed:', e);
    return [];
  }
}

async function getHiAnimeEpisodes(hiId) {
  try {
    const res = await fetch(`${HIANIME_API_BASE}?action=episodes&id=${encodeURIComponent(hiId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.episodes || [];
  } catch (e) {
    console.log('HiAnime episodes failed:', e);
    return [];
  }
}

async function getHiAnimeEmbed(episodeId) {
  try {
    const res = await fetch(`${HIANIME_API_BASE}?action=embed&episodeId=${encodeURIComponent(episodeId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.embedUrl || null;
  } catch (e) {
    console.log('HiAnime embed failed:', e);
    return null;
  }
}

// ============================================================
// RENDERING — SHELF GRID
// ============================================================
function qualityBars(score) {
  const n = score ? Math.round(parseFloat(score)) : 0;
  const bars = Math.min(5, Math.max(0, Math.round(n / 2)));
  return Array.from({ length: 5 }, (_, i) =>
    `<span class="bar ${i < bars ? 'on' : ''}"></span>`).join('');
}

function tapeCardHTML(anime, i) {
  const saved = isSaved(anime.id);
  const runtime = anime.episodes && anime.episodes !== '?' ? `EP 01/${String(anime.episodes).padStart(2, '0')}` : '00:00:00';
  return `
    <div class="tape" data-id="${anime.id}" style="animation-delay:${Math.min(i * 30, 300)}ms">
      <div class="tape-art">
        ${anime.image
          ? `<img src="${anime.image}" alt="${escapeHtml(anime.title)}" loading="lazy" onerror="this.style.display='none'">`
          : `<div class="tape-fallback">📼</div>`}
        <div class="tape-static"></div>
        <span class="tape-type">${anime.type}</span>
        <button class="tape-save ${saved ? 'saved' : ''}" data-save="${anime.id}" title="Save to shelf">${saved ? '★' : '☆'}</button>
        <div class="tape-title-bar"><div class="t">${escapeHtml(anime.title)}</div></div>
      </div>
      <div class="tape-stub">
        <div class="tape-quality" title="Score ${anime.score || 'N/A'}">${qualityBars(anime.score)}</div>
        <span class="tape-counter">${runtime}</span>
      </div>
    </div>`;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function renderShelf(items, { append = false } = {}) {
  if (!append) shelf.innerHTML = '';

  if (items.length === 0 && !append) {
    shelf.innerHTML = `
      <div class="shelf-empty">
        <div class="glyph">📼</div>
        <h3>No tapes on this shelf</h3>
        <p>Try another title or genre.</p>
      </div>`;
    shelfCount.textContent = '0 results';
    return;
  }

  const startIndex = append ? shelf.querySelectorAll('.tape').length : 0;
  shelf.insertAdjacentHTML('beforeend', items.map((a, i) => tapeCardHTML(a, i + startIndex)).join(''));
  attachCardEvents();
}

function renderSkeleton(count = 12) {
  shelf.innerHTML = Array.from({ length: count }, () => `<div class="skeleton"></div>`).join('');
  shelfCount.textContent = 'loading…';
}

function attachCardEvents() {
  shelf.querySelectorAll('.tape').forEach(card => {
    const id = card.dataset.id;
    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-save]')) return;
      const anime = state.items.find(a => a.id === id) || getWatchlist()[id];
      if (anime) openCase(anime);
    });
  });

  shelf.querySelectorAll('[data-save]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.save;
      const anime = state.items.find(a => a.id === id) || getWatchlist()[id];
      if (!anime) return;

      const nowSaved = toggleSave(anime);
      btn.classList.toggle('saved', nowSaved);
      btn.textContent = nowSaved ? '★' : '☆';

      if (state.view === 'library' && !nowSaved) renderLibrary();
    });
  });
}

// ============================================================
// DETAIL CASE WITH EPISODE CARDS (HiAnime-powered)
// ============================================================
async function openCase(anime) {
  caseModal.classList.add('open');
  document.body.style.overflow = 'hidden';
  caseContent.innerHTML = caseSkeletonHTML();
  window.dispatchEvent(new CustomEvent('rewind:engaged'));

  let full = anime;
  let episodes = [];

  // Jikan full info + episodes
  if (anime.malId) {
    const fetched = await fetchFullByMalId(anime.malId).catch(() => null);
    if (fetched) full = { ...fetched, id: anime.id };

    try {
      episodes = await fetchEpisodesFromJikan(anime.malId);
    } catch (e) {}
  }

  // If no episodes from Jikan, try HiAnime
  if (episodes.length === 0) {
    const hiResults = await searchHiAnime(anime.title);
    if (hiResults.length > 0) {
      const hiAnime = hiResults[0];
      full.hiId = hiAnime.slugOrId || hiAnime.dataId || hiAnime.id;
      episodes = await getHiAnimeEpisodes(full.hiId);
    }
  }

  // If still no episodes, synthesize from total count
  if (episodes.length === 0 && full.episodes && full.episodes !== '?') {
    const total = Math.min(parseInt(full.episodes) || 12, 50);
    for (let i = 1; i <= total; i++) {
      episodes.push({ number: i, title: `Episode ${i}` });
    }
  }

  renderCase(full, episodes);
}

function caseSkeletonHTML() {
  return `<button class="case-close" id="caseClose">✕</button>
    <div class="case-hero">
      <div class="skeleton case-poster"></div>
      <div class="case-info" style="width:100%;">
        <div class="skeleton" style="height:28px;width:60%;margin-bottom:10px;border-radius:6px;"></div>
        <div class="skeleton" style="height:14px;width:40%;border-radius:6px;"></div>
      </div>
    </div>`;
}

function renderCase(anime, episodes) {
  const saved = isSaved(anime.id);
  const watchLinks = buildWatchLinks(anime.title);
  const episodeCount = episodes.length > 0 ? episodes.length : (anime.episodes !== '?' ? anime.episodes : 0);

  caseContent.innerHTML = `
    <button class="case-close" id="caseClose">✕</button>

    <div class="case-hero">
      <div class="case-poster">
        ${anime.image ? `<img src="${anime.image}" alt="${escapeHtml(anime.title)}">` : ''}
      </div>

      <div class="case-info">
        <h2>${escapeHtml(anime.title)}</h2>
        ${anime.romaji && anime.romaji !== anime.title ? `<div class="sub">${escapeHtml(anime.romaji)}</div>` : ''}

        <div class="case-meta">
          <span>${anime.year}</span>
          <span>${anime.type}</span>
          <span>${episodeCount > 0 ? episodeCount + ' eps' : '?'}</span>
          <span>${anime.score ? '★ ' + anime.score : 'unrated'}</span>
          <span>${escapeHtml(anime.studio)}</span>
        </div>

        <div class="case-synopsis">${escapeHtml(anime.description)}</div>

        <div class="case-actions">
          <button class="btn btn-amber btn-save ${saved ? 'saved' : ''}" id="caseSaveBtn">
            ${saved ? '★ On your shelf' : '☆ Add to shelf'}
          </button>
          ${anime.malId ? `<a class="btn btn-ghost" href="https://myanimelist.net/anime/${anime.malId}" target="_blank" rel="noopener">MAL page ↗</a>` : ''}
        </div>
      </div>
    </div>

    ${episodes.length > 0 ? `
      <div class="episode-block">
        <div style="display:flex;justify-content:space-between;align-items:center;margin:18px 0 12px;">
          <h4>📼 Episodes</h4>
          <span style="font-family:var(--mono);font-size:10px;color:var(--paper-dim);">
            ${episodes.length} total
          </span>
        </div>

        <div class="episode-grid" id="episodeGrid">
          ${episodes.slice(0, 24).map(ep => {
            const epNum = parseInt(ep.number) || parseInt(ep.episode) || 1;
            const epTitle = ep.title && ep.title !== `Episode ${epNum}` ? ep.title : '';
            const epId = ep.episodeId || ep.id || '';

            return `
              <div class="episode-card" data-ep-num="${epNum}" data-ep-id="${epId}">
                <span class="ep-number">EP ${String(epNum).padStart(2, '0')}</span>
                ${epTitle ? `<span class="ep-title">${escapeHtml(epTitle)}</span>` : ''}
                <button class="ep-watch-btn">▶ Play</button>
              </div>
            `;
          }).join('')}
        </div>

        ${episodes.length > 24 ? `
          <div class="episode-more">
            <button class="btn btn-ghost" onclick="showAllEpisodes('${escapeHtml(anime.title)}', ${episodes.length})">
              Show all ${episodes.length} episodes
            </button>
          </div>
        ` : ''}
      </div>
    ` : `
      <div class="episode-block">
        <h4>📼 Episodes</h4>
        <div style="text-align:center;padding:20px;color:var(--paper-dim);">
          <p>No episode data available for this anime.</p>
          <p style="font-size:12px;">Try searching on MAL or streaming platforms below.</p>
        </div>
      </div>
    `}

    <div class="watch-block">
      <h4>🎬 Where to Watch</h4>
      <div class="watch-grid">
        ${watchLinks.map(l => `
          <a class="watch-link" href="${l.url}" target="_blank" rel="noopener">
            ${l.label}
          </a>
        `).join('')}
      </div>
      <div class="watch-note">
        🔍 Opens a search on each platform — availability varies by region.
      </div>
    </div>
  `;

  $('#caseClose').addEventListener('click', closeCase);

  $('#caseSaveBtn').addEventListener('click', () => {
    const nowSaved = toggleSave(anime);
    $('#caseSaveBtn').classList.toggle('saved', nowSaved);
    $('#caseSaveBtn').textContent = nowSaved ? '★ On your shelf' : '☆ Add to shelf';
  });

  // Episode click → HiAnime player
  document.querySelectorAll('.episode-card').forEach(card => {
    card.addEventListener('click', async () => {
      const epNum = parseInt(card.dataset.epNum || '1');
      const epId = card.dataset.epId || null;
      await playEpisodeHiAnime(anime.title, epNum, epId);
    });
  });
}

function showAllEpisodes(title, total) {
  const grid = document.getElementById('episodeGrid');
  if (!grid) return;

  const currentCount = grid.querySelectorAll('.episode-card').length;
  if (currentCount >= total) return;

  for (let i = currentCount + 1; i <= Math.min(currentCount + 12, total); i++) {
    const card = document.createElement('div');
    card.className = 'episode-card';
    card.dataset.epNum = String(i);
    card.innerHTML = `
      <span class="ep-number">EP ${String(i).padStart(2, '0')}</span>
      <button class="ep-watch-btn">▶ Play</button>
    `;
    card.onclick = () => playEpisodeHiAnime(title, i, null);
    grid.appendChild(card);
  }

  const moreBtn = document.querySelector('.episode-more');
  if (moreBtn) {
    const shown = grid.querySelectorAll('.episode-card').length;
    if (shown >= total) {
      moreBtn.remove();
    } else {
      moreBtn.querySelector('button').textContent = `Show ${Math.min(12, total - shown)} more of ${total}`;
    }
  }
}

function closeCase() {
  caseModal.classList.remove('open');
  document.body.style.overflow = '';
}

// ============================================================
// HIANIME EPISODE PLAYER OVERLAY
// ============================================================
async function playEpisodeHiAnime(animeTitle, episodeNumber, episodeId) {
  showToast(`🔍 Loading ${animeTitle} episode ${episodeNumber}...`);

  if (!episodeId) {
    const searchUrl = `https://hianime.ro/search?keyword=${encodeURIComponent(animeTitle)}`;
    window.open(searchUrl, '_blank');
    return;
  }

  const embedUrl = await getHiAnimeEmbed(episodeId);
  if (!embedUrl) {
    showToast('❌ Failed to get HiAnime stream. Opening HiAnime...');
    const fallbackUrl = `https://hianime.ro/watch/${encodeURIComponent(episodeId)}`;
    window.open(fallbackUrl, '_blank');
    return;
  }

  showHiAnimePlayerOverlay(embedUrl, animeTitle, episodeNumber);
}

function showHiAnimePlayerOverlay(embedUrl, animeTitle, episodeNumber) {
  const html = `
    <div class="episode-player-overlay" id="episodePlayer">
      <div class="episode-player-container">
        <div class="episode-player-header">
          <h3>${escapeHtml(animeTitle)} — EP ${String(episodeNumber).padStart(2, '0')}</h3>
          <button class="episode-player-close" onclick="closeEpisodePlayer()">✕</button>
        </div>

        <div class="episode-player-frame">
          <iframe src="${embedUrl}"
                  allowfullscreen
                  allow="autoplay; encrypted-media"
                  style="width:100%;height:100%;border:none;">
          </iframe>
        </div>

        <div class="episode-player-controls">
          <button class="btn btn-ghost" onclick="openInNewTab()">🔗 Open in new tab</button>
          <button class="btn btn-ghost" onclick="refreshIframe()">🔄 Refresh</button>
          <span class="episode-player-note">
            Powered by HiAnime · If video is blocked, try 🔗
          </span>
        </div>
      </div>
    </div>
  `;

  const old = document.getElementById('episodePlayer');
  if (old) old.remove();
  document.body.insertAdjacentHTML('beforeend', html);
  document.body.style.overflow = 'hidden';
}

window.openInNewTab = function() {
  const iframe = document.querySelector('#episodePlayer iframe');
  if (iframe && iframe.src && iframe.src !== 'about:blank') {
    window.open(iframe.src, '_blank');
  }
};
window.refreshIframe = function() {
  const iframe = document.querySelector('#episodePlayer iframe');
  if (!iframe) return;
  const src = iframe.src;
  iframe.src = 'about:blank';
  setTimeout(() => {
    iframe.src = src;
    showToast('🔄 Refreshed');
  }, 300);
};
window.closeEpisodePlayer = function() {
  const overlay = document.getElementById('episodePlayer');
  if (overlay) overlay.remove();
  document.body.style.overflow = '';
};

// ============================================================
// WATCH LINKS
// ============================================================
function buildWatchLinks(title) {
  const q = encodeURIComponent(title);
  return [
    { label: '🔎 JustWatch', url: `https://www.justwatch.com/us/search?q=${q}` },
    { label: 'Crunchyroll', url: `https://www.crunchyroll.com/search?q=${q}` },
    { label: 'Netflix', url: `https://www.netflix.com/search?q=${q}` },
    { label: 'HIDIVE', url: `https://www.hidive.com/search?q=${q}` },
    { label: 'Prime Video', url: `https://www.amazon.com/s?k=${q}&i=instant-video` },
  ];
}

// ============================================================
// LIBRARY VIEW
// ============================================================
function renderLibrary() {
  const list = Object.values(getWatchlist());
  shelfTitle.textContent = 'My shelf';
  shelfCount.textContent = `${list.length} saved`;

  if (list.length === 0) {
    shelf.innerHTML = `
      <div class="shelf-empty">
        <div class="glyph">🎞️</div>
        <h3>Your shelf is empty</h3>
        <p>Tap the ☆ on any tape to keep it here.</p>
      </div>`;
    return;
  }

  renderShelf(list);
}

// ============================================================
// MAIN LOAD
// ============================================================
async function loadHome(page = 1, append = false) {
  state.loading = true;
  if (!append) renderSkeleton();

  try {
    const { items, hasMore } = await fetchTrending(page, state.genre);
    state.items = append ? state.items.concat(items) : items;
    state.page = page;
    renderShelf(items, { append });
    shelfCount.textContent = `${state.items.length} shown`;
    loadMoreBtn.style.display = hasMore ? 'block' : 'none';
    slotReadout.textContent = 'STANDBY · browsing what\'s trending';
  } catch (e) {
    shelf.innerHTML = `<div class="shelf-empty"><div class="glyph">⚠️</div><h3>Signal lost</h3><p>Couldn't reach the tape library. Try again.</p></div>`;
  }

  state.loading = false;
}

async function loadSearch(q, page = 1, append = false) {
  state.loading = true;
  slotLed.classList.add('rec');
  if (!append) renderSkeleton();

  try {
    const { items, hasMore } = await fetchSearch(q, page);
    state.items = append ? state.items.concat(items) : items;
    state.page = page;
    renderShelf(items, { append });
    shelfTitle.textContent = `Results for "${q}"`;
    shelfCount.textContent = `${state.items.length} found`;
    loadMoreBtn.style.display = hasMore ? 'block' : 'none';
    slotReadout.textContent = `PLAYING · search results for "${q}"`;
  } catch (e) {
    shelf.innerHTML = `<div class="shelf-empty"><div class="glyph">⚠️</div><h3>Tape jammed</h3><p>Search failed — try again in a moment.</p></div>`;
  } finally {
    slotLed.classList.remove('rec');
    state.loading = false;
  }
}

// ============================================================
// EVENTS
// ============================================================
let searchDebounce = null;

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  const q = searchInput.value.trim();
  if (!q) { setView('home'); return; }

  searchDebounce = setTimeout(() => {
    state.query = q;
    state.genre = 'all';
    setActiveSpool('all');
    loadSearch(q, 1, false);
  }, 450);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    clearTimeout(searchDebounce);
    const q = searchInput.value.trim();
    if (q) loadSearch(q, 1, false);
  }
});

clearSearchBtn.addEventListener('click', () => {
  searchInput.value = '';
  setView('home');
});

genreRow.addEventListener('click', (e) => {
  const btn = e.target.closest('.spool');
  if (!btn) return;

  searchInput.value = '';
  state.genre = btn.dataset.genre;
  setActiveSpool(state.genre);
  shelfTitle.textContent = state.genre === 'all' ? 'Trending this season' : `${GENRE_MAP[state.genre]} tapes`;
  loadHome(1, false);
});

function setActiveSpool(genre) {
  genreRow.querySelectorAll('.spool').forEach(b => b.classList.toggle('active', b.dataset.genre === genre));
}

loadMoreBtn.addEventListener('click', () => {
  if (state.loading) return;
  if (state.view === 'library') return;

  if (state.query && document.activeElement !== searchInput && shelfTitle.textContent.startsWith('Results')) {
    loadSearch(state.query, state.page + 1, true);
  } else {
    loadHome(state.page + 1, true);
  }
});

document.querySelectorAll('[data-view]').forEach(btn => {
  btn.addEventListener('click', () => setView(btn.dataset.view));
});

caseModal.addEventListener('click', (e) => { if (e.target === caseModal) closeCase(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && caseModal.classList.contains('open')) closeCase(); });

function setView(view) {
  state.view = view;
  searchInput.value = '';
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  loadMoreBtn.style.display = 'none';

  if (view === 'library') {
    renderLibrary();
  } else {
    shelfTitle.textContent = 'Trending this season';
    loadHome(1, false);
  }
}

// ============================================================
// INIT
// ============================================================
loadHome(1, false);

// ============================================================
// INSTALL NUDGE (unchanged)
// ============================================================
(function initInstallPrompt() {
  const STORAGE_KEY = 'rewind_install_state_v1';
  const SNOOZE_DAYS = 7;
  const SHOW_AFTER_MS = 12000;
  const SHOW_AFTER_ENGAGEMENT_MS = 2500;

  const promptEl = document.getElementById('installPrompt');
  const closeBtn = document.getElementById('installClose');
  const confirmBtn = document.getElementById('installConfirm');
  const dismissBtn = document.getElementById('installDismiss');
  const headlineEl = document.getElementById('installHeadline');
  const bodyEl = document.getElementById('installBody');

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  }
  function saveState(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  let installState = loadState();

  if (installState.installed || isStandalone) {
    if (isStandalone && !installState.installed) { installState.installed = true; saveState(installState); }
    return;
  }

  if (!sessionStorage.getItem('rewind_visit_counted')) {
    installState.visits = (installState.visits || 0) + 1;
    saveState(installState);
    sessionStorage.setItem('rewind_visit_counted', '1');
  }

  function isSnoozed() {
    return installState.dismissedAt && (Date.now() - installState.dismissedAt) < SNOOZE_DAYS * 86400000;
  }

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    scheduleShow();
  });

  window.addEventListener('rewind:engaged', () => {
    if (isSnoozed() || installState.installed) return;
    setTimeout(maybeShow, SHOW_AFTER_ENGAGEMENT_MS);
  }, { once: true });

  window.addEventListener('appinstalled', () => {
    installState.installed = true;
    saveState(installState);
    hidePrompt();
    showToast('Installed — find REWIND on your home screen 📼');
  });

  function scheduleShow() {
    if (isSnoozed() || installState.installed) return;
    setTimeout(maybeShow, SHOW_AFTER_MS);
  }

  function maybeShow() {
    if (installState.installed || isSnoozed()) return;

    if (isIOS) {
      headlineEl.textContent = 'Add REWIND to your home screen';
      bodyEl.textContent = 'Tap the Share icon, then "Add to Home Screen." Opens full-screen, no browser bar.';
      confirmBtn.textContent = 'Got it';
    } else {
      headlineEl.textContent = 'Keep REWIND on your shelf';
      bodyEl.textContent = 'Install it once — opens instantly from your home screen, no browser bar, no reloading.';
      confirmBtn.textContent = '▶ Install';
    }

    promptEl.classList.add('show');
  }

  function hidePrompt() {
    promptEl.classList.remove('show');
  }

  function snooze() {
    installState.dismissedAt = Date.now();
    saveState(installState);
    hidePrompt();
  }

  closeBtn.addEventListener('click', snooze);
  dismissBtn.addEventListener('click', snooze);

  confirmBtn.addEventListener('click', async () => {
    if (isIOS) { snooze(); return; }
    if (!deferredPrompt) { snooze(); return; }

    hidePrompt();
    const { outcome } = await deferredPrompt.prompt();
    deferredPrompt = null;

    if (outcome !== 'accepted') {
      installState.dismissedAt = Date.now();
      saveState(installState);
    }
  });

  if (isIOS) scheduleShow();
})();
