// ============================================================
// REWIND — watch.js
//
// This page is a PLACEHOLDER PLAYER SHELL. It does not fetch, scrape,
// or embed video from any third-party site. Once you have a licensed
// video source (your own hosting + license, or a licensed partner API),
// wire it into `VIDEO_SOURCE_FOR` below — everything else (episode
// switching, progress tracking, layout) is already built around it.
// ============================================================
const $ = (sel) => document.querySelector(sel);

const id = qs('id');
const epParam = parseInt(qs('ep') || '1', 10);

// TODO: once licensed, return a real playable URL (HLS .m3u8 from your
// own licensed encode, or a licensed partner's embed) for (anime, episode).
// Returning null keeps the placeholder screen showing.
function VIDEO_SOURCE_FOR(anime, episode) {
  return null;
}

async function init() {
  if (!id) { window.location.href = 'index.html'; return; }
  const cached = window.__animeCache && window.__animeCache[id];
  let anime = cached || await resolveAnimeById(id);
  if (!anime) {
    $('#playerTitle').textContent = 'Not found';
    return;
  }
  if (anime.malId && (!anime.description || anime.description === 'No synopsis available.')) {
    const full = await fetchFullByMalId(anime.malId).catch(() => null);
    if (full) anime = { ...full, id: anime.id };
  }
  window.dispatchEvent(new CustomEvent('rewind:engaged'));

  const epCount = anime.episodes && anime.episodes !== '?' ? Math.min(anime.episodes, 100) : Math.max(epParam, 12);
  const episode = Math.min(Math.max(epParam, 1), epCount);

  $('#backToDetail').href = `detail.html?id=${encodeURIComponent(anime.id)}`;
  $('#playerTitle').innerHTML = `${escapeHtml(anime.title)} <span class="ep">EP ${episode}</span>`;

  renderEpisodeSidebar(anime, epCount, episode);
  renderPlayer(anime, episode);
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
}

function renderEpisodeSidebar(anime, epCount, activeEp) {
  const list = $('#epSidebarList');
  list.innerHTML = Array.from({ length: epCount }, (_, i) => {
    const n = i + 1;
    return `<a class="ep-row ${n === activeEp ? 'active' : ''}" href="watch.html?id=${encodeURIComponent(anime.id)}&ep=${n}">
      <span>Episode ${n}</span><span class="num">EP ${String(n).padStart(2, '0')}</span>
    </a>`;
  }).join('');
}

function renderPlayer(anime, episode) {
  const src = VIDEO_SOURCE_FOR(anime, episode);
  const screen = $('#playerScreen');
  if (!src) return; // keep the placeholder shown
  screen.innerHTML = `<video controls playsinline autoplay src="${src}"></video>`;
}

init();
