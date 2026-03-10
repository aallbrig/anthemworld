/**
 * home-stats.js — populates the Top 3 anthems widget on the homepage.
 * Fetches /leaderboard?limit=3 from the game API if available;
 * shows a friendly fallback if the API is unreachable or not configured.
 */
(function () {
  'use strict';

  const container = document.getElementById('home-top3');
  if (!container) return;

  // API base must be set explicitly via data-api-base attribute on the container.
  // This prevents spurious fetches in CI (Hugo runs on localhost but the game API doesn't).
  const API = container.dataset.apiBase || '';

  const FALLBACK = '<p class="text-muted small">No votes yet — <a href="/game/">be the first to vote!</a></p>';

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  async function load() {
    if (!API) {
      container.innerHTML = FALLBACK;
      return;
    }
    try {
      const res = await fetch(`${API}/leaderboard?limit=3`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const top = (data.countries || []).slice(0, 3);
      if (!top.length) {
        container.innerHTML = FALLBACK;
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
      container.innerHTML = FALLBACK;
    }
  }

  load();
}());
