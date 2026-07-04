// ============================================================
// REWIND — Complete Version with Mobile Video Player
// ============================================================

// API Configuration
const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : 'https://anime-stream-backend.vercel.app/api';

const ANILIST_URL = 'https://graphql.anilist.co';
const JIKAN_URL = 'https://api.jikan.moe/v4';
const WATCHLIST_KEY = 'rewind_watchlist_v1';

// ============================================================
// EMBED SOURCES - Mobile-friendly video players
// ============================================================
const EMBED_SOURCES = {
    vidsrc: {
        name: 'VidSrc',
        url: (animeId, episode) => `https://vidsrc.to/embed/anime/${animeId}/${episode}`,
        active: true
    },
    embedsu: {
        name: 'Embed.su',
        url: (animeId, episode) => `https://embed.su/embed/anime/${animeId}/${episode}`,
        active: true
    },
    vidsrccc: {
        name: 'VidSrc.cc',
        url: (animeId, episode) => `https://vidsrc.cc/v2/embed/anime/${animeId}/${episode}`,
        active: true
    }
};

let currentSource = 'vidsrc';
let currentAnimeId = null;
let currentEpisode = null;

// ---- state ----
let state = {
  view: 'home',
  genre: 'all',
  query: '',
  page: 1,
  items: [],
  loading: false,
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
// WATCHLIST (localStorage)
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
    list[anime.id] = { id: anime.id, title: anime.title, image: anime.image, type: anime.type, score: anime.score };
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
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2200);
}

// ============================================================
// NORMALIZE — AniList & Jikan shapes
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
// DATA FETCHING
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

async function fetchRecommendations(malId) {
  try {
    const res = await fetch(`${JIKAN_URL}/anime/${malId}/recommendations`);
    const data = await res.json();
    return (data.data || []).slice(0, 8).map(r => ({
      malId: r.entry.mal_id,
      title: r.entry.title,
      image: r.entry.images?.jpg?.image_url,
    }));
  } catch { return []; }
}

const GENRE_MAP = {
  1: 'Action', 4: 'Comedy', 8: 'Drama', 10: 'Fantasy',
  22: 'Romance', 24: 'Sci-Fi', 36: 'Slice of Life',
};

// ============================================================
// RENDERING — shelf grid
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
// DETAIL CASE (modal)
// ============================================================
async function openCase(anime) {
  caseModal.classList.add('open');
  document.body.style.overflow = 'hidden';
  caseContent.innerHTML = caseSkeletonHTML();
  window.dispatchEvent(new CustomEvent('rewind:engaged'));

  let full = anime;
  if (anime.malId) {
    const fetched = await fetchFullByMalId(anime.malId).catch(() => null);
    if (fetched) full = { ...fetched, id: anime.id };
  }
  const recs = full.malId ? await fetchRecommendations(full.malId) : [];
  renderCase(full, recs);
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

function renderCase(anime, recs) {
  const saved = isSaved(anime.id);
  const watchLinks = buildWatchLinks(anime.title);
  const hasAnimeId = anime.id && !anime.id.startsWith('mal-');
  
  // Get MAL ID for embedding
  const malId = anime.malId || anime.id.replace('al-', '');

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
          <span>${anime.episodes} eps</span>
          <span>${anime.score ? '★ ' + anime.score : 'unrated'}</span>
          <span>${escapeHtml(anime.studio)}</span>
        </div>
        <div class="case-synopsis">${escapeHtml(anime.description)}</div>
        <div class="case-actions">
          <button class="btn btn-amber" id="playBtn">▶ Play Now</button>
          <button class="btn btn-amber btn-save ${saved ? 'saved' : ''}" id="caseSaveBtn">
            ${saved ? '★ On your shelf' : '☆ Add to shelf'}
          </button>
          ${hasAnimeId ? `<button class="btn btn-cyan" id="findEpisodesBtn">📺 Find Episodes</button>` : ''}
          ${anime.malId ? `<a class="btn btn-ghost" href="https://myanimelist.net/anime/${anime.malId}" target="_blank" rel="noopener">MAL page ↗</a>` : ''}
        </div>
      </div>
    </div>

    <div class="watch-block">
      <h4>Where to watch</h4>
      <div class="watch-grid">
        ${watchLinks.map(l => `<a class="watch-link" href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`).join('')}
      </div>
      <div class="watch-note">Opens a search on each platform — availability varies by region and licensing.</div>
    </div>

    ${recs.length ? `
    <div class="rec-block">
      <h4>More like this</h4>
      <div class="rec-row">
        ${recs.map(r => `
          <div class="rec-card" data-malid="${r.malId}">
            ${r.image ? `<img src="${r.image}" alt="${escapeHtml(r.title)}">` : ''}
            <div class="t">${escapeHtml(r.title)}</div>
          </div>`).join('')}
      </div>
    </div>` : ''}
  `;

  // Event listeners
  $('#caseClose').addEventListener('click', closeCase);
  
  $('#caseSaveBtn').addEventListener('click', () => {
    const nowSaved = toggleSave(anime);
    $('#caseSaveBtn').classList.toggle('saved', nowSaved);
    $('#caseSaveBtn').textContent = nowSaved ? '★ On your shelf' : '☆ Add to shelf';
  });
  
  // Play button - uses mobile-friendly embed player
  const playBtn = document.getElementById('playBtn');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      const episodeNum = 1; // Start with episode 1
      playEpisodeMobile(malId, episodeNum, anime.title);
    });
  }
  
  // Find Episodes button
  const findBtn = document.getElementById('findEpisodesBtn');
  if (findBtn) {
    findBtn.addEventListener('click', () => {
      const animeId = anime.id.replace('al-', '');
      findEpisodes(animeId, anime.title);
    });
  }
  
  caseContent.querySelectorAll('.rec-card').forEach(card => {
    card.addEventListener('click', async () => {
      const malId = card.dataset.malid;
      const full = await fetchFullByMalId(malId);
      if (full) openCase(full);
    });
  });
}

function closeCase() {
  caseModal.classList.remove('open');
  document.body.style.overflow = '';
}

// ============================================================
// FIND EPISODES - Gets episode list from backend
// ============================================================
async function findEpisodes(animeId, animeTitle) {
  showToast(`📺 Finding episodes for "${animeTitle}"...`);
  
  try {
    const response = await fetch(`${API_BASE}/episodes?id=${animeId}`);
    const data = await response.json();
    
    if (data.success && data.episodes && data.episodes.length > 0) {
      showEpisodeList(data.episodes, animeTitle);
    } else {
      showToast('❌ No episodes found for this anime');
    }
  } catch (error) {
    console.error('Episodes error:', error);
    showToast('❌ Failed to load episodes');
  }
}

// ============================================================
// SHOW EPISODE LIST - Displays all episodes in modal
// ============================================================
function showEpisodeList(episodes, animeTitle) {
  const caseContent = document.getElementById('caseContent');
  const malId = episodes.length > 0 ? episodes[0].id.split('-')[0] : '1';
  
  let episodeHTML = `
    <div class="episode-list-container">
      <div class="episode-list-header">
        <h3>📺 ${animeTitle} - All Episodes</h3>
        <span class="episode-count">${episodes.length} episodes</span>
      </div>
      <div class="episode-list-grid">
  `;
  
  episodes.forEach((ep, index) => {
    const epNum = ep.episode || index + 1;
    const epTitle = ep.title || `Episode ${epNum}`;
    
    episodeHTML += `
      <div class="episode-item" data-episode-id="${ep.id}" data-episode-num="${epNum}">
        <div class="episode-info">
          <span class="episode-number">EP ${String(epNum).padStart(2, '0')}</span>
          <span class="episode-title">${escapeHtml(epTitle)}</span>
        </div>
        <div class="episode-actions">
          <button class="ep-btn play-btn" onclick="playEpisodeMobile('${malId}', ${epNum}, '${escapeHtml(animeTitle)}')" title="Watch">
            ▶
          </button>
          <button class="ep-btn download-btn" onclick="downloadEpisode('${ep.id}', '${escapeHtml(animeTitle)}', ${epNum})" title="Download">
            ⬇
          </button>
          <button class="ep-btn save-btn" onclick="saveEpisode('${ep.id}', '${escapeHtml(animeTitle)}', ${epNum})" title="Save to shelf">
            ☆
          </button>
        </div>
      </div>
    `;
  });
  
  episodeHTML += `
      </div>
    </div>
  `;
  
  caseContent.innerHTML = episodeHTML;
}

// ============================================================
// MOBILE-FRIENDLY VIDEO PLAYER (Iframe Embeds)
// ============================================================

// ============================================================
// PLAY EPISODE - MOBILE FRIENDLY
// ============================================================
function playEpisodeMobile(animeId, episodeNum, animeTitle) {
    currentAnimeId = animeId;
    currentEpisode = episodeNum;
    
    const playerModal = document.getElementById('playerModal');
    const playerTitle = document.getElementById('playerTitle');
    
    if (!playerModal) {
        showToast('⚠️ Player not found');
        return;
    }
    
    playerTitle.textContent = `${animeTitle} - EP ${episodeNum}`;
    playerModal.classList.add('open');
    
    // Load the embed
    loadEmbed(animeId, episodeNum, currentSource);
    
    // Update active source button
    document.querySelectorAll('.source-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.source === currentSource);
    });
}

// ============================================================
// LOAD EMBED
// ============================================================
function loadEmbed(animeId, episodeNum, sourceKey) {
    const source = EMBED_SOURCES[sourceKey];
    if (!source) return;
    
    const iframe = document.getElementById('videoIframe');
    if (!iframe) return;
    
    const embedUrl = source.url(animeId, episodeNum);
    iframe.src = embedUrl;
    
    console.log(`📺 Loading ${source.name}: ${embedUrl}`);
}

// ============================================================
// SWITCH SOURCE (For mobile)
// ============================================================
function switchSource(sourceKey) {
    if (!EMBED_SOURCES[sourceKey]) return;
    
    currentSource = sourceKey;
    
    // Update buttons
    document.querySelectorAll('.source-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.source === sourceKey);
    });
    
    // Reload embed with new source
    if (currentAnimeId && currentEpisode) {
        loadEmbed(currentAnimeId, currentEpisode, sourceKey);
        showToast(`Switched to ${EMBED_SOURCES[sourceKey].name}`);
    }
}

// ============================================================
// CLOSE PLAYER (Mobile)
// ============================================================
function closePlayerMobile() {
    const playerModal = document.getElementById('playerModal');
    const iframe = document.getElementById('videoIframe');
    
    if (iframe) {
        iframe.src = 'about:blank'; // Stop video
    }
    
    if (playerModal) {
        playerModal.classList.remove('open');
    }
}

// ============================================================
// DOWNLOAD EPISODE - Fallback download method
// ============================================================
async function downloadEpisode(episodeId, animeTitle, episodeNum) {
  showToast(`⬇ Downloading ${animeTitle} - Episode ${episodeNum}...`);
  
  try {
    const response = await fetch(`${API_BASE}/video?id=${episodeId}`);
    const data = await response.json();
    
    if (data.success && data.selected && data.selected.url) {
      const videoUrl = data.selected.url;
      const filename = `${animeTitle.replace(/[^a-zA-Z0-9]/g, '_')}_EP${String(episodeNum).padStart(2, '0')}.mp4`;
      
      const videoResponse = await fetch(videoUrl);
      const blob = await videoResponse.blob();
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(link.href), 5000);
      
      showToast(`✅ Downloaded ${filename}`);
    } else {
      showToast('💡 Try right-clicking the video and selecting "Save Video As..."');
    }
  } catch (error) {
    console.error('Download error:', error);
    showToast('💡 Right-click the video and select "Save Video As..."');
  }
}

// ============================================================
// SAVE EPISODE
// ============================================================
function saveEpisode(episodeId, animeTitle, episodeNum) {
  const saved = getWatchlist();
  const key = `ep-${episodeId}`;
  
  if (saved[key]) {
    delete saved[key];
    showToast(`Removed EP ${episodeNum} from shelf`);
  } else {
    saved[key] = {
      id: episodeId,
      title: `${animeTitle} - EP ${episodeNum}`,
      type: 'episode',
      episode: episodeNum,
      anime: animeTitle
    };
    showToast(`⭐ Added EP ${episodeNum} to shelf`);
  }
  saveWatchlist(saved);
}

// ============================================================
// deep-link builder — legal platform search
// ============================================================
function buildWatchLinks(title) {
  const q = encodeURIComponent(title);
  return [
    { label: '🔎 JustWatch (all platforms)', url: `https://www.justwatch.com/us/search?q=${q}` },
    { label: 'Crunchyroll', url: `https://www.crunchyroll.com/search?q=${q}` },
    { label: 'Netflix', url: `https://www.netflix.com/search?q=${q}` },
    { label: 'HIDIVE', url: `https://www.hidive.com/search?q=${q}` },
    { label: 'Prime Video', url: `https://www.amazon.com/s?k=${q}&i=instant-video` },
    { label: 'YouTube', url: `https://www.youtube.com/results?search_query=${q}+official` },
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
  if (e.key === 'Enter') { clearTimeout(searchDebounce); const q = searchInput.value.trim(); if (q) loadSearch(q, 1, false); }
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
document.addEventListener('keydown', (e) => { 
  if (e.key === 'Escape') {
    if (caseModal.classList.contains('open')) closeCase();
    const playerModal = document.getElementById('playerModal');
    if (playerModal?.classList.contains('open')) closePlayerMobile();
  }
});

document.addEventListener('DOMContentLoaded', () => {
    // Source switcher buttons
    document.querySelectorAll('.source-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchSource(btn.dataset.source);
        });
    });
    
    // Close player
    const closeBtn = document.getElementById('closePlayer');
    if (closeBtn) {
        closeBtn.addEventListener('click', closePlayerMobile);
    }
    
    // Escape key for player
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const playerModal = document.getElementById('playerModal');
            if (playerModal?.classList.contains('open')) {
                closePlayerMobile();
            }
        }
    });
});

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
// INSTALL PROMPT
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

  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
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
      bodyEl.textContent = "Install it once — opens instantly from your home screen, no browser bar, no reloading the search.";
      confirmBtn.textContent = '▶ Install';
    }
    if (promptEl) promptEl.classList.add('show');
  }

  function hidePrompt() {
    if (promptEl) promptEl.classList.remove('show');
  }

  function snooze() {
    installState.dismissedAt = Date.now();
    saveState(installState);
    hidePrompt();
  }

  if (closeBtn) closeBtn.addEventListener('click', snooze);
  if (dismissBtn) dismissBtn.addEventListener('click', snooze);

  if (confirmBtn) {
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
  }

  if (isIOS) scheduleShow();
})();

// ============================================================
// INIT
// ============================================================
loadHome(1, false);
console.log('📼 REWIND loaded — with mobile-friendly video player!');
console.log('📡 API:', API_BASE);
console.log('🎬 Embed sources:', Object.keys(EMBED_SOURCES).join(', '));
