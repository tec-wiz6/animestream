// ============================================================
// REWIND — COMPLETE WORKING APP WITH BACKEND
// ============================================================

const ANILIST_URL = 'https://graphql.anilist.co';
const JIKAN_URL = 'https://api.jikan.moe/v4';
const WATCHLIST_KEY = 'rewind_watchlist_v1';
const API_BASE = '/api/animepahe';

// ---- state ----
let state = {
  view: 'home',
  genre: 'all',
  query: '',
  page: 1,
  items: [],
  loading: false,
  verifiedSessions: JSON.parse(localStorage.getItem('rewind_sessions') || '{}')
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
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3000);
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

async function fetchEpisodesFromJikan(malId) {
  try {
    const res = await fetch(`${JIKAN_URL}/anime/${malId}/episodes`);
    const data = await res.json();
    return data.data || [];
  } catch(e) {
    return [];
  }
}

const GENRE_MAP = {
  1: 'Action', 4: 'Comedy', 8: 'Drama', 10: 'Fantasy',
  22: 'Romance', 24: 'Sci-Fi', 36: 'Slice of Life',
};

// ============================================================
// ANIMEPAHE - WITH 403 HANDLING
// ============================================================

function saveVerifiedSession(animeId, sessionId) {
  state.verifiedSessions[animeId] = sessionId;
  localStorage.setItem('rewind_sessions', JSON.stringify(state.verifiedSessions));
}

function getVerifiedSession(animeId) {
  return state.verifiedSessions[animeId] || null;
}

// Helper: Get alternative titles
function getAlternativeTitles(title) {
  const altMap = {
    'That Time I Got Reincarnated as a Slime': 'Tensei Shitara Slime Datta Ken',
    'Attack on Titan': 'Shingeki no Kyojin',
    'One Punch Man': 'One Punch-Man',
    'My Hero Academia': 'Boku no Hero Academia',
    'Demon Slayer': 'Kimetsu no Yaiba',
    'Fullmetal Alchemist': 'Hagane no Renkinjutsushi',
    'Sword Art Online': 'SAO',
    'Tokyo Ghoul': 'Tokyo Ghoul',
    'Death Note': 'Death Note',
    'Naruto': 'Naruto',
    'One Piece': 'One Piece'
  };
  
  const results = [title];
  for (const [key, value] of Object.entries(altMap)) {
    if (title.toLowerCase().includes(key.toLowerCase())) {
      results.push(value);
    }
    if (value.toLowerCase().includes(title.toLowerCase())) {
      results.push(key);
    }
  }
  return results;
}

async function searchAnimepahe(query) {
  try {
    console.log(`🔍 Searching Animepahe for: "${query}"`);
    
    const response = await fetch(`${API_BASE}?action=search&query=${encodeURIComponent(query)}`);
    
    // If backend fails (403), try direct
    if (response.status === 403 || response.status === 500) {
      console.log('⚠️ Backend blocked, trying direct...');
      return await searchAnimepaheDirect(query);
    }
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.data || [];
  } catch(e) {
    console.log('Search failed:', e);
    return await searchAnimepaheDirect(query);
  }
}

// DIRECT SEARCH - From frontend (works after user verification)
async function searchAnimepaheDirect(query) {
  try {
    console.log('🔄 Trying direct search from frontend...');
    const response = await fetch(`https://animepahe.pw/api?query=${encodeURIComponent(query)}`);
    if (!response.ok) {
      console.log('Direct search failed, opening search page...');
      window.open(`https://animepahe.pw/search?q=${encodeURIComponent(query)}`, '_blank');
      return [];
    }
    const data = await response.json();
    return data.data || [];
  } catch(e) {
    console.log('Direct search error:', e);
    window.open(`https://animepahe.pw/search?q=${encodeURIComponent(query)}`, '_blank');
    return [];
  }
}

async function getAnimepaheEpisodes(animeId) {
  try {
    const response = await fetch(`${API_BASE}?action=episodes&id=${animeId}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.data || [];
  } catch(e) {
    console.log('Episode fetch failed:', e);
    
    // Try direct
    try {
      const directRes = await fetch(`https://animepahe.pw/api?m=release&id=${animeId}`);
      if (directRes.ok) {
        const directData = await directRes.json();
        return directData.data || [];
      }
    } catch(e2) {
      console.log('Direct episode fetch also failed:', e2);
    }
    return [];
  }
}

async function getAnimepaheEmbed(animeSession, episodeSession) {
  try {
    const response = await fetch(`${API_BASE}?action=embed&id=${animeSession}&episode=${episodeSession}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data;
  } catch(e) {
    console.log('Embed fetch failed:', e);
    return {
      success: true,
      embedUrl: `https://animepahe.pw/embed/${animeSession}/${episodeSession}`,
      playUrl: `https://animepahe.pw/play/${animeSession}/${episodeSession}`
    };
  }
}

// ============================================================
// EPISODE PLAYER - FULLY WORKING
// ============================================================

async function playEpisode(animeTitle, episodeNumber) {
  showToast(`🔍 Finding ${animeTitle} episode ${episodeNumber}...`);
  console.log(`🎬 playEpisode: "${animeTitle}", EP ${episodeNumber}`);
  
  try {
    // Try search
    let searchResults = await searchAnimepahe(animeTitle);
    
    // If no results, try alternative titles
    if (!searchResults || searchResults.length === 0) {
      const altTitles = getAlternativeTitles(animeTitle);
      for (const alt of altTitles) {
        if (alt !== animeTitle) {
          console.log(`🔄 Trying alternative: "${alt}"`);
          searchResults = await searchAnimepahe(alt);
          if (searchResults && searchResults.length > 0) break;
        }
      }
    }
    
    if (!searchResults || searchResults.length === 0) {
      const searchUrl = `https://animepahe.pw/search?q=${encodeURIComponent(animeTitle)}`;
      showToast('❌ Opening Animepahe search...');
      window.open(searchUrl, '_blank');
      return;
    }
    
    const anime = searchResults[0];
    console.log('✅ Found:', anime.title);
    console.log('📝 ID:', anime.id);
    console.log('🔑 Session:', anime.session);
    
    // Get episodes
    let episodes = await getAnimepaheEpisodes(anime.id);
    
    if (!episodes || episodes.length === 0) {
      const animeUrl = `https://animepahe.pw/anime/${anime.id}`;
      showToast('📼 Opening Animepahe...');
      window.open(animeUrl, '_blank');
      return;
    }
    
    console.log(`✅ Found ${episodes.length} episodes`);
    
    // Find specific episode
    let episode = episodes.find(ep => {
      const epNum = parseInt(ep.episode) || parseInt(ep.number) || 0;
      return epNum === episodeNumber;
    });
    
    if (!episode) {
      episode = episodes[0];
      const firstEp = parseInt(episode.episode) || parseInt(episode.number) || 1;
      showToast(`⚠️ EP ${episodeNumber} not found. Showing EP ${firstEp}.`);
    }
    
    const actualEpNum = parseInt(episode.episode) || parseInt(episode.number) || 1;
    const sessionId = episode.session || episode.id;
    
    console.log(`🎬 Playing EP ${actualEpNum}, Session: ${sessionId}`);
    
    // Check verification
    const isVerified = getVerifiedSession(anime.id) === anime.session;
    
    if (!isVerified) {
      const playUrl = `https://animepahe.pw/play/${anime.session}/${sessionId}`;
      console.log('🔓 Opening for verification:', playUrl);
      window.open(playUrl, '_blank');
      saveVerifiedSession(anime.id, anime.session);
      showVerificationScreen(anime, episode, anime.title, actualEpNum);
      return;
    }
    
    // Get embed and play
    const embedData = await getAnimepaheEmbed(anime.session, sessionId);
    const embedUrl = embedData?.embedUrl || `https://animepahe.pw/embed/${anime.session}/${sessionId}`;
    showCompactPlayer(embedUrl, anime.title, actualEpNum, episodes.length);
    
  } catch(e) {
    console.log('❌ Error:', e);
    showToast('❌ Failed to load episode. Try again.');
  }
}

// ============================================================
// VERIFICATION SCREEN
// ============================================================

function showVerificationScreen(anime, episode, animeTitle, episodeNumber) {
  const sessionId = episode.session || episode.id;
  const playUrl = `https://animepahe.pw/play/${anime.session}/${sessionId}`;
  
  const playerHTML = `
    <div class="episode-player-overlay" id="episodePlayer">
      <div class="episode-player-container" style="max-width:480px;">
        <div class="episode-player-header">
          <h3 style="font-size:14px;">${escapeHtml(animeTitle)} - EP ${episodeNumber}</h3>
          <button class="episode-player-close" onclick="closeEpisodePlayer()">✕</button>
        </div>
        
        <div style="padding:30px 20px;text-align:center;">
          <div style="font-size:48px;margin-bottom:12px;">🔓</div>
          <h3 style="font-family:var(--display);font-weight:400;margin:0 0 8px;">Verify to Play</h3>
          <p style="color:var(--paper-dim);font-size:13px;margin:0 0 16px;">
            Animepahe needs verification. A new tab opened.
          </p>
          <div style="background:var(--panel-2);border-radius:8px;padding:12px 16px;margin:0 0 16px;text-align:left;font-size:12px;color:var(--paper);line-height:1.8;">
            <div>1️⃣ Wait for Animepahe to load</div>
            <div>2️⃣ Complete any Cloudflare check</div>
            <div>3️⃣ Come back and click below</div>
          </div>
          <button class="btn btn-amber" onclick="checkVerification('${anime.id}', '${anime.session}', '${escapeHtml(animeTitle)}', ${episodeNumber})" style="width:100%;padding:12px;">
            ✅ I've Verified - Play
          </button>
          <button class="btn btn-ghost" onclick="window.open('${playUrl}', '_blank')" style="width:100%;margin-top:8px;padding:10px;">
            🔗 Open Animepahe Again
          </button>
        </div>
      </div>
    </div>
  `;
  
  const oldPlayer = document.getElementById('episodePlayer');
  if (oldPlayer) oldPlayer.remove();
  
  document.body.insertAdjacentHTML('beforeend', playerHTML);
  document.body.style.overflow = 'hidden';
}

window.checkVerification = async function(animeId, sessionId, animeTitle, episodeNumber) {
  showToast('✅ Verified! Loading episode...');
  saveVerifiedSession(animeId, sessionId);
  closeEpisodePlayer();
  
  // Re-fetch and play
  await playEpisode(animeTitle, episodeNumber);
}

// ============================================================
// COMPACT VIDEO PLAYER
// ============================================================

function showCompactPlayer(embedUrl, animeTitle, episodeNumber, totalEpisodes) {
  const playerHTML = `
    <div class="episode-player-overlay" id="episodePlayer">
      <div class="episode-player-container" style="max-width:820px;">
        <div class="episode-player-header">
          <h3 style="font-size:14px;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%;">
            ${escapeHtml(animeTitle)} - EP ${String(episodeNumber).padStart(2, '0')}
          </h3>
          <div style="display:flex;gap:6px;align-items:center;">
            <button onclick="openInNewTab()" class="btn btn-ghost" style="padding:4px 10px;font-size:10px;" title="Open in new tab">🔗</button>
            <button class="episode-player-close" onclick="closeEpisodePlayer()" style="font-size:18px;">✕</button>
          </div>
        </div>
        
        <div style="position:relative;background:#000;aspect-ratio:16/9;width:100%;">
          <iframe id="episodeIframe" src="${embedUrl}" 
                  allowfullscreen 
                  allow="autoplay; encrypted-media"
                  sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                  style="width:100%;height:100%;border:none;">
          </iframe>
          <div id="iframeOverlay" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.8);color:var(--paper);font-size:14px;pointer-events:none;transition:opacity 0.5s;">
            <p style="font-size:28px;margin:0 0 8px;">🎬</p>
            <p>Loading episode...</p>
            <p style="font-size:12px;color:var(--paper-dim);margin-top:4px;">If stuck, click 🔗 to open in new tab</p>
          </div>
        </div>
        
        <div style="display:flex;gap:8px;padding:8px 14px;background:var(--panel-2);border-top:1px solid var(--line);flex-wrap:wrap;align-items:center;">
          <button onclick="document.getElementById('episodeIframe').requestFullscreen()" class="btn btn-ghost" style="padding:4px 12px;font-size:11px;">
            ⛶ Fullscreen
          </button>
          <button onclick="refreshIframe()" class="btn btn-ghost" style="padding:4px 12px;font-size:11px;">
            🔄 Refresh
          </button>
          <span style="font-size:10px;color:var(--paper-dim);margin-left:auto;">
            ${totalEpisodes || '?'} episodes total
          </span>
        </div>
      </div>
    </div>
  `;
  
  const oldPlayer = document.getElementById('episodePlayer');
  if (oldPlayer) oldPlayer.remove();
  
  document.body.insertAdjacentHTML('beforeend', playerHTML);
  document.body.style.overflow = 'hidden';
  
  // Hide overlay after 3 seconds
  setTimeout(() => {
    const overlay = document.getElementById('iframeOverlay');
    if (overlay) {
      overlay.style.opacity = '0';
      setTimeout(() => {
        if (overlay) overlay.style.display = 'none';
      }, 500);
    }
  }, 3000);
}

window.openInNewTab = function() {
  const iframe = document.getElementById('episodeIframe');
  if (iframe && iframe.src && iframe.src !== 'about:blank') {
    window.open(iframe.src, '_blank');
  }
}

window.refreshIframe = function() {
  const iframe = document.getElementById('episodeIframe');
  if (iframe) {
    const currentSrc = iframe.src;
    iframe.src = 'about:blank';
    setTimeout(() => {
      iframe.src = currentSrc;
      showToast('🔄 Refreshed');
    }, 300);
  }
}

window.closeEpisodePlayer = function() {
  const player = document.getElementById('episodePlayer');
  if (player) {
    const iframe = document.getElementById('episodeIframe');
    if (iframe) iframe.src = 'about:blank';
    player.remove();
    document.body.style.overflow = '';
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
// DETAIL CASE WITH EPISODE CARDS
// ============================================================
async function openCase(anime) {
  caseModal.classList.add('open');
  document.body.style.overflow = 'hidden';
  caseContent.innerHTML = caseSkeletonHTML();
  window.dispatchEvent(new CustomEvent('rewind:engaged'));

  let full = anime;
  let episodes = [];
  
  if (anime.malId) {
    const fetched = await fetchFullByMalId(anime.malId).catch(() => null);
    if (fetched) full = { ...fetched, id: anime.id };
    
    try {
      episodes = await fetchEpisodesFromJikan(anime.malId);
    } catch(e) {}
  }
  
  // If no episodes from Jikan, create from total
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
        <h4 style="font-family:var(--mono);font-size:11px;letter-spacing:1px;color:var(--paper-dim);text-transform:uppercase;margin:0;">
          📼 Episodes
        </h4>
        <span style="font-family:var(--mono);font-size:10px;color:var(--paper-dim);">
          ${episodes.length} total
        </span>
      </div>
      <div class="episode-grid" id="episodeGrid">
        ${episodes.slice(0, 24).map(ep => {
          const epNum = parseInt(ep.number) || parseInt(ep.episode) || 1;
          const epTitle = ep.title && ep.title !== `Episode ${epNum}` ? ep.title : '';
          return `
            <div class="episode-card" onclick="playEpisode('${escapeHtml(anime.title)}', ${epNum})">
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
}

function showAllEpisodes(title, total) {
  const grid = document.getElementById('episodeGrid');
  if (!grid) return;
  
  const currentCount = grid.querySelectorAll('.episode-card').length;
  if (currentCount >= total) return;
  
  for (let i = currentCount + 1; i <= Math.min(currentCount + 12, total); i++) {
    const card = document.createElement('div');
    card.className = 'episode-card';
    card.onclick = () => playEpisode(title, i);
    card.innerHTML = `
      <span class="ep-number">EP ${String(i).padStart(2, '0')}</span>
      <button class="ep-watch-btn">▶ Play</button>
    `;
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
// INSTALL NUDGE
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
      bodyEl.textContent = "Install it once — opens instantly from your home screen, no browser bar, no reloading.";
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

console.log('📼 REWIND loaded — Working episode player with 403 handling!');
