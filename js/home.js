// ============================================================
// REWIND — home.js
// ============================================================
const $ = (sel) => document.querySelector(sel);

const heroEl = $('#hero');
const continueRow = $('#continueRow');
const airingRow = $('#airingRow');
const trendingGrid = $('#trendingGrid');
const homeSections = $('#homeSections');
const heroSection = $('#hero');
const genreRowEl = $('#genreRow');
const searchInput = $('#searchInput');
const clearSearchBtn = $('#clearSearch');
const slotLed = $('#slotLed');
const slotReadout = $('#slotReadout');
const searchResultsContainer = $('#searchResultsContainer');
const shelf = $('#shelf');
const shelfTitle = $('#shelfTitle');
const shelfCount = $('#shelfCount');
const loadMoreBtn = $('#loadMore');

let heroItems = [];
let heroIndex = 0;
let heroTimer = null;
let searchState = { query: '', genre: 'all', page: 1, items: [] };

// ============================================================
// HERO SPOTLIGHT
// ============================================================
function heroSlideHTML(anime, i) {
  const bg = anime.banner || anime.image || '';
  return `
    <div class="hero-slide ${i === 0 ? 'active' : ''}" data-i="${i}">
      <div class="bg" style="background-image:url('${bg}')"></div>
      <div class="hero-content">
        <div class="hero-eyebrow">#${i + 1} SPOTLIGHT</div>
        <h1 class="hero-title">${escapeHtml(anime.title)}</h1>
        <div class="hero-meta">
          <span>▶ ${anime.type}</span>
          <span>🕐 ${anime.episodes} eps</span>
          <span>${anime.year}</span>
          ${anime.score ? `<span>★ ${anime.score}</span>` : ''}
        </div>
        <p class="hero-desc">${escapeHtml(anime.description)}</p>
        <div class="hero-actions">
          <a class="btn btn-pink btn-lg" href="watch.html?id=${encodeURIComponent(anime.id)}&ep=1">▶ Watch Now</a>
          <a class="btn btn-ghost btn-lg" href="detail.html?id=${encodeURIComponent(anime.id)}">Detail →</a>
        </div>
      </div>
    </div>`;
}

function renderHero(items) {
  heroItems = items.slice(0, 6);
  cacheAnime(heroItems);
  heroEl.innerHTML = heroItems.map(heroSlideHTML).join('') + `
    <div class="hero-dots">${heroItems.map((_, i) => `<span class="${i === 0 ? 'active' : ''}"></span>`).join('')}</div>
    <div class="hero-nav">
      <button id="heroPrev">‹</button>
      <button id="heroNext">›</button>
    </div>`;
  $('#heroPrev').addEventListener('click', () => showHero(heroIndex - 1));
  $('#heroNext').addEventListener('click', () => showHero(heroIndex + 1));
  startHeroTimer();
}

function showHero(i) {
  heroIndex = (i + heroItems.length) % heroItems.length;
  heroEl.querySelectorAll('.hero-slide').forEach(s => s.classList.toggle('active', +s.dataset.i === heroIndex));
  heroEl.querySelectorAll('.hero-dots span').forEach((d, idx) => d.classList.toggle('active', idx === heroIndex));
  startHeroTimer();
}
function startHeroTimer() {
  clearInterval(heroTimer);
  heroTimer = setInterval(() => showHero(heroIndex + 1), 7000);
}

// ============================================================
// CONTINUE WATCHING
// ============================================================
function renderContinue() {
  const progress = Object.values(getProgress()).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  const section = continueRow.closest('.section');
  if (progress.length === 0) { section.style.display = 'none'; return; }
  section.style.display = '';
  continueRow.innerHTML = progress.map(a => {
    const pct = a.episodes && a.episodes !== '?' ? Math.min(100, Math.round((a.lastEpisode / a.episodes) * 100)) : 30;
    return `
      <a class="continue-card" href="watch.html?id=${encodeURIComponent(a.id)}&ep=${a.lastEpisode}">
        <div class="thumb">
          ${a.image ? `<img src="${a.image}" alt="${escapeHtml(a.title)}">` : ''}
          <div class="barwrap"><div class="bar" style="width:${pct}%"></div></div>
        </div>
        <div class="meta">
          <div class="t">${escapeHtml(a.title)}</div>
          <div class="ep">EP ${a.lastEpisode} · resume</div>
        </div>
      </a>`;
  }).join('');
}

// ============================================================
// LATEST EPISODES (currently airing)
// ============================================================
async function renderAiring() {
  try {
    const { items } = await fetchAiringNow(1);
    cacheAnime(items);
    airingRow.innerHTML = items.map((a, i) => `
      <a class="tape" href="detail.html?id=${encodeURIComponent(a.id)}" style="width:170px;flex-shrink:0;animation-delay:${i * 30}ms">
        <div class="tape-art">
          ${a.image ? `<img src="${a.image}" alt="${escapeHtml(a.title)}" loading="lazy">` : `<div class="tape-fallback">📼</div>`}
          <div class="tape-static"></div>
          <span class="tape-type">${a.nextEpisode ? `EP ${a.nextEpisode - 1} OUT` : a.type}</span>
          <div class="tape-title-bar"><div class="t">${escapeHtml(a.title)}</div></div>
        </div>
        <div class="tape-stub">
          <div class="tape-quality">${qualityBars(a.score)}</div>
          <span class="tape-counter">${a.type}</span>
        </div>
      </a>`).join('');
  } catch { airingRow.closest('.section').style.display = 'none'; }
}

// ============================================================
// TRENDING GRID
// ============================================================
async function renderTrending() {
  renderSkeletonInto(trendingGrid, 12);
  try {
    const { items } = await fetchTrending(1, 'all');
    cacheAnime(items);
    trendingGrid.innerHTML = items.map((a, i) => tapeCardHTML(a, i)).join('');
    attachTapeCardEvents(trendingGrid);
  } catch {
    trendingGrid.innerHTML = `<div class="shelf-empty"><div class="glyph">⚠️</div><h3>Signal lost</h3><p>Couldn't reach the tape library.</p></div>`;
  }
}

// ============================================================
// SEARCH / GENRE MODE (swaps home sections out for a results grid)
// ============================================================
function enterSearchMode() {
  homeSections.style.display = 'none';
  heroSection.style.display = 'none';
  searchResultsContainer.style.display = '';
}
function exitSearchMode() {
  homeSections.style.display = '';
  heroSection.style.display = '';
  searchResultsContainer.style.display = 'none';
}

async function runSearch(q, page = 1, append = false) {
  enterSearchMode();
  slotLed.classList.add('rec');
  if (!append) renderSkeletonInto(shelf);
  try {
    const { items, hasMore } = await fetchSearch(q, page);
    cacheAnime(items);
    searchState.items = append ? searchState.items.concat(items) : items;
    searchState.page = page;
    if (!append) shelf.innerHTML = '';
    shelf.insertAdjacentHTML('beforeend', items.map((a, i) => tapeCardHTML(a, i)).join(''));
    attachTapeCardEvents(shelf);
    shelfTitle.textContent = `Results for "${q}"`;
    shelfCount.textContent = `${searchState.items.length} found`;
    loadMoreBtn.style.display = hasMore ? 'block' : 'none';
    slotReadout.textContent = `PLAYING · search results for "${q}"`;
    if (items.length === 0 && !append) {
      shelf.innerHTML = `<div class="shelf-empty"><div class="glyph">📼</div><h3>No tapes found</h3><p>Try another title.</p></div>`;
    }
  } catch {
    shelf.innerHTML = `<div class="shelf-empty"><div class="glyph">⚠️</div><h3>Tape jammed</h3><p>Search failed — try again.</p></div>`;
  } finally {
    slotLed.classList.remove('rec');
  }
}

async function runGenre(genre, page = 1, append = false) {
  enterSearchMode();
  if (!append) renderSkeletonInto(shelf);
  try {
    const { items, hasMore } = await fetchTrending(page, genre);
    cacheAnime(items);
    searchState.items = append ? searchState.items.concat(items) : items;
    searchState.page = page;
    if (!append) shelf.innerHTML = '';
    shelf.insertAdjacentHTML('beforeend', items.map((a, i) => tapeCardHTML(a, i)).join(''));
    attachTapeCardEvents(shelf);
    shelfTitle.textContent = genre === 'all' ? 'Trending this season' : `${GENRE_MAP[genre]} tapes`;
    shelfCount.textContent = `${searchState.items.length} shown`;
    loadMoreBtn.style.display = hasMore ? 'block' : 'none';
  } catch {
    shelf.innerHTML = `<div class="shelf-empty"><div class="glyph">⚠️</div><h3>Signal lost</h3><p>Try again.</p></div>`;
  }
}

let searchDebounce = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  const q = searchInput.value.trim();
  if (!q) { exitSearchMode(); return; }
  searchDebounce = setTimeout(() => {
    searchState.query = q;
    searchState.genre = 'all';
    setActiveSpool('all');
    runSearch(q, 1, false);
  }, 450);
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { clearTimeout(searchDebounce); const q = searchInput.value.trim(); if (q) runSearch(q, 1, false); }
});
clearSearchBtn.addEventListener('click', () => { searchInput.value = ''; exitSearchMode(); });

genreRowEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.spool');
  if (!btn) return;
  searchInput.value = '';
  searchState.genre = btn.dataset.genre;
  setActiveSpool(searchState.genre);
  if (searchState.genre === 'all') { exitSearchMode(); return; }
  runGenre(searchState.genre, 1, false);
});
function setActiveSpool(genre) {
  genreRowEl.querySelectorAll('.spool').forEach(b => b.classList.toggle('active', b.dataset.genre === genre));
}

loadMoreBtn.addEventListener('click', () => {
  if (searchState.genre !== 'all') runGenre(searchState.genre, searchState.page + 1, true);
  else runSearch(searchState.query, searchState.page + 1, true);
});

// ============================================================
// INIT
// ============================================================
(async function init() {
  const { items } = await fetchTrending(1, 'all', { perPage: 6, sort: 'TRENDING_DESC' });
  renderHero(items);
  renderContinue();
  renderAiring();
  renderTrending();
})();
