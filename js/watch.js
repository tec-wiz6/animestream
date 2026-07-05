// ============================================================
// REWIND — watch.js (FIXED)
// ============================================================
const $ = (sel) => document.querySelector(sel);

const id = qs('id');
const epParam = parseInt(qs('ep') || '1', 10);

async function VIDEO_SOURCE_FOR(anime, episode) {
  try {
    // Get the anime slug from title
    const title = anime.title || anime.romaji || '';
    const slug = title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    
    console.log(`🎯 Using slug: ${slug}`);

    const response = await fetch(
      `https://anime-stream-backend.vercel.app/api/anime/${encodeURIComponent(slug)}/episode/${episode}`
    );

    if (response.status === 404) {
      const data = await response.json();
      console.log('❌ Not available:', data.message);
      
      const placeholder = document.getElementById('playerPlaceholder');
      if (placeholder) {
        placeholder.innerHTML = `
          <div class="glyph">😢</div>
          <h3>Episode Not Available</h3>
          <p>${data.message || 'This episode hasn\'t been scraped yet.'}</p>
          <p style="font-size:12px;color:var(--paper-dim);">
            Make sure it\'s in your anime list and the scraper has run.
          </p>
          <button class="btn btn-amber" onclick="window.history.back()">← Go Back</button>
        `;
      }
      
      return null;
    }

    if (!response.ok) {
      console.error('Failed to fetch video:', response.status);
      return null;
    }

    const data = await response.json();
    console.log('📺 Video source:', data);
    
    return data.url || null;

  } catch (error) {
    console.error('Error fetching video source:', error);
    return null;
  }
}

async function renderPlayer(anime, episode) {
  const screen = $('#playerScreen');
  const placeholder = document.getElementById('playerPlaceholder');

  if (!screen) return;

  // Loading state
  if (placeholder) {
    placeholder.innerHTML = `
      <div class="glyph">🔄</div>
      <h3>Loading episode...</h3>
      <p>Fetching video...</p>
    `;
  }

  let src;
  try {
    src = await VIDEO_SOURCE_FOR(anime, episode);
  } catch (e) {
    console.error('Error getting video source:', e);
    src = null;
  }

  screen.innerHTML = '';

  if (!src) {
    if (placeholder) {
      placeholder.innerHTML = `
        <div class="glyph">⚠️</div>
        <h3>Could not load video</h3>
        <p>Try refreshing or selecting another episode.</p>
        <button class="btn btn-amber" onclick="location.reload()">↻ Retry</button>
      `;
    }
    return;
  }

  // Check if it's an embed URL (megaplay)
  const isEmbed = src.includes('megaplay') || 
                  src.includes('mp4upload') || 
                  src.includes('dood') || 
                  src.includes('embed') ||
                  src.includes('/v/');

  if (isEmbed) {
    console.log('📺 Rendering as iframe embed');
    screen.innerHTML = `
      <iframe 
        src="${src}" 
        style="width:100%;height:100%;border:none;background:#000;"
        allowfullscreen
        allow="autoplay; encrypted-media; fullscreen"
        scrolling="no"
        frameborder="0"
      ></iframe>
    `;
    
    setTimeout(() => {
      if (placeholder) {
        placeholder.style.display = 'none';
      }
    }, 2000);
  } else {
    console.log('📺 Rendering as video tag');
    screen.innerHTML = `
      <video controls playsinline autoplay style="width:100%;height:100%;">
        <source src="${src}" type="video/mp4">
        Your browser does not support the video tag.
      </video>
    `;

    const video = screen.querySelector('video');
    if (video) {
      video.addEventListener('waiting', () => {
        if (placeholder) {
          placeholder.style.display = 'block';
          placeholder.querySelector('.glyph').textContent = '🔄';
          placeholder.querySelector('h3').textContent = 'Buffering...';
        }
      });
      video.addEventListener('playing', () => {
        if (placeholder) {
          placeholder.style.display = 'none';
        }
      });
      video.addEventListener('error', () => {
        if (placeholder) {
          placeholder.style.display = 'block';
          placeholder.innerHTML = `
            <div class="glyph">⚠️</div>
            <h3>Video Error</h3>
            <p>Could not play this video. Try another episode.</p>
          `;
        }
      });
    }
  }
}

// ============================================================
// RENDER EPISODE SIDEBAR
// ============================================================
function renderEpisodeSidebar(anime, epCount, activeEp) {
  const list = $('#epSidebarList');
  if (!list) return;
  
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

    const backLink = $('#backToDetail');
    if (backLink) {
      backLink.href = `detail.html?id=${encodeURIComponent(anime.id)}`;
    }
    
    const titleEl = $('#playerTitle');
    if (titleEl) {
      titleEl.innerHTML = `${escapeHtml(anime.title)} <span class="ep">EP ${episode}</span>`;
    }

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
        const recRow = $('#recRow');
        if (recRow) {
          recRow.innerHTML = recs.map(r => `
            <a class="rec-card" href="detail.html?id=${encodeURIComponent(r.id)}">
              ${r.image ? `<img src="${r.image}" alt="${escapeHtml(r.title)}">` : ''}
              <div class="t">${escapeHtml(r.title)}</div>
            </a>`).join('');
        }
        const recBlock = $('#recBlock');
        if (recBlock) {
          recBlock.style.display = '';
        }
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
  const urlId = qs('id');
  if (urlId && !urlId.startsWith('mal-')) {
    return urlId;
  }
  
  if (urlId && urlId.startsWith('mal-')) {
    const title = anime.title || anime.romaji || '';
    const slug = title.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return slug || 'unknown';
  }
  
  const title = anime.title || anime.romaji || '';
  return title.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ============================================================
// SHOW LOAD ERROR
// ============================================================
function showLoadError() {
  const titleEl = $('#playerTitle');
  if (titleEl) {
    titleEl.textContent = "Couldn't load this title";
  }
  
  const placeholder = document.getElementById('playerPlaceholder');
  if (placeholder) {
    placeholder.innerHTML = `
      <div class="glyph">⚠️</div>
      <h3>Couldn't load this title</h3>
      <p>The anime API didn't respond — could be a rate limit or a connection hiccup.</p>
      <button class="btn btn-amber" onclick="location.reload()">↻ Try again</button>
    `;
  }
}

// ============================================================
// HANDLE EPISODE SWITCHING
// ============================================================
document.addEventListener('click', (e) => {
  const epLink = e.target.closest('.ep-row');
  if (epLink) {
    e.preventDefault();
    const href = epLink.getAttribute('href');
    if (href) {
      const placeholder = document.getElementById('playerPlaceholder');
      if (placeholder) {
        placeholder.innerHTML = `
          <div class="glyph">🔄</div>
          <h3>Loading episode...</h3>
          <p>Fetching video source...</p>
        `;
      }
      window.location.href = href;
    }
  }
});

// ============================================================
// START
// ============================================================
init();
