/**
 * leaderboard.js — fetches and renders the /leaderboard API response.
 *
 * Expects window.GAME_API_URL to be set before this script runs.
 * Element IDs must match leaderboard/single.html.
 */
(function () {
  'use strict';

  const API = (window.GAME_API_URL || '').replace(/\/$/, '');

  const loading   = document.getElementById('leaderboard-loading');
  const errorEl   = document.getElementById('leaderboard-error');
  const errorMsg  = document.getElementById('leaderboard-error-msg');
  const retryBtn  = document.getElementById('leaderboard-retry-btn');
  const stats     = document.getElementById('leaderboard-stats');
  const tableWrap = document.getElementById('leaderboard-table-wrap');
  const tbody     = document.getElementById('leaderboard-tbody');
  const empty     = document.getElementById('leaderboard-empty');
  const limitSel  = document.getElementById('leaderboard-limit');

  function show(el) { el.classList.remove('d-none'); }
  function hide(el) { el.classList.add('d-none'); }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function medal(rank) {
    return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
  }

  function renderRow(c) {
    const winRate = c.win_rate != null ? `${c.win_rate}%` : '—';
    const flag = c.flag_url
      ? `<img src="${escHtml(c.flag_url)}" alt="" style="height:20px;width:30px;object-fit:cover;border:1px solid #dee2e6" class="me-2">`
      : '<span style="display:inline-block;width:30px" class="me-2"></span>';
    const eloClass = c.elo_score >= 1600 ? 'bg-success' : c.elo_score >= 1500 ? 'bg-primary' : 'bg-secondary';
    return `<tr>
      <td class="text-center fw-bold text-muted">${medal(c.rank)}</td>
      <td>${flag}<span class="fw-semibold">${escHtml(c.name)}</span></td>
      <td class="text-muted small">${c.anthem_name ? escHtml(c.anthem_name) : '—'}</td>
      <td class="text-center"><span class="badge ${eloClass}">${c.elo_score}</span></td>
      <td class="text-center text-success fw-semibold">${c.wins}</td>
      <td class="text-center text-danger">${c.losses}</td>
      <td class="text-center">${winRate}</td>
    </tr>`;
  }

  function showError(msg) {
    hide(loading);
    errorMsg.textContent = msg ? ` ${msg}` : '';
    show(errorEl);
  }

  async function load() {
    hide(errorEl);
    show(loading);
    hide(tableWrap);
    hide(empty);
    hide(stats);

    const limit = limitSel ? limitSel.value : 50;

    try {
      const res = await fetch(`${API}/leaderboard?limit=${limit}`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();

      hide(loading);

      if (!data.countries || data.countries.length === 0) {
        show(empty);
        return;
      }

      document.getElementById('leaderboard-total').textContent = data.total;
      document.getElementById('leaderboard-generated').textContent =
        new Date(data.generated_at).toLocaleString();
      show(stats);

      tbody.innerHTML = data.countries.map(renderRow).join('');
      show(tableWrap);
    } catch (err) {
      console.error('Leaderboard fetch failed:', err);
      showError(
        API
          ? `Could not reach the game API (${err.message}). Is it running?`
          : 'Game API URL not configured.'
      );
    }
  }

  // Re-fetch when limit changes
  if (limitSel) limitSel.addEventListener('change', load);

  // Retry button
  if (retryBtn) retryBtn.addEventListener('click', load);

  load();
}());
