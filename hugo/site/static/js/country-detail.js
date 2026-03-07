/**
 * country-detail.js
 * Hydrates the /countries/[iso]/ page by fetching /data/anthems.json
 * and populating the pre-scaffolded DOM elements.
 */
(function () {
  'use strict';

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
        show(document.getElementById('country-error'));
        return;
      }
      render(c);
    })
    .catch(() => {
      hide(document.getElementById('country-loading'));
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
    addDlRow(dl, 'Composer', a.composer);
    addDlRow(dl, 'Lyricist', a.lyricist);
    addDlRow(dl, 'Adopted', a.adopted_date);
    if (a.wikipedia_url) {
      dl.insertAdjacentHTML('beforeend',
        `<dt class="col-sm-4">Wikipedia</dt>` +
        `<dd class="col-sm-8"><a href="${esc(a.wikipedia_url)}" target="_blank" rel="noopener">Read more ↗</a></dd>`);
    }
    if (a.history) {
      setText('cd-anthem-history', a.history);
      show(document.getElementById('cd-anthem-history'));
    }

    // ── Audio ──────────────────────────────────────────────────────────────
    const af = (c.audio_files || [])[0];
    if (af) {
      const audio = document.getElementById('cd-audio');
      audio.src = af.url;
      if (af.format) audio.setAttribute('type', af.format);
      audio.dataset.anthem = a.name || commonName;
      if (af.license) {
        setText('cd-audio-license', `License: ${af.license}`);
        show(document.getElementById('cd-audio-license'));
      }
      show(document.getElementById('cd-audio-card'));
    } else {
      show(document.getElementById('cd-no-audio'));
    }

    // ── National identity ──────────────────────────────────────────────────
    const idDl = document.getElementById('cd-identity-dl');
    addDlRow(idDl, 'Colors', c.national_colors);
    addDlRow(idDl, 'Symbols', c.national_symbols);
    if (idDl.children.length > 0) {
      show(document.getElementById('cd-identity-card'));
    }

    // ── Show content, hide spinner ─────────────────────────────────────────
    hide(document.getElementById('country-loading'));
    show(document.getElementById('country-content'));
  }
})();
