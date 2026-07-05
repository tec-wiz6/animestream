// ============================================================
// REWIND — watch.js (FIXED FOR MAL IDs)
// ============================================================
const $ = (sel) => document.querySelector(sel);

const id = qs('id');
const epParam = parseInt(qs('ep') || '1', 10);

// ============================================================
// VIDEO SOURCE WITH ON-DEMAND SCRAPING (FIXED)
// ============================================================
async function VIDEO_SOURCE_FOR(anime, episode) {
  try {
    // CRITICAL FIX: Use the anime.id from the URL, not malId
    // URL format: watch.html?id=mal-1735&ep=1
    // But Supabase uses: naruto, one piece, etc.
    
    // Get the anime ID from the URL parameter
    const urlId = qs('id');
    
    // If it's a MAL ID (starts with 'mal-'), we need to get the anime title
    let animeId;
    
    if (urlId && urlId.startsWith('mal-')) {
      // Try to use the anime's romaji or english title
      // Convert title to slug format (lowercase, replace spaces with dashes)
      const title = anime.title || anime.romaji || '';
      animeId = title.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      
      console.log(`🔄 Converted MAL ID ${urlId} to slug: ${animeId}`);
    } else {
      // Use the ID directly (for non-MAL links)
      animeId = urlId || anime.id;
    }
    
    // If we still don't have a good ID, try to use the anime name
    if (!animeId || animeId === 'mal-undefined') {
      const title = anime.title || anime.romaji || '';
      animeId = title.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      console.log(`🔄 Using title as slug: ${animeId}`);
    }
    
    console.log(`🎯 Final anime ID for API: ${animeId}`);
    
    // Call the API with the correct ID format
    const response = await fetch(
      `https://anime-stream-backend.vercel.app/api/anime/${encodeURIComponent(animeId)}/play/${episode}`
    );
    
    if (!response.ok) {
      console.error('Failed to fetch video:', response.status);
      // Try fallback - use the MAL ID directly
      if (urlId && urlId.startsWith('mal-')) {
        const malNum = urlId.replace('mal-', '');
        console.log(`🔄 Trying fallback with MAL ID: ${malNum}`);
        const fallbackResponse = await fetch(
          `https://anime-stream-backend.vercel.app/api/anime/${malNum}/play/${episode}`
        );
        if (fallbackResponse.ok) {
          const data = await fallbackResponse.json();
          return data.url || null;
        }
      }
      return null;
    }
    
    const data = await response.json();
    console.log('📺 Video source:', data);
    
    if (data.backgroundScraping) {
      console.log('🔄 Background scraping full season...');
    }
    
    return data.url || null;
    
  } catch (error) {
    console.error('Error fetching video source:', error);
    return null;
  }
}

// ============================================================
// RENDER PLAYER (FIXED)
// ============================================================
async function renderPlayer(anime, episode) {
  const screen = $('#playerScreen');

  // Show loading state
  document.getElementById('playerPlaceholder').innerHTML = `
    <div class="glyph">🔄</div>
    <h3>Loading episode...</h3>
    <p>Fetching video source (this may take a few seconds for new anime)</p>
  `;

  let src;
  try {
    src = await VIDEO_SOURCE_FOR(anime, episode);
  } catch (e) {
    console.error('Error getting video source:', e);
    src = null;
  }

  if (!src) {
    setTimeout(() => {
      if (screen.querySelector('video')) return;
      document.getElementById('playerPlaceholder').innerHTML = `
        <div class="glyph">⚠️</div>
        <h3>Could not load video</h3>
        <p>Try refreshing or selecting another episode.</p>
        <button class="btn btn-amber" onclick="location.reload()">↻ Retry</button>
      `;
    }, 30000);
    return;
  }

  screen.innerHTML = `<video controls playsinline autoplay src="${src}"></video>`;

  const video = screen.querySelector('video');
  if (video) {
    video.addEventListener('waiting', () => {
      const ph = document.getElementById('playerPlaceholder');
      ph.style.display = 'block';
      ph.querySelector('.glyph').textContent = '🔄';
      ph.querySelector('h3').textContent = 'Buffering...';
    });
    video.addEventListener('playing', () => {
      document.getElementById('playerPlaceholder').style.display = 'none';
    });
    video.addEventListener('error', () => {
      document.getElementById('playerPlaceholder').innerHTML = `
        <div class="glyph">⚠️</div>
        <h3>Video Error</h3>
        <p>Could not play this video. Try another episode.</p>
      `;
    });
  }
}

// ============================================================
// RENDER EPISODE SIDEBAR
// ============================================================
function renderEpisodeSidebar(anime, epCount, activeEp) {
  const list = $('#epSidebarList');
  list.innerHTML = Array.from({ length: Math.min(epCount, 100) }, (_, i) => {
    const n = i + 1;
    return `<a class="ep-row ${n === activeEp ? 'active' : ''}" href="watch.html?id=${encodeURIComponent(anime.id)}&ep=${n}">
      <span>Episode ${n}</span><span class="num">EP ${String(n).padStart(2, '0')}</span>
    </a>`;
  }).join('');
}

// ============================================================
// INIT
// ============================================================
async function init() {
  if (!id) { window.location.href = 'index.html'; return; }
  try {
    const cached = window.__animeCache && window.__animeCache[id];
    let anime = cached || await resolveAnimeById(id);
    if (!anime) {
      showLoadError();
      return;
    }
    if (anime.malId && (!anime.description || anime.description === 'No synopsis available.')) {
      const full = await fetchFullByMalId(anime.malId);
      if (full) anime = { ...full, id: anime.id };
    }
    window.dispatchEvent(new CustomEvent('rewind:engaged'));

    const epCount = anime.episodes && anime.episodes !== '?' ? Math.min(anime.episodes, 100) : Math.max(epParam, 12);
    const episode = Math.min(Math.max(epParam, 1), epCount);

    $('#backToDetail').href = `detail.html?id=${encodeURIComponent(anime.id)}`;
    $('#playerTitle').innerHTML = `${escapeHtml(anime.title)} <span class="ep">EP ${episode}</span>`;

    // Get actual episode count from API
    try {
      const animeId = getAnimeSlug(anime);
      const epResponse = await fetch(
        `https://anime-stream-backend.vercel.app/api/anime/${encodeURIComponent(animeId)}/episodes`
      );
      if (epResponse.ok) {
        const epData = await epResponse.json();
        if (epData.episodes && epData.episodes.length > 0) {
          renderEpisodeSidebar(anime, epData.episodes.length, episode);
        } else {
          renderEpisodeSidebar(anime, epCount, episode);
        }
      }
    } catch (e) {
      renderEpisodeSidebar(anime, epCount, episode);
    }

    // Render player
    await renderPlayer(anime, episode);
    setProgress(anime, episode);

    if (anime.malId) {
      const recs = await fetchRecommendations(anime.malId);
      if (recs.length) {
        $('#recRow').innerHTML = recs.map(r => `
          <a class="rec-card" href="detail.html?id=${encodeURIComponent(r.id)}">
            ${r.image ? `<img src="${r.image}" alt="${escapeHtml(r.title)}">` : ''}
            <div class="t">${escapeHtml(r.title)}</div>
          </a>`).join('');
        $('#recBlock').style.display = '';
      }
    }
  } catch (err) {
    console.error('REWIND watch page load failed:', err);
    showLoadError();
  }
}

// ============================================================
// HELPER: Convert anime to slug for API
// ============================================================
function getAnimeSlug(anime) {
  // Try to use the ID from URL first
  const urlId = qs('id');
  if (urlId && !urlId.startsWith('mal-')) {
    return urlId;
  }
  
  // If it's a MAL ID, convert title to slug
  if (urlId && urlId.startsWith('mal-')) {
    const title = anime.title || anime.romaji || '';
    const slug = title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return slug || 'unknown';
  }
  
  // Fallback: use title
  const title = anime.title || anime.romaji || '';
  return title.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function showLoadError() {
  $('#playerTitle').textContent = "Couldn't load this title";
  document.getElementById('playerPlaceholder').innerHTML = `
    <div class="glyph">⚠️</div>
    <h3>Couldn't load this title</h3>
    <p>The anime API didn't respond — could be a rate limit or a connection hiccup.</p>
    <button class="btn btn-amber" onclick="location.reload()">↻ Try again</button>`;
}

// Handle episode switching
document.addEventListener('click', (e) => {
  const epLink = e.target.closest('.ep-row');
  if (epLink) {
    e.preventDefault();
    const href = epLink.getAttribute('href');
    if (href) {
      document.getElementById('playerPlaceholder').innerHTML = `
        <div class="glyph">🔄</div>
        <h3>Loading episode...</h3>
        <p>Fetching video source...</p>
      `;
      window.location.href = href;
    }
  }
});

init();
