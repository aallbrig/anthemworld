/**
 * game.js — Anthem Battle frontend
 *
 * State machine: idle → loading → matchup → voting → result → loading
 *
 * API base: window.GAME_API_URL ('' for same-origin prod, 'http://localhost:3001' for local SAM)
 */
(function () {
  'use strict';

  // ─── Config ────────────────────────────────────────────────────────────────
  const API = (window.GAME_API_URL || '').replace(/\/$/, '');
  const GEOJSON_URL   = '/data/countries.geojson';
  // Must match FULL_LISTEN_MS in sam/game/functions/shared/elo.js
  const FULL_LISTEN_MS = 10_000;
  const t = (key, vars = {}, fallback = '') => {
    const translated = window.AnthemI18n?.t?.(key, vars, fallback);
    return translated ?? fallback ?? key;
  };

  // ─── ListenProgress helpers ─────────────────────────────────────────────────
  // Bridge to the site-wide ListenProgress store (aw_listen_progress_v1).
  // Falls back to legacy aw_heard_full/aw_heard_anthem keys for backward compat.
  function markHeardFull(countryId) {
    const lp = window.ListenProgress;
    if (lp) {
      lp.upsert(countryId, { heard_full_weight: true, add_listen_ms: 0 });
    }
    try { localStorage.setItem(`aw_heard_full:${countryId}`, '1'); } catch (_) {}
  }
  function hasHeardFull(countryId) {
    const lp = window.ListenProgress;
    if (lp) {
      const r = lp.get(countryId);
      if (r?.heard_full_weight) return true;
    }
    try { return localStorage.getItem(`aw_heard_full:${countryId}`) === '1'; } catch (_) { return false; }
  }
  function markHeardAnthem(countryId) {
    const lp = window.ListenProgress;
    if (lp) {
      lp.upsert(countryId, { heard_full_anthem: true, add_listen_ms: 0 });
    }
    try { localStorage.setItem(`aw_heard_anthem:${countryId}`, '1'); } catch (_) {}
  }
  function hasHeardAnthem(countryId) {
    const lp = window.ListenProgress;
    if (lp) {
      const r = lp.get(countryId);
      if (r?.heard_full_anthem) return true;
    }
    try { return localStorage.getItem(`aw_heard_anthem:${countryId}`) === '1'; } catch (_) { return false; }
  }

  // ─── State ─────────────────────────────────────────────────────────────────
  let sessionId   = null;
  let matchupId   = null;
  let countryAId  = null;
  let countryBId  = null;
  let listenAMs   = 0;
  let listenBMs   = 0;
  let listenATimerA = null; // interval handle
  let listenBTimerB = null;
  let nextMatchupTimer = null; // setTimeout handle for post-vote auto-advance
  let voteCount   = 0;
  // Full-anthem bonus tracking (furthest playback position reached this matchup)
  let maxPositionAMs = 0;
  let maxPositionBMs = 0;
  let heardAnthemA   = false; // user heard full anthem for side A this matchup
  let heardAnthemB   = false;

  // ─── Maps ──────────────────────────────────────────────────────────────────
  let mapA = null;
  let mapB = null;
  let geojsonCache = null; // loaded once, reused
  let geojsonIndex = null;
  let unmappableRetryCount = 0;

  function initMaps(geojsonData) {
    if (mapA) return; // already initialized
    mapA = new CountryHighlightMap('map-a', geojsonData);
    mapB = new CountryHighlightMap('map-b', geojsonData);
  }

  function ensureGeojsonIndex() {
    if (!geojsonCache || geojsonIndex) return geojsonIndex;
    if (window.CountryHighlightMap?.buildCountryFeatureIndex) {
      geojsonIndex = window.CountryHighlightMap.buildCountryFeatureIndex(geojsonCache);
    }
    return geojsonIndex;
  }

  function matchupIsMappable(data) {
    const index = ensureGeojsonIndex();
    if (!index || !window.CountryHighlightMap?.resolveCountryFeature) return true;
    const resolvedA = window.CountryHighlightMap.resolveCountryFeature(index, data?.country_a?.country_id, data?.country_a?.name);
    const resolvedB = window.CountryHighlightMap.resolveCountryFeature(index, data?.country_b?.country_id, data?.country_b?.name);
    return !!(resolvedA && resolvedB);
  }

  function flyMapsToCountries(isoA, nameA, isoB, nameB) {
    if (!mapA || !mapB) return null;
    // Invalidate so Leaflet recalculates size after container became visible
    mapA.invalidate();
    mapB.invalidate();
    return {
      a: mapA.flyToCountry(isoA, nameA),
      b: mapB.flyToCountry(isoB, nameB),
    };
  }

  function resetMaps() {
    if (mapA) mapA.reset();
    if (mapB) mapB.reset();
  }

  // ─── DOM refs ──────────────────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  const sessionStatus   = $('session-status');
  const gameLoading     = $('game-loading');
  const gameError       = $('game-error');
  const gameMatchup     = $('game-matchup');
  const gameErrorTitle  = $('game-error-title');
  const gameErrorMsg    = $('game-error-msg');
  const scoreBar        = $('score-bar');
  const voteCountEl     = $('vote-count');
  const voteResult      = $('vote-result');
  const voteResultContent = $('vote-result-content');
  const skipArea        = $('skip-area');

  // ─── Helpers ───────────────────────────────────────────────────────────────
  function show(el)   { el.classList.remove('d-none'); }
  function hide(el)   { el.classList.add('d-none'); }

  async function apiFetch(path, options = {}) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'Accept-Language': window.AnthemI18n?.lang || navigator.language || 'en',
        ...(options.headers || {}),
      };
      const res = await fetch(`${API}${path}`, {
        ...options,
        headers,
      });
      const body = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, body };
    } catch (_err) {
      // Network error (ECONNREFUSED, DNS failure, etc.)
      return { ok: false, status: 0, body: { message: t('game_network_error') } };
    }
  }

  function showError(title, msg, retryFn) {
    hide(gameLoading);
    hide(gameMatchup);
    gameErrorTitle.textContent = title;
    gameErrorMsg.textContent   = msg;
    show(gameError);
    $('game-retry-btn').onclick = retryFn || startSession;
  }

  // ─── Listen tracking ───────────────────────────────────────────────────────
  function startListenTimer(side) {
    const audioEl    = $(side === 'a' ? 'audio-a' : 'audio-b');
    const timerEl    = $(side === 'a' ? 'listen-timer-a' : 'listen-timer-b');
    const indicatorEl = $(side === 'a' ? 'listen-indicator-a' : 'listen-indicator-b');
    const countryId  = side === 'a' ? countryAId : countryBId;
    const startMs    = Date.now();
    const priorMs    = side === 'a' ? listenAMs : listenBMs;

    show(indicatorEl);

    const interval = setInterval(() => {
      const elapsed = Date.now() - startMs;
      const total   = priorMs + elapsed;
      if (timerEl) timerEl.textContent = (total / 1000).toFixed(1);
      if (side === 'a') { listenAMs = total; }
      else              { listenBMs = total; }
      updateListenProgress(side, total);
    }, 100);

    if (side === 'a') {
      if (listenATimerA) clearInterval(listenATimerA);
      listenATimerA = interval;
      audioEl.onpause = () => clearInterval(listenATimerA);
      audioEl.onended = () => {
        clearInterval(listenATimerA);
        // Short-anthem edge case: anthem shorter than FULL_LISTEN_MS → credit full weight
        if (audioEl.duration && isFinite(audioEl.duration) &&
            audioEl.duration * 1000 < FULL_LISTEN_MS) {
          listenAMs = FULL_LISTEN_MS;
        }
        markHeardFull(countryId);
        updateListenProgress('a', listenAMs);
        // Award full-anthem bonus on natural end (client-side)
        if (!heardAnthemA) {
          heardAnthemA = true;
          markHeardAnthem(countryId);
          // Only trigger juice if the anthem bar is visible (first bar complete)
          const ind = $('anthem-indicator-a');
          if (ind && !ind.classList.contains('d-none')) triggerAnthemJuice('a');
        }
      };
    } else {
      if (listenBTimerB) clearInterval(listenBTimerB);
      listenBTimerB = interval;
      audioEl.onpause = () => clearInterval(listenBTimerB);
      audioEl.onended = () => {
        clearInterval(listenBTimerB);
        if (audioEl.duration && isFinite(audioEl.duration) &&
            audioEl.duration * 1000 < FULL_LISTEN_MS) {
          listenBMs = FULL_LISTEN_MS;
        }
        markHeardFull(countryId);
        updateListenProgress('b', listenBMs);
        if (!heardAnthemB) {
          heardAnthemB = true;
          markHeardAnthem(countryId);
          const ind = $('anthem-indicator-b');
          if (ind && !ind.classList.contains('d-none')) triggerAnthemJuice('b');
        }
      };
    }
  }

  function updateListenProgress(side, totalMs) {
    const barEl    = $(side === 'a' ? 'listen-bar-a' : 'listen-bar-b');
    const statusEl = $(side === 'a' ? 'listen-status-a' : 'listen-status-b');
    const pct      = Math.min(100, (totalMs / FULL_LISTEN_MS) * 100);
    const full     = pct >= 100;
    const wasAlreadyFull = barEl.classList.contains('aw-bar-shimmer');

    barEl.style.width = pct + '%';
    barEl.classList.toggle('bg-success', full);
    barEl.classList.toggle('bg-primary', !full);
    barEl.classList.toggle('aw-bar-shimmer', full);

    if (full) {
      statusEl.innerHTML = t('game_full_weight');
      if (!wasAlreadyFull) triggerCardJuice(side);
    } else {
      statusEl.innerHTML = t('game_listen_status_heard', {
        side,
        seconds: (totalMs / 1000).toFixed(1),
      });
    }

    updateWeightHint();
  }

  // Updates the orange anthem bonus bar (position-based, not time-based).
  function updateAnthemProgress(side, posMs, durationMs) {
    const barEl    = $(`anthem-bar-${side}`);
    const pctEl    = $(`anthem-pct-${side}`);
    if (!barEl || !durationMs) return;
    const pct = Math.min(100, (posMs / durationMs) * 100);
    barEl.style.width = pct + '%';
    if (pctEl) pctEl.textContent = Math.round(pct);
  }

  const reducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Reveals the anthem bonus bar and optionally shows it at full if already heard.
  function revealAnthemBar(side) {
    const ind = $(`anthem-indicator-${side}`);
    if (!ind || !ind.classList.contains('d-none')) return;
    ind.classList.remove('d-none');
    if (!reducedMotion()) {
      ind.classList.add('aw-anthem-appear');
      ind.addEventListener('animationend', () =>
        ind.classList.remove('aw-anthem-appear'), { once: true });
    }
    const alreadyFull = side === 'a' ? heardAnthemA : heardAnthemB;
    if (alreadyFull) {
      // Previously heard in full — show immediately at 100% with juice
      triggerAnthemJuice(side);
    } else {
      // Show current progress (user may have already scrubbed)
      const audioEl = $(side === 'a' ? 'audio-a' : 'audio-b');
      const posMs = side === 'a' ? maxPositionAMs : maxPositionBMs;
      if (audioEl && audioEl.duration && isFinite(audioEl.duration)) {
        updateAnthemProgress(side, posMs, audioEl.duration * 1000);
      }
    }
  }

  function triggerCardJuice(side) {
    // Reveal the anthem bonus bar whenever first bar completes
    revealAnthemBar(side);

    if (reducedMotion()) return;

    // Spring-bounce the status text (faster than default)
    const statusEl = $(`listen-status-${side}`);
    statusEl.classList.add('animate__animated', 'animate__faster', 'animate__bounceIn');
    statusEl.addEventListener('animationend', () =>
      statusEl.classList.remove('animate__animated', 'animate__faster', 'animate__bounceIn'),
      { once: true });

    // Pulse the card border green
    const cardEl = $(side === 'a' ? 'card-a' : 'card-b');
    cardEl.classList.add('aw-card-full', 'animate__animated', 'animate__pulse');
    cardEl.addEventListener('animationend', () =>
      cardEl.classList.remove('animate__animated', 'animate__pulse'), { once: true });

    // If both are now full, fire the combo
    if (listenAMs >= FULL_LISTEN_MS && listenBMs >= FULL_LISTEN_MS) {
      triggerComboJuice();
    }
  }

  function triggerAnthemJuice(side) {
    const barEl    = $(`anthem-bar-${side}`);
    const statusEl = $(`anthem-status-${side}`);
    const cardEl   = $(side === 'a' ? 'card-a' : 'card-b');

    if (barEl) {
      barEl.style.width = '100%';
      barEl.classList.remove('bg-warning');
      barEl.classList.add('aw-anthem-shimmer');
    }
    if (statusEl) {
      statusEl.innerHTML = t('game_full_anthem_bonus');
      statusEl.className = 'text-warning fw-semibold small';
      if (!reducedMotion()) {
        statusEl.classList.add('animate__animated', 'animate__tada');
        statusEl.addEventListener('animationend', () =>
          statusEl.classList.remove('animate__animated', 'animate__tada'), { once: true });
      }
    }
    if (cardEl) {
      cardEl.classList.add('aw-card-anthem');
      if (!reducedMotion()) {
        cardEl.classList.add('animate__animated', 'animate__heartBeat');
        cardEl.addEventListener('animationend', () =>
          cardEl.classList.remove('animate__animated', 'animate__heartBeat'), { once: true });
      }
    }
    if (typeof confetti === 'function' && !reducedMotion()) {
      confetti({
        particleCount: 40,
        spread: 55,
        origin: { y: 0.55, x: side === 'a' ? 0.25 : 0.75 },
        colors: ['#ffc107', '#ff9800', '#ffe066', '#fd7e14'],
      });
    }
  }

  let comboFired = false; // only fire once per matchup

  function triggerComboJuice() {
    if (comboFired || reducedMotion()) return;
    comboFired = true;

    // VS text rubberbands
    const vsEl = $('vs-text');
    if (vsEl) {
      vsEl.classList.add('animate__animated', 'animate__rubberBand');
      vsEl.addEventListener('animationend', () =>
        vsEl.classList.remove('animate__animated', 'animate__rubberBand'), { once: true });
    }

    // Vote buttons glow powered-up (briefly, then stay)
    [$('vote-a-btn'), $('vote-b-btn')].forEach(btn => {
      if (btn) btn.classList.add('aw-vote-powered');
    });

    // Hint bar flashes gold
    const hintInner = $('weight-hint-inner');
    if (hintInner) {
      hintInner.classList.add('aw-hint-gold');
      hintInner.addEventListener('animationend', () =>
        hintInner.classList.remove('aw-hint-gold'), { once: true });
    }

    // Confetti burst — canvas overlay, pointer-events:none, won't block votes
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.55 },
        colors: ['#28a745', '#20c997', '#ffc107', '#0d6efd'],
      });
    }
  }

  function updateWeightHint() {
    const wA = Math.min(listenAMs / FULL_LISTEN_MS, 1);
    const wB = Math.min(listenBMs / FULL_LISTEN_MS, 1);
    const combined = Math.round(wA * wB * 100);

    const hintEl  = $('weight-hint');
    const liveEl  = $('weight-live');
    if (!hintEl || !liveEl) return;

    show(hintEl);

    if (combined >= 100) {
      liveEl.innerHTML = t('game_weight_full_html');
    } else if (combined > 0) {
      liveEl.innerHTML = t('game_weight_partial_html', { weight: combined });
    } else {
      liveEl.innerHTML = '';
    }
  }

  function wireAudio(side) {
    const audioEl = $(side === 'a' ? 'audio-a' : 'audio-b');

    // Register with AudioController so playing one anthem pauses the other.
    window.AudioController.register(audioEl);

    audioEl.onplay = () => {
      startListenTimer(side);
    };

    // Track furthest playback position for the anthem bonus bar.
    // Uses ontimeupdate (fires during play and on seek) so scrubbing back
    // doesn't reset progress, but re-listening the same section doesn't
    // inflate the position counter.
    audioEl.ontimeupdate = () => {
      if (!audioEl.duration || !isFinite(audioEl.duration)) return;
      const posMs = audioEl.currentTime * 1000;
      const durMs = audioEl.duration * 1000;
      if (side === 'a') {
        if (posMs > maxPositionAMs) {
          maxPositionAMs = posMs;
          const ind = $('anthem-indicator-a');
          if (ind && !ind.classList.contains('d-none')) {
            updateAnthemProgress('a', maxPositionAMs, durMs);
          }
        }
        // Award full-anthem if user reached 99% (handles scrub-to-end)
        if (!heardAnthemA && maxPositionAMs >= durMs * 0.99) {
          heardAnthemA = true;
          markHeardAnthem(countryAId);
          const ind = $('anthem-indicator-a');
          if (ind && !ind.classList.contains('d-none')) triggerAnthemJuice('a');
        }
      } else {
        if (posMs > maxPositionBMs) {
          maxPositionBMs = posMs;
          const ind = $('anthem-indicator-b');
          if (ind && !ind.classList.contains('d-none')) {
            updateAnthemProgress('b', maxPositionBMs, durMs);
          }
        }
        if (!heardAnthemB && maxPositionBMs >= durMs * 0.99) {
          heardAnthemB = true;
          markHeardAnthem(countryBId);
          const ind = $('anthem-indicator-b');
          if (ind && !ind.classList.contains('d-none')) triggerAnthemJuice('b');
        }
      }
    };
  }

  // ─── Session ───────────────────────────────────────────────────────────────
  async function startSession() {
    hide(gameError);
    show(gameLoading);
    sessionStatus.textContent = t('game_session_creating');

    // Use site-wide session manager (localStorage-backed)
    const stored = window.AnthemSession?.getSessionId();
    if (stored) {
      sessionId = stored;
      sessionStatus.textContent = t('game_session_label', { id: sessionId.slice(0, 8) });
      await loadMatchup();
      return;
    }

    // Create session via session manager
    const newId = await window.AnthemSession?.ensureSession();
    if (!newId) {
      // Fallback: try direct API call (session-manager may not be loaded)
      const { ok, status, body } = await apiFetch('/session', { method: 'POST' });

      if (status === 429) {
        showError(t('game_error_too_many_sessions'), body.message || t('game_error_rate_limited'));
        return;
      }
      if (!ok) {
        showError(t('game_error_session'), body.message || t('game_error_create_session'));
        return;
      }

      sessionId = body.session_id;
      try { localStorage.setItem('aw_session', JSON.stringify({
        session_id: sessionId, created_at: body.created_at || new Date().toISOString()
      })); } catch (_) {}
    } else {
      sessionId = newId;
    }

    sessionStatus.textContent = t('game_session_label', { id: sessionId.slice(0, 8) });
    show(scoreBar);
    await loadMatchup();
  }

  // ─── Matchup ───────────────────────────────────────────────────────────────
  async function loadMatchup() {
    if (nextMatchupTimer) { clearTimeout(nextMatchupTimer); nextMatchupTimer = null; }
    hide(gameError);
    hide(gameMatchup);
    hide(voteResult);
    hide(skipArea);
    show(gameLoading);
    hide($('weight-hint'));

    // Reset listen state
    listenAMs = 0;
    listenBMs = 0;
    comboFired = false;
    maxPositionAMs = 0;
    maxPositionBMs = 0;
    heardAnthemA   = false;
    heardAnthemB   = false;
    if (listenATimerA) { clearInterval(listenATimerA); listenATimerA = null; }
    if (listenBTimerB) { clearInterval(listenBTimerB); listenBTimerB = null; }

    // Stop audio and clear stale handlers so no onended fires for the old track
    // after the new matchup has loaded (which would incorrectly write to localStorage
    // or trigger updateListenProgress against the new country's IDs).
    ['audio-a', 'audio-b'].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.pause();
      el.onplay       = null;
      el.onpause      = null;
      el.onended      = null;
      el.ontimeupdate = null;
    });

    // Clear juice classes from previous round
    [$('card-a'), $('card-b')].forEach(el => el?.classList.remove('aw-card-full', 'aw-card-anthem'));
    [$('vote-a-btn'), $('vote-b-btn')].forEach(el => el?.classList.remove('aw-vote-powered'));
    [$('listen-bar-a'), $('listen-bar-b')].forEach(el => el?.classList.remove('aw-bar-shimmer'));
    [$('anthem-bar-a'), $('anthem-bar-b')].forEach(el => el?.classList.remove('aw-anthem-shimmer'));
    [$('anthem-indicator-a'), $('anthem-indicator-b')].forEach(el => { if (el) el.classList.add('d-none'); });

    const { ok, status, body } = await apiFetch(`/matchup?session_id=${sessionId}`);

    if (status === 403) {
      // Session expired — clear and restart
      window.AnthemSession?.clearSession();
      sessionId = null;
      await startSession();
      return;
    }
    if (status === 429) {
      showError(t('game_error_vote_limit'), body.message || t('game_error_vote_limit_default'), null);
      return;
    }
    if (!ok) {
      showError(t('game_error_matchup'), body.message || t('game_error_load_matchup'), loadMatchup);
      return;
    }

    renderMatchup(body);
  }

  function renderMatchup(data) {
    if (geojsonCache && !matchupIsMappable(data)) {
      console.warn('CountryHighlightMap: skipping unmappable matchup', {
        countryA: data.country_a.country_id,
        countryB: data.country_b.country_id,
      });
      if (unmappableRetryCount < 6) {
        unmappableRetryCount++;
        loadMatchup();
        return;
      }
      unmappableRetryCount = 0;
      showError('Map error', 'Could not find a live-map matchup right now. Please try again.', loadMatchup);
      return;
    }

    matchupId  = data.matchup_id;
    countryAId = data.country_a.country_id;
    countryBId = data.country_b.country_id;
    const clientProgressA = window.ListenProgress?.get?.(countryAId);
    const clientProgressB = window.ListenProgress?.get?.(countryBId);

    // Restore prior listen from server (total across session).
    // Client-side progress from other pages also counts toward how informed the
    // player's opinion is, even before profiles move to account-backed storage.
    listenAMs = Math.max(
      data.country_a.listen_ms || 0,
      window.ListenProgress?.effectiveListenMs?.(clientProgressA) || clientProgressA?.total_listen_ms || 0,
      hasHeardFull(countryAId) ? FULL_LISTEN_MS : 0
    );
    listenBMs = Math.max(
      data.country_b.listen_ms || 0,
      window.ListenProgress?.effectiveListenMs?.(clientProgressB) || clientProgressB?.total_listen_ms || 0,
      hasHeardFull(countryBId) ? FULL_LISTEN_MS : 0
    );

    // Credit full-anthem localStorage for the bonus bar.
    // revealAnthemBar is called from triggerCardJuice (which fires when first
    // bar hits 100%); if the country was previously heard in full, the anthem
    // bar will show at 100% with juice at that point.
    heardAnthemA = hasHeardAnthem(countryAId);
    heardAnthemB = hasHeardAnthem(countryBId);

    // Populate card A
    const flagA = $('flag-a');
    const nameA = $('name-a');
    const anthemA = $('anthem-a');
    const eloA = $('elo-a');
    const audioA = $('audio-a');
    const voteABtn = $('vote-a-btn');
    if (!nameA || !flagA || !audioA) {
      console.warn('renderMatchup: card-A DOM elements missing, retrying');
      setTimeout(loadMatchup, 300);
      return;
    }
    flagA.src  = data.country_a.flag_url || '';
    flagA.alt  = data.country_a.name;
    nameA.textContent   = data.country_a.name || countryAId;
    if (anthemA) anthemA.textContent = data.country_a.anthem_name || '';
    if (eloA) eloA.textContent    = Number(data.country_a.elo_score || 1500).toFixed(2);
    window.AnthemAudioWidget.configure(audioA, {
      audioUrl: data.country_a.audio_url || '',
      audioFormat: data.country_a.audio_format || 'ogg',
      countryId: countryAId,
      countryName: data.country_a.name || countryAId,
      anthemName: data.country_a.anthem_name || '',
      flagUrl: data.country_a.flag_url || '',
      countryUrl: `/countries/${String(countryAId || '').toLowerCase()}/`,
      listenSource: 'game',
      preload: 'metadata',
      className: audioA.className,
    });
    if (voteABtn) voteABtn.disabled  = false;
    if (listenAMs > 0) {
      const indA = $('listen-indicator-a');
      const timerA = $('listen-timer-a');
      if (indA) show(indA);
      if (timerA) timerA.textContent = (listenAMs / 1000).toFixed(1);
      updateListenProgress('a', listenAMs);
    } else {
      hide($('listen-indicator-a'));
    }

    // Populate card B
    const flagB = $('flag-b');
    const nameB = $('name-b');
    const anthemB = $('anthem-b');
    const eloB = $('elo-b');
    const audioB = $('audio-b');
    const voteBBtn = $('vote-b-btn');
    if (!nameB || !flagB || !audioB) {
      console.warn('renderMatchup: card-B DOM elements missing, retrying');
      setTimeout(loadMatchup, 300);
      return;
    }
    flagB.src  = data.country_b.flag_url || '';
    flagB.alt  = data.country_b.name;
    nameB.textContent   = data.country_b.name || countryBId;
    if (anthemB) anthemB.textContent = data.country_b.anthem_name || '';
    if (eloB) eloB.textContent    = Number(data.country_b.elo_score || 1500).toFixed(2);    window.AnthemAudioWidget.configure(audioB, {
      audioUrl: data.country_b.audio_url || '',
      audioFormat: data.country_b.audio_format || 'ogg',
      countryId: countryBId,
      countryName: data.country_b.name || countryBId,
      anthemName: data.country_b.anthem_name || '',
      flagUrl: data.country_b.flag_url || '',
      countryUrl: `/countries/${String(countryBId || '').toLowerCase()}/`,
      listenSource: 'game',
      preload: 'metadata',
      className: audioB.className,
    });
    if (voteBBtn) voteBBtn.disabled  = false;
    if (listenBMs > 0) {
      const indB = $('listen-indicator-b');
      const timerB = $('listen-timer-b');
      if (indB) show(indB);
      if (timerB) timerB.textContent = (listenBMs / 1000).toFixed(1);
      updateListenProgress('b', listenBMs);
    } else {
      hide($('listen-indicator-b'));
    }

    // Wildcard badge
    if (data.is_wildcard) show($('wildcard-badge')); else hide($('wildcard-badge'));

    wireAudio('a');
    wireAudio('b');

    hide(gameLoading);
    show(gameMatchup);
    show(skipArea);

    // Init maps on first render (container must be visible before Leaflet can measure it)
    if (geojsonCache && !mapA) initMaps(geojsonCache);
    const mapResolution = flyMapsToCountries(
      data.country_a.country_id, data.country_a.name,
      data.country_b.country_id, data.country_b.name
    );
    if (mapResolution && (!mapResolution.a || !mapResolution.b)) {
      showError('Map error', 'Could not resolve the live map for this matchup. Please try again.', loadMatchup);
      return;
    }
    unmappableRetryCount = 0;
  }

  // ─── Voting ────────────────────────────────────────────────────────────────
  async function submitVote(winnerId, loserId) {
    $('vote-a-btn').disabled = true;
    $('vote-b-btn').disabled = true;
    hide(skipArea);

    // Immediately stop audio so onended cannot fire during the post-vote delay
    // and incorrectly mark the country as "heard in full" in localStorage.
    if (listenATimerA) { clearInterval(listenATimerA); listenATimerA = null; }
    if (listenBTimerB) { clearInterval(listenBTimerB); listenBTimerB = null; }
    [$('audio-a'), $('audio-b')].forEach(el => { if (el) el.pause(); });

    const { ok, status, body } = await apiFetch('/vote', {
      method: 'POST',
      body: JSON.stringify({
        session_id:    sessionId,
        matchup_id:    matchupId,
        winner_id:     winnerId,
        loser_id:      loserId,
        listen_a_ms:   Math.round(listenAMs),
        listen_b_ms:   Math.round(listenBMs),
        full_anthem_a: heardAnthemA,
        full_anthem_b: heardAnthemB,
      }),
    });

    if (status === 429) {
      showError(t('game_error_vote_limit'), body.message || t('game_error_vote_limit_default'), null);
      return;
    }
    if (!ok) {
      showError(t('game_error_vote'), body.message || t('game_error_record_vote'), loadMatchup);
      return;
    }

    voteCount++;
    voteCountEl.textContent = voteCount;

    const winnerName = winnerId === countryAId
      ? ($('name-a')?.textContent || countryAId)
      : ($('name-b')?.textContent || countryBId);
    const eloChange  = body.winner.new_elo - body.winner.old_elo;
    const weightPct  = Math.round((body.vote_weight || 0) * 100);
    const anthemBonus = body.anthem_bonus ? ' 🏅' : '';
    const weightNote = weightPct < 100
      ? t('game_flash_weight_note', { weight: weightPct })
      : anthemBonus ? t('game_flash_bonus_note') : '';
    showFlash('success',
      t('game_flash_vote_success_html', {
        winner: winnerName,
        old: Number(body.winner.old_elo).toFixed(2),
        new: Number(body.winner.new_elo).toFixed(2),
        delta: eloChange >= 0 ? eloChange.toFixed(2) : eloChange.toFixed(2),
        note: weightNote,
      })
    );

    // Reset maps to world view before next matchup loads
    resetMaps();

    // Load next matchup after brief pause
    nextMatchupTimer = setTimeout(loadMatchup, 1800);
  }

  function showFlash(type, html) {
    voteResultContent.className = `alert alert-${type}`;
    voteResultContent.innerHTML = html;
    show(voteResult);
  }

  // ─── Event wiring ──────────────────────────────────────────────────────────
  $('vote-a-btn').addEventListener('click', () => submitVote(countryAId, countryBId));
  $('vote-b-btn').addEventListener('click', () => submitVote(countryBId, countryAId));
  $('skip-btn').addEventListener('click', () => { resetMaps(); loadMatchup(); });
  $('game-retry-btn').addEventListener('click', () => loadMatchup());

  // ─── Boot ──────────────────────────────────────────────────────────────────
  // Fetch GeoJSON once and cache it; maps initialize lazily on first renderMatchup
  // (must wait until #game-matchup container is visible for Leaflet to measure size).
  (async function boot() {
    try {
      geojsonCache = await fetch(GEOJSON_URL).then(r => r.json());
      geojsonIndex = null;
    } catch (e) {
      console.warn('CountryHighlightMap: could not load GeoJSON', e);
    }
    startSession();
  })();

})();
