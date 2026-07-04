// ============================================================
// REWIND — anime discovery & tracker WITH VIDEO PLAYER
// Data sources: AniList (GraphQL) + Jikan (MyAnimeList REST)
// Video: Backend API (AnimePahe via cloudscraper)
// ============================================================

// ============================================================
// API CONFIGURATION - LINKS FRONTEND TO BACKEND
// ============================================================
const API_BASE = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : 'https://anime-stream-backend.vercel.app/api';  // ✅ YOUR BACKEND

const ANILIST_URL = 'https://graphql.anilist.co';
const JIKAN_URL = 'https://api.jikan.moe/v4';
const WATCHLIST_KEY = 'rewind_watchlist_v1';

// ---- state ----
let state = {
  view: 'home',            // 'home' | 'library'
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
// NORMALIZE — AniList & Jikan shapes into one card model
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

// Genre name -> AniList genre string
const GENRE_MAP = {
  1: 'Action', 4: 'Comedy', 8: 'Drama', 10: 'Fantasy',
  22: 'Romance', 24: 'Sci-Fi', 36: 'Slice of Life',
};

// ============================================================
// RENDERING — shelf grid
// ============================================================
function qualityBars(score) {
  const n = score ? Math.round(parseFloat(score)) : 0; // 0-10 -> approximate 0-5 bars
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
          <button class="btn btn-amber btn-save ${saved ? 'saved' : ''}" id="caseSaveBtn">
            ${saved ? '★ On your shelf' : '☆ Add to shelf'}
          </button>
          ${anime.malId ? `<a class="btn btn-ghost" href="https://myanimelist.net/anime/${anime.malId}" target="_blank" rel="noopener">MAL page ↗</a>` : ''}
          <button class="btn btn-ghost" onclick="searchAnimePahe('${escapeHtml(anime.title)}')">🎬 Find on AnimePahe</button>
        </div>
      </div>
    </div>

    <div class="watch-block">
      <h4>Where to watch</h4>
      <div class="watch-grid">
        ${watchLinks.map(l => `<a class="watch-link" href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`).join('')}
      </div>
      <div class="watch-note">Opens a search on each platform — availability varies by region and licensing. REWIND doesn't host or stream video.</div>
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

  $('#caseClose').addEventListener('click', closeCase);
  $('#caseSaveBtn').addEventListener('click', () => {
    const nowSaved = toggleSave(anime);
    $('#caseSaveBtn').classList.toggle('saved', nowSaved);
    $('#caseSaveBtn').textContent = nowSaved ? '★ On your shelf' : '☆ Add to shelf';
  });
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
// ANIMEPAHE SEARCH & PLAY (NEW!)
// ============================================================
async function searchAnimePahe(query) {
  showToast(`🔍 Searching AnimePahe for "${query}"...`);
  try {
    const response = await fetch(`${API_BASE}/search?q=${encodeURIComponent(query)}`);
    const data = await response.json();
    
    if (data.success && data.results && data.results.length > 0) {
      // Show first result in toast
      const first = data.results[0];
      showToast(`✅ Found: ${first.title} (${first.episodes} episodes)`);
      
      // Open a mini modal or just play the first episode
      if (confirm(`Found "${first.title}" on AnimePahe. Watch now?`)) {
        // Get episodes for this anime
        const epResponse = await fetch(`${API_BASE}/episodes?id=${first.id}`);
        const epData = await epResponse.json();
        
        if (epData.success && epData.episodes && epData.episodes.length > 0) {
          // Play the first episode
          const firstEp = epData.episodes[0];
          playEpisode(firstEp.id, `Episode ${firstEp.episode}`, first.title);
        }
      }
    } else {
      showToast('❌ No results found on AnimePahe');
    }
  } catch (error) {
    console.error('AnimePahe search error:', error);
    showToast('❌ Failed to search AnimePahe');
  }
}

// ============================================================
// VIDEO PLAYER (NEW!)
// ============================================================
async function playEpisode(episodeId, episodeTitle, animeTitle) {
  const playerModal = document.getElementById('playerModal');
  const playerTitle = document.getElementById('playerTitle');
  const playerWrapper = document.getElementById('playerWrapper');
  
  if (!playerModal) {
    showToast('⚠️ Player not found. Check your HTML.');
    return;
  }
  
  playerTitle.textContent = `${animeTitle} - ${episodeTitle}`;
  playerModal.classList.add('open');
  
  // Show loading
  playerWrapper.innerHTML = `
    <div style="text-align:center;padding:40px;color:var(--paper-dim);">
      <div class="spinner" style="width:40px;height:40px;border:3px solid rgba(255,255,255,0.1);border-top-color:var(--amber);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px;"></div>
      <p>Loading video...</p>
    </div>
  `;
  
  try {
    const response = await fetch(`${API_BASE}/video?id=${episodeId}`);
    const data = await response.json();
    
    if (data.success && data.videoUrl) {
      playerWrapper.innerHTML = `<video id="videoPlayer" controls playsinline></video>`;
      const video = document.getElementById('videoPlayer');
      
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true
        });
        hls.loadSource(data.videoUrl);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {});
        });
        video._hls = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = data.videoUrl;
        video.addEventListener('loadedmetadata', () => {
          video.play().catch(() => {});
        });
      } else {
        showToast('⚠️ HLS not supported in this browser.');
      }
    } else {
      playerWrapper.innerHTML = `
        <div style="text-align:center;padding:40px;color:var(--paper-dim);">
          <p style="font-size:48px;margin-bottom:16px;">📼</p>
          <p>No video link found.</p>
          <p style="font-size:12px;margin-top:8px;">Try a different episode or source.</p>
        </div>
      `;
    }
  } catch (error) {
    console.error('Player error:', error);
    playerWrapper.innerHTML = `
      <div style="text-align:center;padding:40px;color:var(--paper-dim);">
        <p style="font-size:48px;margin-bottom:16px;">⚠️</p>
        <p>Failed to load video.</p>
        <p style="font-size:12px;margin-top:8px;">${error.message}</p>
      </div>
    `;
  }
}

function closePlayer() {
  const playerModal = document.getElementById('playerModal');
  const video = document.getElementById('videoPlayer');
  if (video) {
    if (video._hls) {
      video._hls.destroy();
      delete video._hls;
    }
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
  if (playerModal) {
    playerModal.classList.remove('open');
  }
  const playerWrapper = document.getElementById('playerWrapper');
  if (playerWrapper) {
    playerWrapper.innerHTML = `<video id="videoPlayer" controls playsinline></video>`;
  }
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
  if (e.key === 'Escape' && caseModal.classList.contains('open')) closeCase(); 
  if (e.key === 'Escape') {
    const playerModal = document.getElementById('playerModal');
    if (playerModal?.classList.contains('open')) closePlayer();
  }
});

// Close player button event
document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('closePlayer');
  if (closeBtn) {
    closeBtn.addEventListener('click', closePlayer);
  }
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
// INIT
// ============================================================
loadHome(1, false);
console.log('📼 REWIND loaded — with AnimePahe video streaming!');
console.log('📡 API:', API_BASE);
