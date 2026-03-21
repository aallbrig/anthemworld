/**
 * listen-progress.js
 *
 * Client-side anthem listening credit. This is intentionally browser-local for
 * now, but the API shape is small enough that it can later swap to an
 * account-backed store (for example, email-based profiles) without rewriting
 * the rest of the site.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'aw_listen_progress_v1';
  const FULL_WEIGHT_MS = 10_000;
  const TRACKED_SELECTOR = 'audio';
  const boundAudios = new WeakSet();
  const playStates = new WeakMap();
  let observerStarted = false;

  function safeParse(json, fallback) {
    try {
      return json ? JSON.parse(json) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function loadStore() {
    if (!global.localStorage) return {};
    return safeParse(global.localStorage.getItem(STORAGE_KEY), {}) || {};
  }

  function saveStore(store) {
    if (!global.localStorage) return;
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (_) {}
  }

  function upperCountryId(countryId) {
    return String(countryId || '').trim().toUpperCase();
  }

  function getLegacyFull(countryId) {
    try {
      return global.localStorage.getItem(`aw_heard_full:${countryId}`) === '1';
    } catch (_) {
      return false;
    }
  }

  function getLegacyAnthem(countryId) {
    try {
      return global.localStorage.getItem(`aw_heard_anthem:${countryId}`) === '1';
    } catch (_) {
      return false;
    }
  }

  function syncLegacy(record) {
    const countryId = upperCountryId(record.country_id);
    if (!countryId || !global.localStorage) return;
    try {
      if (record.heard_full_weight) {
        global.localStorage.setItem(`aw_heard_full:${countryId}`, '1');
      }
      if (record.heard_full_anthem) {
        global.localStorage.setItem(`aw_heard_anthem:${countryId}`, '1');
      }
    } catch (_) {}
  }

  function normalizeProgressRecord(record, countryId) {
    const normalized = {
      country_id: upperCountryId(record?.country_id || countryId),
      country_name: record?.country_name || '',
      anthem_name: record?.anthem_name || '',
      flag_url: record?.flag_url || '',
      country_url: record?.country_url || '',
      total_listen_ms: Math.max(0, Number(record?.total_listen_ms || 0)),
      max_position_ms: Math.max(0, Number(record?.max_position_ms || 0)),
      duration_ms: Math.max(0, Number(record?.duration_ms || 0)),
      heard_full_weight: !!record?.heard_full_weight,
      heard_full_anthem: !!record?.heard_full_anthem,
      last_source: record?.last_source || '',
      last_listened_at: record?.last_listened_at || '',
    };

    if (getLegacyFull(normalized.country_id)) {
      normalized.heard_full_weight = true;
      normalized.total_listen_ms = Math.max(normalized.total_listen_ms, FULL_WEIGHT_MS);
    }
    if (getLegacyAnthem(normalized.country_id)) {
      normalized.heard_full_anthem = true;
    }
    if (normalized.duration_ms && normalized.heard_full_anthem) {
      normalized.max_position_ms = Math.max(normalized.max_position_ms, normalized.duration_ms);
    }
    if (Math.max(normalized.total_listen_ms, normalized.max_position_ms) >= FULL_WEIGHT_MS) {
      normalized.heard_full_weight = true;
    }
    if (normalized.duration_ms && normalized.max_position_ms >= normalized.duration_ms * 0.99) {
      normalized.heard_full_anthem = true;
      normalized.max_position_ms = Math.max(normalized.max_position_ms, normalized.duration_ms);
    }
    return normalized;
  }

  function mergeProgressRecord(existing, update) {
    const record = normalizeProgressRecord(existing, update.country_id);
    if (update.country_name) record.country_name = update.country_name;
    if (update.anthem_name) record.anthem_name = update.anthem_name;
    if (update.flag_url) record.flag_url = update.flag_url;
    if (update.country_url) record.country_url = update.country_url;
    if (update.last_source) record.last_source = update.last_source;

    if (update.add_listen_ms) {
      record.total_listen_ms += Math.max(0, Number(update.add_listen_ms || 0));
    }
    if (update.max_position_ms) {
      record.max_position_ms = Math.max(record.max_position_ms, Number(update.max_position_ms || 0));
    }
    if (update.duration_ms) {
      record.duration_ms = Math.max(record.duration_ms, Number(update.duration_ms || 0));
    }
    if (update.heard_full_weight) {
      record.heard_full_weight = true;
      record.total_listen_ms = Math.max(record.total_listen_ms, FULL_WEIGHT_MS);
    }
    if (update.heard_full_anthem) {
      record.heard_full_anthem = true;
      if (record.duration_ms) {
        record.max_position_ms = Math.max(record.max_position_ms, record.duration_ms);
      }
    }

    if (Math.max(record.total_listen_ms, record.max_position_ms) >= FULL_WEIGHT_MS) {
      record.heard_full_weight = true;
    }
    if (record.duration_ms && record.max_position_ms >= record.duration_ms * 0.99) {
      record.heard_full_anthem = true;
      record.max_position_ms = Math.max(record.max_position_ms, record.duration_ms);
    }
    record.last_listened_at = new Date().toISOString();
    return record;
  }

  function progressPercent(record) {
    const normalized = normalizeProgressRecord(record);
    if (normalized.heard_full_anthem) return 100;
    if (normalized.duration_ms > 0) {
      return Math.max(0, Math.min(100, (normalized.max_position_ms / normalized.duration_ms) * 100));
    }
    if (normalized.heard_full_weight) return 100;
    return Math.max(0, Math.min(100, (normalized.total_listen_ms / FULL_WEIGHT_MS) * 100));
  }

  function effectiveListenMs(record) {
    const normalized = normalizeProgressRecord(record);
    if (normalized.heard_full_anthem && normalized.duration_ms > 0) {
      return Math.max(normalized.duration_ms, normalized.total_listen_ms, normalized.max_position_ms, FULL_WEIGHT_MS);
    }
    return Math.max(normalized.total_listen_ms, normalized.max_position_ms);
  }

  function get(countryId) {
    const key = upperCountryId(countryId);
    if (!key) return null;
    const store = loadStore();
    return normalizeProgressRecord(store[key], key);
  }

  function getAll() {
    const store = loadStore();
    return Object.entries(store).map(([countryId, record]) =>
      normalizeProgressRecord(record, countryId)
    );
  }

  function upsert(update) {
    const countryId = upperCountryId(update?.country_id || update?.countryId);
    if (!countryId) return null;
    const store = loadStore();
    const merged = mergeProgressRecord(store[countryId], {
      ...update,
      country_id: countryId,
    });
    store[countryId] = merged;
    saveStore(store);
    syncLegacy(merged);
    // Notify other components (e.g. the map) that progress changed for this country.
    // Fires on timeupdate (max_position_ms > 0) and on flush (add_listen_ms > 0).
    if (global.document && (update.add_listen_ms > 0 || update.max_position_ms > 0)) {
      global.document.dispatchEvent(new global.CustomEvent('aw:listen-progress', {
        detail: { countryId, record: merged }
      }));
    }
    // Queue for server sync when meaningful listen data changes
    if (update.add_listen_ms > 0 || update.heard_full_weight || update.heard_full_anthem) {
      queueSync(countryId);
    }
    return merged;
  }

  function inferGameAudioMeta(audioEl) {
    const side = audioEl?.id === 'audio-a' ? 'a' : audioEl?.id === 'audio-b' ? 'b' : '';
    if (!side) return null;
    const iso = global.document.getElementById(`map-${side}`)?.dataset.countryIso || '';
    const countryName = global.document.getElementById(`name-${side}`)?.textContent?.trim() || '';
    const anthemName = global.document.getElementById(`anthem-${side}`)?.textContent?.trim() || '';
    const flagUrl = global.document.getElementById(`flag-${side}`)?.getAttribute('src') || '';
    if (!iso) return null;
    return {
      country_id: iso,
      country_name: countryName,
      anthem_name: anthemName,
      flag_url: flagUrl,
      country_url: `/countries/${iso.toLowerCase()}/`,
      last_source: 'game',
    };
  }

  function inferCountryDetailMeta() {
    const root = global.document.getElementById('country-detail');
    if (!root) return null;
    const iso = upperCountryId(root.dataset.iso);
    if (!iso) return null;
    return {
      country_id: iso,
      country_name: global.document.getElementById('cd-common-name')?.textContent?.trim() || '',
      anthem_name: global.document.getElementById('cd-anthem-name')?.textContent?.trim() || '',
      flag_url: global.document.getElementById('cd-flag')?.getAttribute('src') || '',
      country_url: `/countries/${iso.toLowerCase()}/`,
      last_source: 'country-detail',
    };
  }

  function metadataForAudio(audioEl) {
    const dataset = audioEl?.dataset || {};
    const explicitCountryId = upperCountryId(dataset.countryId);
    if (explicitCountryId) {
      return {
        country_id: explicitCountryId,
        country_name: dataset.countryName || '',
        anthem_name: dataset.anthemName || dataset.anthem || '',
        flag_url: dataset.flagUrl || '',
        country_url: dataset.countryUrl || '',
        last_source: dataset.listenSource || '',
      };
    }
    return inferGameAudioMeta(audioEl) || inferCountryDetailMeta();
  }

  function bindAudio(audioEl) {
    if (!audioEl || boundAudios.has(audioEl)) return;
    boundAudios.add(audioEl);

    function flushElapsed(finalize) {
      const state = playStates.get(audioEl);
      if (!state?.startedAt) return;
      const elapsed = Math.max(0, Date.now() - state.startedAt);
      if (elapsed > 0) {
        const meta = metadataForAudio(audioEl);
        if (meta?.country_id) {
          upsert({
            ...meta,
            add_listen_ms: elapsed,
            duration_ms: Number.isFinite(audioEl.duration) ? audioEl.duration * 1000 : 0,
          });
        }
      }
      state.startedAt = finalize ? 0 : Date.now();
      playStates.set(audioEl, state);
    }

    audioEl.addEventListener('play', () => {
      playStates.set(audioEl, { startedAt: Date.now() });
      const meta = metadataForAudio(audioEl);
      if (meta?.country_id) {
        upsert({
          ...meta,
          duration_ms: Number.isFinite(audioEl.duration) ? audioEl.duration * 1000 : 0,
        });
      }
    });

    audioEl.addEventListener('pause', () => flushElapsed(true));
    audioEl.addEventListener('ended', () => {
      flushElapsed(true);
      const meta = metadataForAudio(audioEl);
      if (meta?.country_id) {
        const durationMs = Number.isFinite(audioEl.duration) ? audioEl.duration * 1000 : 0;
        upsert({
          ...meta,
          duration_ms: durationMs,
          max_position_ms: durationMs || Math.max(0, audioEl.currentTime * 1000),
          heard_full_anthem: true,
        });
      }
    });

    audioEl.addEventListener('loadedmetadata', () => {
      const meta = metadataForAudio(audioEl);
      if (meta?.country_id) {
        upsert({
          ...meta,
          duration_ms: Number.isFinite(audioEl.duration) ? audioEl.duration * 1000 : 0,
        });
      }
    });

    audioEl.addEventListener('timeupdate', () => {
      const meta = metadataForAudio(audioEl);
      if (meta?.country_id) {
        const durationMs = Number.isFinite(audioEl.duration) ? audioEl.duration * 1000 : 0;
        upsert({
          ...meta,
          duration_ms: durationMs,
          max_position_ms: Math.max(0, audioEl.currentTime * 1000),
        });
      }
    });
  }

  function bindAll(root) {
    const scope = root || global.document;
    if (!scope?.querySelectorAll) return;
    scope.querySelectorAll(TRACKED_SELECTOR).forEach(bindAudio);
  }

  function observeDom() {
    if (observerStarted || !global.MutationObserver || !global.document?.body) return;
    observerStarted = true;
    bindAll(global.document);
    const observer = new global.MutationObserver(mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (!node || node.nodeType !== 1) return;
          if (node.matches?.(TRACKED_SELECTOR)) bindAudio(node);
          bindAll(node);
        });
      }
    });
    observer.observe(global.document.body, { childList: true, subtree: true });
  }

  function clearAll() {
    if (!global.localStorage) return;
    try {
      global.localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }

  // ─── Server sync ───────────────────────────────────────────────────────────
  const SYNC_DEBOUNCE_MS = 3000;
  let _syncTimer = null;
  let _pendingSync = new Set(); // country IDs queued for sync

  function getApiBase() {
    return (global.GAME_API_URL || '').replace(/\/$/, '');
  }

  /**
   * Queue a country for server sync (debounced).
   */
  function queueSync(countryId) {
    const key = upperCountryId(countryId);
    if (!key) return;
    _pendingSync.add(key);
    if (_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(flushSync, SYNC_DEBOUNCE_MS);
  }

  /**
   * Immediately flush all pending listen data to POST /listen.
   * Uses sendBeacon on page unload for reliability, fetch otherwise.
   */
  function flushSync(useSendBeacon) {
    if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }
    if (_pendingSync.size === 0) return;

    const apiBase = getApiBase();
    const sessionId = global.AnthemSession?.getSessionId?.();
    if (!apiBase || !sessionId) return;

    const store = loadStore();
    const events = [];
    for (const countryId of _pendingSync) {
      const record = store[countryId];
      if (!record) continue;
      events.push({
        country_id: countryId,
        total_listen_ms: record.total_listen_ms || 0,
        max_position_ms: record.max_position_ms || 0,
        duration_ms: record.duration_ms || 0,
        heard_full_weight: !!record.heard_full_weight,
        heard_full_anthem: !!record.heard_full_anthem,
      });
    }
    _pendingSync.clear();

    if (events.length === 0) return;

    const payload = JSON.stringify({ session_id: sessionId, events });

    if (useSendBeacon && global.navigator?.sendBeacon) {
      global.navigator.sendBeacon(
        `${apiBase}/listen`,
        new Blob([payload], { type: 'application/json' })
      );
      return;
    }

    // Fire-and-forget fetch
    fetch(`${apiBase}/listen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }

  // Sync on page unload (reliable delivery via sendBeacon)
  if (global.addEventListener) {
    global.addEventListener('visibilitychange', () => {
      if (global.document?.visibilityState === 'hidden') flushSync(true);
    });
    global.addEventListener('pagehide', () => flushSync(true));
  }

  const api = {
    STORAGE_KEY,
    FULL_WEIGHT_MS,
    get,
    getAll,
    upsert,
    bindAudio,
    bindAll,
    observeDom,
    clearAll,
    normalizeProgressRecord,
    mergeProgressRecord,
    progressPercent,
    effectiveListenMs,
    queueSync,
    flushSync,
  };

  global.ListenProgress = api;

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', observeDom, { once: true });
    } else {
      observeDom();
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
}(typeof window !== 'undefined' ? window : globalThis));
