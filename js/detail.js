// ============================================================
// REWIND — detail.js
// ============================================================
const $ = (sel) => document.querySelector(sel);

const id = qs('id');

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
    render(anime);
    if (anime.malId) {
      const recs = await fetchRecommendations(anime.malId);
      renderRecs(recs);
    }
  } catch (err) {
    console.error('REWIND detail load failed:', err);
    showLoadError();
  }
}

function showLoadError() {
  document.getElementById('detailPoster').className = 'detail-poster';
  document.getElementById('detailPoster').innerHTML = '';
  document.getElementById('detailInfo').innerHTML = `
    <h1>Couldn't load this title</h1>
    <p style="color:var(--paper-dim);font-size:13.5px;margin-bottom:14px;">
      The anime API didn't respond — could be a rate limit or a connection hiccup.
    </p>
    <button class="btn btn-amber" onclick="location.reload()">↻ Try again</button>
    <a class="btn btn-ghost" href="index.html">‹ Back home</a>`;
  document.getElementById('synopsisBlock').textContent = '—';
}

function render(anime) {
  document.title = `REWIND — ${anime.title}`;
  const bg = anime.banner || anime.image || '';
  $('#detailBg').style.backgroundImage = `url('${bg}')`;

  $('#detailPoster').outerHTML = `
    <div class="detail-poster" id="detailPoster">
      ${anime.image ? `<img src="${anime.image}" alt="${escapeHtml(anime.title)}">` : ''}
    </div>`;

  const saved = isSaved(anime.id);
  $('#detailInfo').innerHTML = `
    <h1>${escapeHtml(anime.title)}</h1>
    <div class="detail-meta">
      <span>${anime.year}</span>
      <span>${anime.type}</span>
      <span>${anime.episodes} eps</span>
      <span>${anime.score ? '★ ' + anime.score : 'unrated'}</span>
      <span>${escapeHtml(anime.studio)}</span>
      <span>${escapeHtml(anime.status)}</span>
    </div>
    <div class="detail-actions">
      <a class="btn btn-pink btn-lg" href="watch.html?id=${encodeURIComponent(anime.id)}&ep=1">▶ Watch Now</a>
      <button class="btn btn-amber btn-save ${saved ? 'saved' : ''}" id="saveBtn">${saved ? '★ On your shelf' : '☆ Add to shelf'}</button>
      ${anime.malId ? `<a class="btn btn-ghost" href="https://myanimelist.net/anime/${anime.malId}" target="_blank" rel="noopener">MAL page ↗</a>` : ''}
    </div>`;

  $('#saveBtn').addEventListener('click', () => {
    const nowSaved = toggleSave(anime);
    $('#saveBtn').classList.toggle('saved', nowSaved);
    $('#saveBtn').textContent = nowSaved ? '★ On your shelf' : '☆ Add to shelf';
  });

  $('#synopsisBlock').textContent = anime.description;

  const epCount = anime.episodes && anime.episodes !== '?' ? Math.min(anime.episodes, 100) : 12;
  $('#epList').innerHTML = Array.from({ length: epCount }, (_, i) => `
    <a class="ep-item" href="watch.html?id=${encodeURIComponent(anime.id)}&ep=${i + 1}">
      <span class="num">EP ${String(i + 1).padStart(2, '0')}</span>
      <span class="lbl">Episode ${i + 1}</span>
    </a>`).join('');

  const watchLinks = buildWatchLinks(anime.title);
  $('#watchGrid').innerHTML = watchLinks.map(l => `<a class="watch-link" href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`).join('');
  $('#watchBlock').style.display = '';
}

function renderRecs(recs) {
  if (!recs.length) return;
  $('#recRow').innerHTML = recs.map(r => `
    <a class="rec-card" href="detail.html?id=${encodeURIComponent(r.id)}">
      ${r.image ? `<img src="${r.image}" alt="${escapeHtml(r.title)}">` : ''}
      <div class="t">${escapeHtml(r.title)}</div>
    </a>`).join('');
  $('#recBlock').style.display = '';
}

init();
