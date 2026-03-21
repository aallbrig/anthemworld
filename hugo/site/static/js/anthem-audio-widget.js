/**
 * Shared anthem audio widget.
 *
 * Centralizes how anthem players are rendered/configured so every page uses the
 * same metadata contract for browser-local listening credit.
 */
(function (global) {
  'use strict';

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function mimeFor(format) {
    if (global.AudioController?.mime) {
      return global.AudioController.mime(format);
    }
    if (!format || format === 'application/ogg' || format === 'ogg') return 'audio/ogg';
    if (String(format).startsWith('audio/')) return format;
    if (format === 'mp3' || format === 'mpeg') return 'audio/mpeg';
    if (format === 'wav') return 'audio/wav';
    if (format === 'flac') return 'audio/flac';
    return 'audio/ogg';
  }

  function datasetFromOptions(options = {}) {
    return {
      countryId: String(options.countryId || '').toUpperCase(),
      countryName: options.countryName || '',
      anthemName: options.anthemName || '',
      flagUrl: options.flagUrl || '',
      countryUrl: options.countryUrl || '',
      listenSource: options.listenSource || '',
    };
  }

  function applyDataset(audioEl, options) {
    const dataset = datasetFromOptions(options);
    Object.entries(dataset).forEach(([key, value]) => {
      if (value) {
        audioEl.dataset[key] = value;
      } else {
        delete audioEl.dataset[key];
      }
    });
  }

  /**
   * Return a small HTML badge string showing listen progress for a country.
   * Returns '' if ListenProgress is unavailable or the country has no history.
   */
  function progressBadgeHTML(countryId) {
    const lp = global.ListenProgress;
    if (!lp || !countryId) return '';
    const record = lp.get(String(countryId).toUpperCase());
    if (!record) return '';
    const pct = lp.progressPercent(record);
    if (pct <= 0) return '';
    if (record.heard_full_anthem || pct >= 100) {
      return '<span class="badge bg-success ms-1" title="Fully heard">✓ Heard</span>';
    }
    return `<span class="badge bg-warning text-dark ms-1" title="${Math.round(pct)}% heard">${Math.round(pct)}%</span>`;
  }

  function configure(audioEl, options = {}) {
    if (!audioEl) return null;

    audioEl.controls = options.controls !== false;
    audioEl.preload = options.preload || 'none';
    if (options.className != null) audioEl.className = options.className;
    if (options.inlineStyle != null) audioEl.style.cssText = options.inlineStyle;

    applyDataset(audioEl, options);

    while (audioEl.firstChild) audioEl.removeChild(audioEl.firstChild);
    if (options.audioUrl) {
      const source = global.document.createElement('source');
      source.src = options.audioUrl;
      source.type = mimeFor(options.audioFormat);
      audioEl.appendChild(source);
      audioEl.load();
    } else {
      audioEl.removeAttribute('src');
      audioEl.load();
    }

    global.AudioController?.register?.(audioEl);
    global.ListenProgress?.bindAudio?.(audioEl);
    return audioEl;
  }

  function renderHTML(options = {}) {
    if (!options.audioUrl) return '';
    const dataset = datasetFromOptions(options);
    const attrs = [
      'controls',
      `preload="${esc(options.preload || 'none')}"`,
    ];
    if (options.className) attrs.push(`class="${esc(options.className)}"`);
    if (options.inlineStyle) attrs.push(`style="${esc(options.inlineStyle)}"`);
    if (dataset.countryId) attrs.push(`data-country-id="${esc(dataset.countryId)}"`);
    if (dataset.countryName) attrs.push(`data-country-name="${esc(dataset.countryName)}"`);
    if (dataset.anthemName) attrs.push(`data-anthem-name="${esc(dataset.anthemName)}"`);
    if (dataset.flagUrl) attrs.push(`data-flag-url="${esc(dataset.flagUrl)}"`);
    if (dataset.countryUrl) attrs.push(`data-country-url="${esc(dataset.countryUrl)}"`);
    if (dataset.listenSource) attrs.push(`data-listen-source="${esc(dataset.listenSource)}"`);

    const badge = options.showBadge !== false ? progressBadgeHTML(dataset.countryId) : '';
    return `<span class="aw-audio-widget">${badge}<audio ${attrs.join(' ')}>
      <source src="${esc(options.audioUrl)}" type="${esc(mimeFor(options.audioFormat))}">
    </audio></span>`;
  }

  global.AnthemAudioWidget = {
    configure,
    renderHTML,
    progressBadgeHTML,
    mime: mimeFor,
  };
}(typeof window !== 'undefined' ? window : globalThis));
