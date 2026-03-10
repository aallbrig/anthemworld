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

  // ─── localStorage helpers ──────────────────────────────────────────────────
  // Tracks which country anthems the user has heard in full (played to the end).
  // Key: "aw_heard_full:<ISO>"  Value: "1"
  function markHeardFull(countryId) {
    try { localStorage.setItem(`aw_heard_full:${countryId}`, '1'); } catch (_) {}
  }
  function hasHeardFull(countryId) {
    try { return localStorage.getItem(`aw_heard_full:${countryId}`) === '1'; } catch (_) { return false; }
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

  // ─── Maps ──────────────────────────────────────────────────────────────────
  let mapA = null;
  let mapB = null;
  let geojsonCache = null; // loaded once, reused

  function initMaps(geojsonData) {
    if (mapA) return; // already initialized
    mapA = new CountryHighlightMap('map-a', geojsonData);
    mapB = new CountryHighlightMap('map-b', geojsonData);
  }

  function flyMapsToCountries(isoA, nameA, isoB, nameB) {
    if (!mapA || !mapB) return;
    // Invalidate so Leaflet recalculates size after container became visible
    mapA.invalidate();
    mapB.invalidate();
    mapA.flyToCountry(isoA, nameA);
    mapB.flyToCountry(isoB, nameB);
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
      const res = await fetch(`${API}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      const body = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, body };
    } catch (err) {
      // Network error (ECONNREFUSED, DNS failure, etc.)
      return { ok: false, status: 0, body: { message: 'Network error — is the API server running?' } };
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
    const barEl      = $(side === 'a' ? 'listen-bar-a' : 'listen-bar-b');
    const statusEl   = $(side === 'a' ? 'listen-status-a' : 'listen-status-b');
    const indicatorEl = $(side === 'a' ? 'listen-indicator-a' : 'listen-indicator-b');
    const countryId  = side === 'a' ? countryAId : countryBId;
    const startMs    = Date.now();
    const priorMs    = side === 'a' ? listenAMs : listenBMs;

    show(indicatorEl);

    const interval = setInterval(() => {
      const elapsed = Date.now() - startMs;
      const total   = priorMs + elapsed;
      timerEl.textContent = (total / 1000).toFixed(1);

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
        markHeardFull(countryId);
        updateListenProgress(side, side === 'a' ? listenAMs : listenBMs);
      };
    } else {
      if (listenBTimerB) clearInterval(listenBTimerB);
      listenBTimerB = interval;
      audioEl.onpause = () => clearInterval(listenBTimerB);
      audioEl.onended = () => {
        clearInterval(listenBTimerB);
        markHeardFull(countryId);
        updateListenProgress(side, side === 'a' ? listenAMs : listenBMs);
      };
    }
  }

  function updateListenProgress(side, totalMs) {
    const barEl    = $(side === 'a' ? 'listen-bar-a' : 'listen-bar-b');
    const statusEl = $(side === 'a' ? 'listen-status-a' : 'listen-status-b');
    const timerEl  = $(side === 'a' ? 'listen-timer-a' : 'listen-timer-b');
    const pct      = Math.min(100, (totalMs / FULL_LISTEN_MS) * 100);
    const full     = pct >= 100;
    const wasAlreadyFull = barEl.classList.contains('aw-bar-shimmer');

    barEl.style.width = pct + '%';
    barEl.classList.toggle('bg-success', full);
    barEl.classList.toggle('bg-primary', !full);
    barEl.classList.toggle('aw-bar-shimmer', full);

    if (full) {
      statusEl.innerHTML = '✅ Full weight achieved!';
      // Animate the checkmark text in — only on first time reaching full
      if (!wasAlreadyFull) {
        triggerCardJuice(side);
      }
    } else {
      statusEl.innerHTML = `⏱ <span id="listen-timer-${side}">${(totalMs / 1000).toFixed(1)}</span>s heard`;
    }

    updateWeightHint();
  }

  const reducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function triggerCardJuice(side) {
    if (reducedMotion()) return;

    // Spring-bounce the status text
    const statusEl = $(`listen-status-${side}`);
    statusEl.classList.add('animate__animated', 'animate__bounceIn');
    statusEl.addEventListener('animationend', () =>
      statusEl.classList.remove('animate__animated', 'animate__bounceIn'), { once: true });

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
      liveEl.innerHTML = '🏆 Your vote carries <span class="text-success">full weight</span> this round!';
    } else if (combined > 0) {
      liveEl.innerHTML = `Current vote weight: <span class="text-warning">${combined}%</span> — keep listening to increase it.`;
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
  }

  // ─── Session ───────────────────────────────────────────────────────────────
  async function startSession() {
    hide(gameError);
    show(gameLoading);
    sessionStatus.textContent = 'Creating session…';

    // Check for stored session in sessionStorage
    const stored = sessionStorage.getItem('anthem_session_id');
    if (stored) {
      sessionId = stored;
      sessionStatus.textContent = `Session: ${sessionId.slice(0, 8)}…`;
      await loadMatchup();
      return;
    }

    const { ok, status, body } = await apiFetch('/session', { method: 'POST' });

    if (status === 429) {
      showError('Too many sessions', body.message || 'Rate limit reached. Try again tomorrow.');
      return;
    }
    if (!ok) {
      showError('Session error', body.message || 'Could not create session.');
      return;
    }

    sessionId = body.session_id;
    sessionStorage.setItem('anthem_session_id', sessionId);
    sessionStatus.textContent = `Session: ${sessionId.slice(0, 8)}…`;
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
    if (listenATimerA) clearInterval(listenATimerA);
    if (listenBTimerB) clearInterval(listenBTimerB);
    // Clear juice classes from previous round
    [$('card-a'), $('card-b')].forEach(el => el?.classList.remove('aw-card-full'));
    [$('vote-a-btn'), $('vote-b-btn')].forEach(el => el?.classList.remove('aw-vote-powered'));
    [$('listen-bar-a'), $('listen-bar-b')].forEach(el => el?.classList.remove('aw-bar-shimmer'));

    const { ok, status, body } = await apiFetch(`/matchup?session_id=${sessionId}`);

    if (status === 403) {
      // Session expired — clear and restart
      sessionStorage.removeItem('anthem_session_id');
      sessionId = null;
      await startSession();
      return;
    }
    if (status === 429) {
      showError('Vote limit reached', body.message || 'You have voted the maximum times for today.', null);
      return;
    }
    if (!ok) {
      showError('Matchup error', body.message || 'Could not load matchup.', loadMatchup);
      return;
    }

    renderMatchup(body);
  }

  function renderMatchup(data) {
    matchupId  = data.matchup_id;
    countryAId = data.country_a.country_id;
    countryBId = data.country_b.country_id;

    // Restore prior listen from server (total across session).
    // If the user previously heard the full anthem (localStorage), credit
    // them with full weight so they don't have to relisten.
    listenAMs = hasHeardFull(countryAId)
      ? Math.max(data.country_a.listen_ms || 0, FULL_LISTEN_MS)
      : (data.country_a.listen_ms || 0);
    listenBMs = hasHeardFull(countryBId)
      ? Math.max(data.country_b.listen_ms || 0, FULL_LISTEN_MS)
      : (data.country_b.listen_ms || 0);

    // Populate card A
    $('flag-a').src  = data.country_a.flag_url || '';
    $('flag-a').alt  = data.country_a.name;
    $('name-a').textContent   = data.country_a.name || countryAId;
    $('anthem-a').textContent = data.country_a.anthem_name || '';
    $('elo-a').textContent    = data.country_a.elo_score || 1500;
    $('audio-a').src     = data.country_a.audio_url || '';
    $('audio-a').preload = 'metadata';
    $('vote-a-btn').disabled  = false;
    if (listenAMs > 0) {
      show($('listen-indicator-a'));
      $('listen-timer-a').textContent = (listenAMs / 1000).toFixed(1);
      updateListenProgress('a', listenAMs);
    } else {
      hide($('listen-indicator-a'));
    }

    // Populate card B
    $('flag-b').src  = data.country_b.flag_url || '';
    $('flag-b').alt  = data.country_b.name;
    $('name-b').textContent   = data.country_b.name || countryBId;
    $('anthem-b').textContent = data.country_b.anthem_name || '';
    $('elo-b').textContent    = data.country_b.elo_score || 1500;
    $('audio-b').src     = data.country_b.audio_url || '';
    $('audio-b').preload = 'metadata';
    $('vote-b-btn').disabled  = false;
    if (listenBMs > 0) {
      show($('listen-indicator-b'));
      $('listen-timer-b').textContent = (listenBMs / 1000).toFixed(1);
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
    flyMapsToCountries(
      data.country_a.country_id, data.country_a.name,
      data.country_b.country_id, data.country_b.name
    );
  }

  // ─── Voting ────────────────────────────────────────────────────────────────
  async function submitVote(winnerId, loserId) {
    $('vote-a-btn').disabled = true;
    $('vote-b-btn').disabled = true;
    hide(skipArea);

    const { ok, status, body } = await apiFetch('/vote', {
      method: 'POST',
      body: JSON.stringify({
        session_id:  sessionId,
        matchup_id:  matchupId,
        winner_id:   winnerId,
        loser_id:    loserId,
        listen_a_ms: Math.round(listenAMs),
        listen_b_ms: Math.round(listenBMs),
      }),
    });

    if (status === 429) {
      showError('Vote limit reached', body.message, null);
      return;
    }
    if (!ok) {
      showError('Vote error', body.message || 'Could not record vote.', loadMatchup);
      return;
    }

    voteCount++;
    voteCountEl.textContent = voteCount;

    const winnerName = winnerId === countryAId ? $('name-a').textContent : $('name-b').textContent;
    const eloChange  = body.winner.new_elo - body.winner.old_elo;
    const weightPct  = Math.round((body.vote_weight || 0) * 100);
    const weightNote = weightPct < 100 ? ` <small class="text-muted">(${weightPct}% weight — listen longer for full impact)</small>` : '';
    showFlash('success',
      `✅ Voted for <strong>${winnerName}</strong>! ELO: ${body.winner.old_elo} → ${body.winner.new_elo} (+${eloChange})${weightNote}`
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
    } catch (e) {
      console.warn('CountryHighlightMap: could not load GeoJSON', e);
    }
    startSession();
  })();

})();
