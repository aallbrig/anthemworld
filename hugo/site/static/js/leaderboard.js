/**
 * leaderboard.js — fetches and renders the /leaderboard API response.
 *
 * Expects window.GAME_API_URL to be set before this script runs.
 * Element IDs must match leaderboard/single.html.
 */
(function () {
  'use strict';

  const API = (window.GAME_API_URL || '').replace(/\/$/, '');
  const t = (key, vars = {}, fallback = '') => {
    const translated = window.AnthemI18n?.t?.(key, vars, fallback);
    return translated ?? fallback ?? key;
  };

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

  function countryUrl(countryId) {
    return `/countries/${encodeURIComponent(String(countryId).toLowerCase())}/`;
  }

  function listenBadge(countryId) {
    return window.AnthemAudioWidget?.progressBadgeHTML?.(countryId) || '';
  }

  function renderRow(c) {
    const winRate = c.win_rate != null ? `${c.win_rate}%` : '—';
    const href = countryUrl(c.country_id);
    const badge = listenBadge(c.country_id);
    const flag = c.flag_url
      ? `<img src="${escHtml(c.flag_url)}" alt="" style="height:20px;width:30px;object-fit:cover;border:1px solid #dee2e6" class="me-2">`
      : '<span style="display:inline-block;width:30px" class="me-2"></span>';
    const eloClass = c.elo_score >= 1600 ? 'bg-success' : c.elo_score >= 1500 ? 'bg-primary' : 'bg-secondary';
    return `<tr>
      <td class="text-center fw-bold text-muted">${medal(c.rank)}</td>
      <td><a href="${escHtml(href)}" class="text-decoration-none">${flag}<span class="fw-semibold">${escHtml(c.name)}</span></a>${badge}</td>
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
    const voteStatsEl = document.getElementById('vote-stats');
    if (voteStatsEl) hide(voteStatsEl);

    const limit = limitSel ? limitSel.value : 50;

    try {
      const res = await fetch(`${API}/leaderboard?limit=${limit}&stats=true`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();

      hide(loading);

      if (!data.countries || data.countries.length === 0) {
        show(empty);
        return;
      }

      document.getElementById('leaderboard-total').textContent = data.total;
      document.getElementById('leaderboard-generated').textContent =
        new Date(data.generated_at).toLocaleString(window.AnthemI18n?.lang || undefined);
      show(stats);

      tbody.innerHTML = data.countries.map(renderRow).join('');
      show(tableWrap);

      // Render vote statistics if available
      if (data.stats && voteStatsEl) {
        renderVoteStats(data.stats, voteStatsEl);
        show(voteStatsEl);
      }
    } catch (err) {
      console.error('Leaderboard fetch failed:', err);
      showError(
        API
          ? t('leaderboard_error_api_unreachable', { message: err.message })
          : t('leaderboard_error_api_unconfigured')
      );
    }
  }

  function renderVoteStats(s, container) {
    const pct = (n, total) => total > 0 ? `(${((n / total) * 100).toFixed(1)}%)` : '';
    container.innerHTML = `
      <div class="row g-3">
        <div class="col-md-3"><div class="card text-center p-3">
          <div class="fs-2 fw-bold">${s.total_votes}</div>
          <div class="text-muted small">Total Votes</div>
        </div></div>
        <div class="col-md-3"><div class="card text-center p-3">
          <div class="fs-2 fw-bold">${s.unique_voters}</div>
          <div class="text-muted small">Unique Voters</div>
        </div></div>
        <div class="col-md-3"><div class="card text-center p-3">
          <div class="fs-2 fw-bold">${s.bonus_votes}</div>
          <div class="text-muted small">Bonus Votes</div>
        </div></div>
        <div class="col-md-3"><div class="card text-center p-3">
          <div class="fs-2 fw-bold">${s.total_bonus_points.toFixed(1)}</div>
          <div class="text-muted small">Bonus ELO Points</div>
        </div></div>
      </div>
      <div class="mt-3">
        <div class="progress" style="height:24px">
          <div class="progress-bar bg-warning" style="width:${pctNum(s.under_weight_votes, s.total_votes)}%"
               title="Under-weight">${s.under_weight_votes} under</div>
          <div class="progress-bar bg-success" style="width:${pctNum(s.full_weight_votes, s.total_votes)}%"
               title="Full-weight">${s.full_weight_votes} full</div>
          <div class="progress-bar bg-info" style="width:${pctNum(s.bonus_votes, s.total_votes)}%"
               title="Bonus">${s.bonus_votes} bonus</div>
        </div>
        <div class="text-muted small mt-1">Vote quality breakdown</div>
      </div>`;
  }

  function pctNum(n, total) {
    return total > 0 ? ((n / total) * 100).toFixed(1) : 0;
  }

  // Re-fetch when limit changes
  if (limitSel) limitSel.addEventListener('change', load);

  // Retry button
  if (retryBtn) retryBtn.addEventListener('click', load);

  load();
}());
