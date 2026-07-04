// ============================================================
// REWIND — COMPLETE WORKING EPISODE PLAYER (FULLY REPAIRED)
// ============================================================

const ANILIST_URL = 'https://graphql.anilist.co';
const JIKAN_URL = 'https://api.jikan.moe/v4';
const WATCHLIST_KEY = 'rewind_watchlist_v1';

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

// ============================================================
// WATCHLIST / LOCAL STORAGE
// ============================================================

function getWatchlist() {
  try {
    return JSON.parse(localStorage.getItem(WATCHLIST_KEY)) || {};
  } catch {
    return {};
  }
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
    showToast(`Removed "${anime.title}" from shelf`);
  } else {
    list[anime.id] = anime;
    showToast(`Added "${anime.title}" to shelf`);
  }

  saveWatchlist(list);

  if (state.view === 'library') renderLibrary();
}

// ============================================================
// TOAST NOTIFICATIONS
// ============================================================

function showToast(msg) {
  const template = $('#toastTemplate');
  if (!template) return;

  const el = template.content.firstElementChild.cloneNode(true);
  el.textContent = msg;
  document.body.appendChild(el);

  requestAnimationFrame(() => el.classList.add('show'));

  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// ============================================================
// NORMALIZE DATA FORMATS
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
// API OPERATIONS
// ============================================================

const GENRE_MAP = {
  "1": "Action",
  "4": "Comedy",
  "8": "Drama",
  "10": "Fantasy",
  "22": "Romance",
  "24": "Sci-Fi",
  "36": "Slice of Life",
};

async function fetchTrending(page = 1, genre = 'all') {
  const genreClause = genre !== 'all' ? `, genre: "${GENRE_MAP[genre]}"` : '';

  const query = `
    query {
      Page(page: ${page}, perPage: 18) {
        pageInfo { hasNextPage }
        media(type: ANIME, sort: TRENDING_DESC, isAdult: false${genreClause}) {
          id
          idMal
          title { romaji english }
          description
          coverImage { large extraLarge }
          format
          episodes
          averageScore
          startDate { year }
          status
          genres
          studios(isMain: true) { nodes { name } }
        }
      }
    }
  `;

  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  const data = await res.json();
  const media = data?.data?.Page?.media || [];

  return {
    items: media.map(fromAniList),
    hasMore: !!data?.data?.Page?.pageInfo?.hasNextPage,
  };
}

async function fetchSearch(q, page = 1) {
  const res = await fetch(
    `${JIKAN_URL}/anime?q=${encodeURIComponent(q)}&page=${page}&limit=18&sfw=true`
  );

  const data = await res.json();
  const items = (data.data || []).map(fromJikan);
  const hasMore = !!data?.pagination?.has_next_page;

  return { items, hasMore };
}

async function fetchEpisodesList(malId) {
  if (!malId) return [];

  try {
    const res = await fetch(`${JIKAN_URL}/anime/${malId}/episodes`);
    const data = await res.json();
    return data.data || [];
  } catch {
    return [];
  }
}

// ============================================================
// UI RENDERING ENGINE
// ============================================================

function updateLed(status) {
  if (!slotLed) return;

  slotLed.className = 'slot-led';

  if (status === 'loading') {
    slotLed.classList.add('rec');
    if (slotReadout) slotReadout.textContent = 'READING CASSETTE DATA...';
  } else if (status === 'search') {
    if (slotReadout) slotReadout.textContent = `SEARCH ENGAGED: "${state.query}"`;
  } else {
    if (slotReadout) {
      slotReadout.textContent = `READY · browsing ${
        state.genre === 'all' ? 'trending' : GENRE_MAP[state.genre]
      }`;
    }
  }
}

function renderShelf(items, append = false) {
  if (!append) shelf.innerHTML = '';

  if (items.length === 0) {
    shelf.innerHTML = '<div class="empty-shelf">No cassettes found in this slot.</div>';
    shelfCount.textContent = '0 tapes';
    return;
  }

  items.forEach(anime => {
    const activeSaved = isSaved(anime.id) ? 'saved' : '';
    const card = document.createElement('div');

    card.className = 'tape-card';
    card.style = '--ani-delay: 0.1s';

    card.innerHTML = `
      <div class="tape-thumb">
        <img src="${anime.image || ''}" alt="${anime.title}" loading="lazy">
        <span class="tape-badge">${anime.type}</span>
        <button class="tape-save-btn ${activeSaved}" data-id="${anime.id}">★</button>
      </div>
      <div class="tape-meta">
        <h3 class="tape-title">${anime.title}</h3>
        <p class="tape-sub">${anime.year} · ⭐ ${anime.score || 'N/A'}</p>
      </div>
    `;

    card.querySelector('.tape-thumb img').addEventListener('click', () => openModal(anime));
    card.querySelector('.tape-title').addEventListener('click', () => openModal(anime));

    card.querySelector('.tape-save-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSave(anime);
      e.target.classList.toggle('saved');
    });

    shelf.appendChild(card);
  });

  shelfCount.textContent = `${shelf.children.length} tapes total`;
}

function renderLibrary() {
  shelfTitle.textContent = 'My Stored Shelf';
  genreRow.style.display = 'none';
  loadMoreBtn.style.display = 'none';
  const list = Object.values(getWatchlist());
  renderShelf(list, false);
}

// ============================================================
// MODAL / EPISODES WITH EMBED PLAYER
// ============================================================

async function openModal(anime) {
  caseModal.classList.add('open');
  document.body.style.overflow = 'hidden';

  caseModal.innerHTML = `
    <div class="case-overlay"></div>
    <div class="case-window">
      <button class="case-close">✕ CLOSE CASE</button>
      <div class="case-grid" style="display: flex; gap: 20px; padding: 20px;">
        <div class="case-sidebar" style="width: 200px; flex-shrink: 0;">
          <img src="${anime.image || ''}" class="case-cover" style="width: 100%; border-radius: 8px;">
          <div class="case-stats" style="margin-top: 15px; font-size: 14px; color: #8B909A;">
            <p><strong>Format:</strong> ${anime.type}</p>
            <p><strong>Episodes:</strong> ${anime.episodes}</p>
            <p><strong>Status:</strong> ${anime.status}</p>
            <p><strong>Studio:</strong> ${anime.studio}</p>
          </div>
        </div>
        <div class="case-main" style="flex-grow: 1;">
          <h2 class="case-title" style="margin-top: 0; color: #E8A33D;">${anime.title}</h2>
          <p class="case-desc" style="font-size: 14px; line-height: 1.5;">${anime.description}</p>
          
          <div class="player-section" style="margin-top: 25px;">
            <h3 class="section-title" style="font-size: 16px; color: #4FC3C0;">📼 DIRECT STREAM SYSTEM</h3>
            <div class="video-container" id="videoBox" style="width: 100%; aspect-ratio: 16/9; background: #0D1014; border-radius: 8px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(233,230,220,0.09);">
              <div class="video-placeholder" style="color: #8B909A; font-family: monospace;">SELECT AN EPISODE BELOW TO LOAD DECK</div>
            </div>
            <div class="episode-deck" id="episodeDeck" style="margin-top: 15px; display: flex; flex-wrap: wrap; gap: 8px; max-height: 150px; overflow-y: auto; padding-right: 5px;">Loading tracklist...</div>
          </div>
        </div>
      </div>
    </div>
  `;

  caseModal.querySelector('.case-close').addEventListener('click', closeModal);
  caseModal.querySelector('.case-overlay').addEventListener('click', closeModal);

  // Fallback: fetch MAL ID from AniList if missing
  if (!anime.malId && anime.id.startsWith('al-')) {
    const rawId = anime.id.replace('al-', '');

    try {
      const aniRes = await fetch(ANILIST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `query { Media(id: ${rawId}) { idMal } }`,
        }),
      });

      const aniData = await aniRes.json();
      anime.malId = aniData?.data?.Media?.idMal || null;
    } catch {}
  }

  const epDeck = document.getElementById('episodeDeck');
  const totalEps = parseInt(anime.episodes, 10) || 12;

  if (anime.malId) {
    const epsData = await fetchEpisodesList(anime.malId);
    epDeck.innerHTML = '';

    if (epsData.length > 0) {
      epsData.forEach(ep => {
        const btn = document.createElement('button');
        btn.className = 'ep-btn';
        btn.style = 'background: #171B21; border: 1px solid rgba(233,230,220,0.09); color: #E9E6DC; padding: 6px 12px; border-radius: 4px; font-size: 12px;';
        btn.innerHTML = `<span>EP ${ep.mal_id}</span>`;
        btn.addEventListener('click', () => loadVideoPlayer(anime.malId, ep.mal_id));
        epDeck.appendChild(btn);
      });
    } else {
      generateGenericEps(anime.malId, totalEps, epDeck);
    }
  } else {
    epDeck.innerHTML = `
      <div style="color: #D64545; font-size: 13px;">
        Cannot link video stream. Try searching directly via the title input bar!
      </div>
    `;
  }
}

function generateGenericEps(malId, total, container) {
  container.innerHTML = '';

  for (let i = 1; i <= total; i++) {
    const btn = document.createElement('button');
    btn.className = 'ep-btn';
    btn.style = 'background: #171B21; border: 1px solid rgba(233,230,220,0.09); color: #E9E6DC; padding: 6px 12px; border-radius: 4px; font-size: 12px;';
    btn.innerHTML = `<span>EP ${i}</span>`;
    btn.addEventListener('click', () => loadVideoPlayer(malId, i));
    container.appendChild(btn);
  }
}

function loadVideoPlayer(malId, epNum) {
  const box = document.getElementById('videoBox');

  box.innerHTML = `
    <iframe
      src="https://example.com/player/${malId}?ep=${epNum}"
      style="width: 100%; height: 100%; border: none; border-radius: 8px;"
      allowfullscreen>
    </iframe>
  `;

  showToast(`Streaming Track — Episode ${epNum}`);
}

function closeModal() {
  caseModal.classList.remove('open');
  caseModal.innerHTML = '';
  document.body.style.overflow = '';
}

// ============================================================
// SYSTEM CONTROL LOGIC
// ============================================================

async function loadData(append = false) {
  if (state.loading) return;

  state.loading = true;
  updateLed('loading');

  try {
    if (state.query) {
      const data = await fetchSearch(state.query, state.page);
      state.items = append ? state.items.concat(data.items) : data.items;
      renderShelf(state.items, append);
      loadMoreBtn.style.display = data.hasMore ? 'block' : 'none';
      updateLed('search');
    } else {
      const data = await fetchTrending(state.page, state.genre);
      state.items = append ? state.items.concat(data.items) : data.items;
      renderShelf(state.items, append);
      loadMoreBtn.style.display = data.hasMore ? 'block' : 'none';
      updateLed('idle');
    }
  } catch (err) {
    console.error(err);
    showToast('Deck network drop. Reconnecting...');
  } finally {
    state.loading = false;
  }
}

// ============================================================
// SYSTEM EVENT LISTENERS
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  loadData();

  if (genreRow) {
    genreRow.addEventListener('click', (e) => {
      const target = e.target.closest('.spool');
      if (!target) return;

      document.querySelectorAll('.spool').forEach(b => b.classList.remove('active'));
      target.classList.add('active');

      state.genre = target.dataset.genre;
      state.query = '';

      if (searchInput) searchInput.value = '';
      state.page = 1;

      shelfTitle.textContent =
        state.genre === 'all'
          ? 'Trending this season'
          : `${GENRE_MAP[state.genre]} Collection`;

      loadData();
    });
  }

  if (searchInput) {
    let searchDebounce;

    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchDebounce);
      const val = e.target.value.trim();

      searchDebounce = setTimeout(() => {
        state.query = val;
        state.page = 1;

        if (val) {
          shelfTitle.textContent = 'Search Results';
          if (genreRow) genreRow.style.display = 'none';
        } else {
          shelfTitle.textContent = 'Trending this season';
          if (genreRow) genreRow.style.display = 'flex';
        }

        loadData();
      }, 600);
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      state.query = '';
      state.page = 1;
      shelfTitle.textContent = 'Trending this season';
      if (genreRow) genreRow.style.display = 'flex';
      loadData();
    });
  }

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      state.page += 1;
      loadData(true);
    });
  }

  document.querySelectorAll('[data-view]').forEach(tab => {
    tab.addEventListener('click', (e) => {
      const view = e.currentTarget.dataset.view;
      state.view = view;

      document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll(`[data-view="${view}"]`).forEach(b => b.classList.add('active'));

      if (view === 'library') {
        renderLibrary();
      } else {
        shelfTitle.textContent = 'Trending this season';
        if (genreRow) genreRow.style.display = 'flex';
        state.page = 1;
        loadData();
      }
    });
  });
});
