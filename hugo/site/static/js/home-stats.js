/**
 * home-stats.js — populates the Top 3 anthems widget on the homepage.
 * Fetches /leaderboard?limit=3 from the game API if available;
 * silently hides the section if the API is unreachable.
 */
(function () {
  'use strict';

  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const API = isLocal ? 'http://localhost:3001' : '';

  const container = document.getElementById('home-top3');
  if (!container) return;

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  async function load() {
    try {
      const res = await fetch(`${API}/leaderboard?limit=3`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const top = (data.countries || []).slice(0, 3);
      if (!top.length) {
        container.innerHTML = '<p class="text-muted small">No votes yet — <a href="/game/">be the first to vote!</a></p>';
        return;
      }
      const medals = ['🥇', '🥈', '🥉'];
      container.innerHTML = top.map((c, i) => {
        const flag = c.flag_url
          ? `<img src="${escHtml(c.flag_url)}" alt="" style="height:18px;width:27px;object-fit:cover;vertical-align:middle;border:1px solid #dee2e6" class="me-1">`
          : '';
        const anthem = c.anthem_name ? `<span class="text-muted small"> — ${escHtml(c.anthem_name)}</span>` : '';
        return `<div class="d-flex align-items-center py-1 border-bottom">
          <span class="me-2 fs-5">${medals[i]}</span>
          ${flag}
          <span class="fw-semibold">${escHtml(c.name)}</span>${anthem}
          <span class="ms-auto badge bg-primary">${c.elo_score}</span>
        </div>`;
      }).join('');
    } catch {
      // API not available (local dev without SAM running) — hide the section gracefully
      const section = container.closest('.col-md-5');
      if (section) section.style.display = 'none';
    }
  }

  load();
}());
