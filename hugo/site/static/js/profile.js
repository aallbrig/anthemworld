/**
 * profile.js
 *
 * Renders the browser-local listening profile. The current implementation is
 * intentionally storage-agnostic enough that it can later swap from
 * localStorage to an account-backed API.
 */
(function (global) {
  'use strict';

  function progressPercentFor(record) {
    if (global.ListenProgress?.progressPercent) {
      return global.ListenProgress.progressPercent(record);
    }
    if (!record) return 0;
    if (record.heard_full_anthem) return 100;
    if (record.duration_ms > 0) {
      return Math.max(0, Math.min(100, (record.max_position_ms / record.duration_ms) * 100));
    }
    return Math.max(0, Math.min(100, (record.total_listen_ms / 10_000) * 100));
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildProfileViewModel(catalog, getProgress) {
    const rows = [];

    for (const [iso, country] of Object.entries(catalog || {})) {
      const countryId = String(country.iso_alpha3 || iso).toUpperCase();
      const progress = getProgress(countryId) || null;
      const completionPct = progress ? progressPercentFor(progress) : 0;
      const audioFile = (country.audio_files || []).find(file => file && file.url) || null;
      let statusRank = 2;
      let statusLabel = 'Not heard yet';
      if (progress?.heard_full_anthem) {
        statusRank = 0;
        statusLabel = 'Fully heard';
      } else if (progress?.total_listen_ms > 0 || progress?.max_position_ms > 0 || progress?.heard_full_weight) {
        statusRank = 1;
        statusLabel = 'In progress';
      }
      const view = {
        country_id: countryId,
        country_name: country.common_name || country.name || countryId,
        official_name: country.name || '',
        anthem_name: country.anthem?.name || '—',
        flag_url: country.flag_url || '',
        country_url: `/countries/${countryId.toLowerCase()}/`,
        audio_url: audioFile?.url || '',
        audio_format: audioFile?.format || '',
        duration_ms: Number(progress?.duration_ms || 0),
        total_listen_ms: Number(progress?.total_listen_ms || 0),
        max_position_ms: Number(progress?.max_position_ms || 0),
        completion_pct: completionPct,
        heard_full_weight: !!progress?.heard_full_weight,
        heard_full_anthem: !!progress?.heard_full_anthem,
        last_listened_at: progress?.last_listened_at || '',
        status_rank: statusRank,
        status_label: statusLabel,
      };
      rows.push(view);
    }

    rows.sort((a, b) =>
      (a.status_rank - b.status_rank) ||
      (b.completion_pct - a.completion_pct) ||
      (b.total_listen_ms - a.total_listen_ms) ||
      (b.max_position_ms - a.max_position_ms) ||
      a.country_name.localeCompare(b.country_name)
    );
    const full = rows.filter(x => x.heard_full_anthem);
    const partial = rows.filter(x => !x.heard_full_anthem && (x.total_listen_ms > 0 || x.max_position_ms > 0 || x.heard_full_weight));
    const unheard = rows.filter(x => !x.heard_full_anthem && !(x.total_listen_ms > 0 || x.max_position_ms > 0 || x.heard_full_weight));

    return {
      rows,
      stats: {
        total: rows.length,
        listened_any: full.length + partial.length,
        full_anthem: full.length,
      },
    };
  }

  function rowHtml(item) {
    const official = item.official_name && item.official_name !== item.country_name
      ? `<div class="text-muted small">${esc(item.official_name)}</div>`
      : '';
    const flag = item.flag_url
      ? `<img src="${esc(item.flag_url)}" alt="" style="height:18px;vertical-align:middle;margin-right:6px;" onerror="this.style.display='none'">`
      : '';
    const anthemProgress = item.heard_full_anthem
      ? '100'
      : String(Math.round(item.completion_pct || 0));
    const statusClass = item.heard_full_anthem
      ? 'bg-warning text-dark'
      : item.status_rank === 1
        ? 'bg-info text-dark'
        : 'bg-secondary';
    const audioHtml = item.audio_url
      ? global.AnthemAudioWidget.renderHTML({
          audioUrl: item.audio_url,
          audioFormat: item.audio_format,
          countryId: item.country_id,
          countryName: item.country_name,
          anthemName: item.anthem_name,
          flagUrl: item.flag_url,
          countryUrl: item.country_url,
          listenSource: 'profile',
          inlineStyle: 'height:28px;width:180px;'
        })
      : '<span class="badge bg-secondary">No audio</span>';

    return `
      <tr>
        <td>
          <a href="${esc(item.country_url)}" class="text-decoration-none">${flag}${esc(item.country_name)}</a>
          ${official}
        </td>
        <td>${esc(item.anthem_name)}</td>
        <td>${audioHtml}</td>
      </tr>`;
  }

  function renderTable(rows, emptyMessage) {
    const tableBody = global.document.querySelector('#profile-table tbody');
    const empty = global.document.getElementById('profile-table-empty');
    if (!tableBody || !empty) return;
    if (!rows.length) {
      tableBody.innerHTML = '';
      empty.textContent = emptyMessage;
      empty.classList.remove('d-none');
      return;
    }
    empty.classList.add('d-none');
    tableBody.innerHTML = rows.map(rowHtml).join('');
    if (global.AudioController?.registerAll) {
      global.AudioController.registerAll(global.document.getElementById('profile-table'));
    }
  }

  async function renderProfile() {
    const root = global.document.getElementById('profile-page');
    if (!root) return;

    const loading = global.document.getElementById('profile-loading');
    const error = global.document.getElementById('profile-error');
    const content = global.document.getElementById('profile-content');

    try {
      const resp = await fetch('/data/anthems.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const catalog = await resp.json();
      const model = buildProfileViewModel(catalog, countryId => global.ListenProgress.get(countryId));

      global.document.getElementById('profile-total-count').textContent = model.stats.total;
      global.document.getElementById('profile-listened-count').textContent = model.stats.listened_any;
      global.document.getElementById('profile-full-anthem-count').textContent = model.stats.full_anthem;
      renderTable(model.rows, 'No anthem progress yet — start listening and this dashboard will fill in.');

      loading.classList.add('d-none');
      error.classList.add('d-none');
      content.classList.remove('d-none');
    } catch (err) {
      console.error('[profile] Failed to render profile:', err);
      loading.classList.add('d-none');
      error.classList.remove('d-none');
    }
  }

  if (global.document) {
    global.document.addEventListener('DOMContentLoaded', renderProfile);
  }

    if (typeof module !== 'undefined' && module.exports) {
      module.exports = {
        buildProfileViewModel,
      };
    }
}(typeof window !== 'undefined' ? window : globalThis));
