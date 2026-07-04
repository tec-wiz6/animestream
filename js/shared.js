// ============================================================
// REWIND — shared.js
// Common logic used by every page: data fetching (AniList + Jikan),
// watchlist storage, toasts, the install-prompt component, and the
// tape-card renderer. Loaded before each page's own script.
// ============================================================

const ANILIST_URL = 'https://graphql.anilist.co';
const JIKAN_URL = 'https://api.jikan.moe/v4';
const WATCHLIST_KEY = 'rewind_watchlist_v1';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}

const GENRE_MAP = {
  1: 'Action', 4: 'Comedy', 8: 'Drama', 10: 'Fantasy',
  22: 'Romance', 24: 'Sci-Fi', 36: 'Slice of Life',
};

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
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
    banner: m.bannerImage || null,
    type: m.format || 'TV',
    episodes: m.episodes || '?',
    score: m.averageScore ? (m.averageScore / 10).toFixed(1) : null,
    year: m.startDate?.year || 'TBA',
    status: m.status || 'Unknown',
    genres: m.genres || [],
    studio: m.studios?.nodes?.[0]?.name || 'Unknown studio',
    nextEpisode: m.nextAiringEpisode ? m.nextAiringEpisode.episode : null,
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
    banner: null,
    type: a.type || 'TV',
    episodes: a.episodes || '?',
    score: a.score ? a.score.toFixed(1) : null,
    year: a.year || (a.aired?.from ? a.aired.from.split('-')[0] : 'TBA'),
    status: a.status || 'Unknown',
    genres: (a.genres || []).map(g => g.name),
    studio: a.studios?.[0]?.name || 'Unknown studio',
    nextEpisode: null,
  };
}

// ============================================================
// DATA FETCHING
// ============================================================
async function fetchTrending(page = 1, genre = 'all', { perPage = 18, sort = 'TRENDING_DESC', extraClause = '' } = {}) {
  const genreClause = genre && genre !== 'all' ? `, genre: "${GENRE_MAP[genre]}"` : '';
  const query = `
    query {
      Page(page: ${page}, perPage: ${perPage}) {
        pageInfo { hasNextPage }
        media(type: ANIME, sort: ${sort}, isAdult: false${genreClause}${extraClause}) {
          id idMal title { romaji english } description
          coverImage { large extraLarge } bannerImage format episodes averageScore
          startDate { year } status genres studios(isMain: true) { nodes { name } }
          nextAiringEpisode { episode }
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

// Currently-airing titles, used for the "Latest Episodes" section on Home.
async function fetchAiringNow(page = 1) {
  return fetchTrending(page, 'all', { perPage: 12, sort: 'POPULARITY_DESC', extraClause: ', status: RELEASING' });
}

async function fetchSearch(q, page = 1) {
  const res = await fetch(`${JIKAN_URL}/anime?q=${encodeURIComponent(q)}&page=${page}&limit=18&sfw=true`);
  const data = await res.json();
  const items = (data.data || []).map(fromJikan);
  const hasMore = !!data?.pagination?.has_next_page;
  return { items, hasMore };
}

async function fetchFullByMalId(malId) {
  try {
    const res = await fetch(`${JIKAN_URL}/anime/${malId}/full`);
    const data = await res.json();
    return data.data ? fromJikan(data.data) : null;
  } catch {
    return null;
  }
}

async function fetchRecommendations(malId) {
  try {
    const res = await fetch(`${JIKAN_URL}/anime/${malId}/recommendations`);
    const data = await res.json();
    return (data.data || []).slice(0, 10).map(r => ({
      malId: r.entry.mal_id,
      id: `mal-${r.entry.mal_id}`,
      title: r.entry.title,
      image: r.entry.images?.jpg?.image_url,
    }));
  } catch { return []; }
}

// Resolve a card id (al-123 / mal-456) to a full anime object, checking
// the watchlist cache first so detail/watch pages work without a re-fetch.
async function resolveAnimeById(id) {
  if (!id) return null;
  const saved = getWatchlist()[id];
  if (saved && saved.description) return saved;
  if (id.startsWith('mal-')) {
    return fetchFullByMalId(id.replace('mal-', ''));
  }
  if (id.startsWith('al-')) {
    const alId = id.replace('al-', '');
    const query = `query { Media(id: ${alId}, type: ANIME) {
      id idMal title { romaji english } description coverImage { large extraLarge }
      bannerImage format episodes averageScore startDate { year } status genres
      studios(isMain: true) { nodes { name } } nextAiringEpisode { episode }
    } }`;
    try {
      const res = await fetch(ANILIST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      return data?.data?.Media ? fromAniList(data.data.Media) : null;
    } catch {
      return null;
    }
  }
  return saved || null;
}

// deep-link builder — legal platform search, no scraping/embedding
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
// WATCHLIST (localStorage) — shared across every page
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
    list[anime.id] = anime;
    showToast(`Added "${anime.title}" to your shelf`);
  }
  saveWatchlist(list);
  return !!list[anime.id];
}

// "Continue watching" — lightweight watch-progress tracker, separate from
// the shelf so a title can be in-progress without being explicitly saved.
const PROGRESS_KEY = 'rewind_progress_v1';
function getProgress() {
  try { return JSON.parse(localStorage.getItem(PROGRESS_KEY)) || {}; }
  catch { return {}; }
}
function setProgress(anime, episode) {
  const p = getProgress();
  p[anime.id] = { ...anime, lastEpisode: episode, updatedAt: Date.now() };
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
}

// ============================================================
// TOAST
// ============================================================
function ensureToastHost() {
  if (document.getElementById('toastHost')) return;
  const el = document.createElement('div');
  el.id = 'toastHost';
  document.body.appendChild(el);
}
function showToast(msg) {
  ensureToastHost();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.getElementById('toastHost').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2200);
}

// ============================================================
// TAPE CARD (shared render used on home / shelf / related rows)
// ============================================================
function qualityBars(score) {
  const n = score ? Math.round(parseFloat(score)) : 0;
  const bars = Math.min(5, Math.max(0, Math.round(n / 2)));
  return Array.from({ length: 5 }, (_, i) =>
    `<span class="bar ${i < bars ? 'on' : ''}"></span>`).join('');
}

function tapeCardHTML(anime, i = 0) {
  const saved = isSaved(anime.id);
  const runtime = anime.episodes && anime.episodes !== '?' ? `EP 01/${String(anime.episodes).padStart(2, '0')}` : '00:00:00';
  return `
    <a class="tape" href="detail.html?id=${encodeURIComponent(anime.id)}" data-id="${anime.id}" style="animation-delay:${Math.min(i * 30, 300)}ms">
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
    </a>`;
}

function attachTapeCardEvents(container) {
  container.querySelectorAll('[data-save]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.save;
      const card = btn.closest('[data-id]');
      const cachedAnime = window.__animeCache && window.__animeCache[id];
      const anime = cachedAnime || getWatchlist()[id];
      if (!anime) return;
      const nowSaved = toggleSave(anime);
      btn.classList.toggle('saved', nowSaved);
      btn.textContent = nowSaved ? '★' : '☆';
    });
  });
}

function cacheAnime(list) {
  window.__animeCache = window.__animeCache || {};
  list.forEach(a => { window.__animeCache[a.id] = a; });
}

function renderSkeletonInto(el, count = 12) {
  el.innerHTML = Array.from({ length: count }, () => `<div class="skeleton"></div>`).join('');
}

// ============================================================
// INSTALL PROMPT — injected on every page, delayed + engagement-triggered
// ============================================================
function injectInstallPrompt() {
  if (document.getElementById('installPrompt')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="install-prompt" id="installPrompt">
      <div class="install-card">
        <button class="install-close" id="installClose" aria-label="Dismiss">✕</button>
        <div class="install-icon">📼</div>
        <div class="install-copy">
          <h3 id="installHeadline">Keep REWIND on your shelf</h3>
          <p id="installBody">Install it once — opens instantly from your home screen, no browser bar, no reloading the search.</p>
        </div>
        <div class="install-actions">
          <button class="btn btn-amber" id="installConfirm">▶ Install</button>
          <button class="btn btn-ghost" id="installDismiss">Not now</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(wrap.firstElementChild);
}

(function initInstallPrompt() {
  document.addEventListener('DOMContentLoaded', () => {
    injectInstallPrompt();

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

    let state = loadState();
    if (state.installed || isStandalone) {
      if (isStandalone && !state.installed) { state.installed = true; saveState(state); }
      return;
    }

    function isSnoozed() {
      return state.dismissedAt && (Date.now() - state.dismissedAt) < SNOOZE_DAYS * 86400000;
    }

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    let deferredPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      scheduleShow();
    });

    window.addEventListener('rewind:engaged', () => {
      if (isSnoozed() || state.installed) return;
      setTimeout(maybeShow, SHOW_AFTER_ENGAGEMENT_MS);
    }, { once: true });

    window.addEventListener('appinstalled', () => {
      state.installed = true;
      saveState(state);
      hidePrompt();
      showToast('Installed — find REWIND on your home screen 📼');
    });

    function scheduleShow() {
      if (isSnoozed() || state.installed) return;
      setTimeout(maybeShow, SHOW_AFTER_MS);
    }

    function maybeShow() {
      if (state.installed || isSnoozed()) return;
      if (isIOS) {
        headlineEl.textContent = 'Add REWIND to your home screen';
        bodyEl.textContent = 'Tap the Share icon, then "Add to Home Screen." Opens full-screen, no browser bar.';
        confirmBtn.textContent = 'Got it';
      } else {
        headlineEl.textContent = 'Keep REWIND on your shelf';
        bodyEl.textContent = "Install it once — opens instantly from your home screen, no browser bar, no reloading the search.";
        confirmBtn.textContent = '▶ Install';
      }
      promptEl.classList.add('show');
    }

    function hidePrompt() { promptEl.classList.remove('show'); }

    function snooze() {
      state.dismissedAt = Date.now();
      saveState(state);
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
        state.dismissedAt = Date.now();
        saveState(state);
      }
    });

    if (isIOS) scheduleShow();
  });
})();
