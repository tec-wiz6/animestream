// ============================================================
// REWIND — shelf.js
// ============================================================
const $ = (sel) => document.querySelector(sel);

function render() {
  const list = Object.values(getWatchlist());
  cacheAnime(list);
  $('#shelfCount').textContent = `${list.length} saved`;
  const shelf = $('#shelf');
  if (list.length === 0) {
    shelf.innerHTML = `
      <div class="shelf-empty">
        <div class="glyph">🎞️</div>
        <h3>Your shelf is empty</h3>
        <p>Tap the ☆ on any tape to keep it here.</p>
      </div>`;
    return;
  }
  shelf.innerHTML = list.map((a, i) => tapeCardHTML(a, i)).join('');
  attachTapeCardEvents(shelf);
  shelf.querySelectorAll('[data-save]').forEach(btn => {
    btn.addEventListener('click', () => setTimeout(render, 50)); // re-render so removed items disappear
  });
}

render();
