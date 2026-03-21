/**
 * country-detail.js
 * Hydrates the /countries/[iso]/ page by fetching /data/anthems.json
 * and populating the pre-scaffolded DOM elements.
 */
(function () {
  'use strict';
  const t = (key, vars = {}, fallback = '') =>
    window.AnthemI18n?.t?.(key, vars, fallback) ?? (fallback || key);

  function show(el) { el.classList.remove('d-none'); }
  function hide(el) { el.classList.add('d-none'); }
  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }
  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function addDlRow(dl, label, value) {
    if (!value) return;
    dl.insertAdjacentHTML('beforeend',
      `<dt class="col-sm-4">${esc(label)}</dt><dd class="col-sm-8">${esc(value)}</dd>`);
  }

  const root = document.getElementById('country-detail');
  if (!root) return;
  const iso = root.dataset.iso;

  fetch('/data/anthems.json')
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(data => {
      const c = data[iso];
      if (!c) {
        hide(document.getElementById('country-loading'));
        document.getElementById('country-error').textContent = t('country_detail_error');
        show(document.getElementById('country-error'));
        return;
      }
      render(c);
    })
    .catch(() => {
      hide(document.getElementById('country-loading'));
      document.getElementById('country-error').textContent = t('country_detail_error');
      show(document.getElementById('country-error'));
    });

  function render(c) {
    const a = c.anthem || {};

    // ── Hero card ──────────────────────────────────────────────────────────
    if (c.flag_url) {
      const flag = document.getElementById('cd-flag');
      flag.src = c.flag_url;
      flag.alt = `${c.common_name || c.name} flag`;
      show(flag);
    }

    const commonName = c.common_name || c.name || iso;
    setText('cd-common-name', commonName);
    document.getElementById('breadcrumb-name').textContent = commonName;
    document.title = document.title.replace(/^[^—]+/, commonName + ' ');

    if (c.name && c.name !== c.common_name) {
      setText('cd-official-name', c.name);
      show(document.getElementById('cd-official-name'));
    }
    setText('cd-iso', c.iso_alpha3 || iso);
    if (c.region) {
      setText('cd-region', c.region);
      show(document.getElementById('cd-region'));
    }
    if (c.capital) {
      setText('cd-capital', c.capital);
      show(document.getElementById('cd-capital-item'));
    }
    if (c.subregion) {
      setText('cd-subregion', c.subregion);
      show(document.getElementById('cd-subregion-item'));
    }

    // ── Anthem card ────────────────────────────────────────────────────────
    setText('cd-anthem-name', a.name || '—');
    if (a.title_en) {
      document.getElementById('cd-anthem-title-en').innerHTML = `<em>${esc(a.title_en)}</em>`;
      show(document.getElementById('cd-anthem-title-en'));
    }
    const dl = document.getElementById('cd-anthem-dl');
    addDlRow(dl, t('country_detail_composer'), a.composer);
    addDlRow(dl, t('country_detail_lyricist'), a.lyricist);
    addDlRow(dl, t('map_adopted'), a.adopted_date);
    if (a.wikipedia_url) {
      dl.insertAdjacentHTML('beforeend',
        `<dt class="col-sm-4">${esc(t('country_detail_wikipedia'))}</dt>` +
        `<dd class="col-sm-8"><a href="${esc(a.wikipedia_url)}" target="_blank" rel="noopener">${esc(t('country_detail_read_more'))}</a></dd>`);
    }
    if (a.history) {
      setText('cd-anthem-history', a.history);
      show(document.getElementById('cd-anthem-history'));
    }

    // ── Audio ──────────────────────────────────────────────────────────────
    const af = (c.audio_files || [])[0];
    if (af) {
      const audio = document.getElementById('cd-audio');
      window.AnthemAudioWidget.configure(audio, {
        audioUrl: af.url,
        audioFormat: af.format,
        countryId: c.iso_alpha3 || iso,
        countryName: commonName,
        anthemName: a.name || commonName,
        flagUrl: c.flag_url || '',
        countryUrl: `/countries/${String(c.iso_alpha3 || iso).toLowerCase()}/`,
        listenSource: 'country-detail',
        preload: 'metadata',
        className: audio.className,
      });
      if (af.license) {
        setText('cd-audio-license', `${t('country_detail_license')}: ${af.license}`);
        show(document.getElementById('cd-audio-license'));
      }
      show(document.getElementById('cd-audio-card'));

      // Show listen progress
      renderListenStatus(c.iso_alpha3 || iso);
    } else {
      show(document.getElementById('cd-no-audio'));
    }

    // ── National identity ──────────────────────────────────────────────────
    const idDl = document.getElementById('cd-identity-dl');
    addDlRow(idDl, t('country_detail_colors'), c.national_colors);
    addDlRow(idDl, t('country_detail_symbols'), c.national_symbols);
    if (idDl.children.length > 0) {
      show(document.getElementById('cd-identity-card'));
    }

    // ── Show content, hide spinner ─────────────────────────────────────────
    hide(document.getElementById('country-loading'));
    show(document.getElementById('country-content'));
  }

  function renderListenStatus(countryId) {
    const el = document.getElementById('cd-listen-status');
    if (!el) return;
    const lp = window.ListenProgress;
    if (!lp) return;

    function update() {
      const record = lp.get(String(countryId).toUpperCase());
      if (!record) { el.classList.add('d-none'); return; }
      const pct = lp.progressPercent(record);
      if (pct <= 0) { el.classList.add('d-none'); return; }

      const barClass = pct >= 100 ? 'bg-success' : 'bg-warning';
      const label = pct >= 100 ? '✓ Fully heard' : `${Math.round(pct)}% heard`;
      el.innerHTML = `
        <div class="d-flex align-items-center gap-2">
          <div class="progress flex-grow-1" style="height:8px">
            <div class="progress-bar ${barClass}" style="width:${Math.min(pct, 100)}%"></div>
          </div>
          <span class="badge ${pct >= 100 ? 'bg-success' : 'bg-warning text-dark'}">${label}</span>
        </div>`;
      el.classList.remove('d-none');
    }

    update();
    // Refresh while user listens
    setInterval(update, 2000);
  }
})();
