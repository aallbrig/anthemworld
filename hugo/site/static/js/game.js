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
  const MIN_LISTEN_MS = 3000; // must match Lambda env var
  const GEOJSON_URL   = '/data/countries.geojson';

  // ─── State ─────────────────────────────────────────────────────────────────
  let sessionId   = null;
  let matchupId   = null;
  let countryAId  = null;
  let countryBId  = null;
  let listenAMs   = 0;
  let listenBMs   = 0;
  let listenATimerA = null; // interval handle
  let listenBTimerB = null;
  let voteCount   = 0;
  let alreadyHeardA = false;
  let alreadyHeardB = false;

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
    const indicatorEl = $(side === 'a' ? 'listen-indicator-a' : 'listen-indicator-b');
    const voteBtn    = $(side === 'a' ? 'vote-a-btn' : 'vote-b-btn');
    const startMs    = Date.now();
    const priorMs    = side === 'a' ? listenAMs : listenBMs;

    show(indicatorEl);

    const interval = setInterval(() => {
      const elapsed = Date.now() - startMs;
      const total   = priorMs + elapsed;
      timerEl.textContent = (total / 1000).toFixed(1);

      if (side === 'a') { listenAMs = total; }
      else              { listenBMs = total; }

      // Enable vote button once minimum listen time met
      const alreadyHeard = side === 'a' ? alreadyHeardA : alreadyHeardB;
      if (alreadyHeard || total >= MIN_LISTEN_MS) {
        voteBtn.disabled = false;
      }
    }, 100);

    if (side === 'a') {
      if (listenATimerA) clearInterval(listenATimerA);
      listenATimerA = interval;
      audioEl.onpause = () => clearInterval(listenATimerA);
      audioEl.onended = () => clearInterval(listenATimerA);
    } else {
      if (listenBTimerB) clearInterval(listenBTimerB);
      listenBTimerB = interval;
      audioEl.onpause = () => clearInterval(listenBTimerB);
      audioEl.onended = () => clearInterval(listenBTimerB);
    }
  }

  function wireAudio(side, alreadyHeard) {
    const audioEl = $(side === 'a' ? 'audio-a' : 'audio-b');
    const voteBtn = $(side === 'a' ? 'vote-a-btn' : 'vote-b-btn');

    // If already heard before, enable voting immediately
    if (alreadyHeard) {
      voteBtn.disabled = false;
    }

    audioEl.onplay = () => {
      // Stop other audio (AudioController if available)
      if (window.AudioController) window.AudioController.stopAll();
      audioEl.play();
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
    hide(gameError);
    hide(gameMatchup);
    hide(voteResult);
    hide(skipArea);
    show(gameLoading);

    // Reset listen state
    listenAMs = 0;
    listenBMs = 0;
    if (listenATimerA) clearInterval(listenATimerA);
    if (listenBTimerB) clearInterval(listenBTimerB);

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

    // Restore prior listen from server (total across session)
    listenAMs  = data.country_a.listen_ms || 0;
    listenBMs  = data.country_b.listen_ms || 0;
    alreadyHeardA = listenAMs >= MIN_LISTEN_MS;
    alreadyHeardB = listenBMs >= MIN_LISTEN_MS;

    // Populate card A
    $('flag-a').src  = data.country_a.flag_url || '';
    $('flag-a').alt  = data.country_a.name;
    $('name-a').textContent   = data.country_a.name || countryAId;
    $('anthem-a').textContent = data.country_a.anthem_name || '';
    $('elo-a').textContent    = data.country_a.elo_score || 1500;
    $('audio-a').src = data.country_a.audio_url || '';
    $('listen-timer-a').textContent = (listenAMs / 1000).toFixed(1);
    $('vote-a-btn').disabled  = !alreadyHeardA;
    if (listenAMs > 0) show($('listen-indicator-a')); else hide($('listen-indicator-a'));

    // Populate card B
    $('flag-b').src  = data.country_b.flag_url || '';
    $('flag-b').alt  = data.country_b.name;
    $('name-b').textContent   = data.country_b.name || countryBId;
    $('anthem-b').textContent = data.country_b.anthem_name || '';
    $('elo-b').textContent    = data.country_b.elo_score || 1500;
    $('audio-b').src = data.country_b.audio_url || '';
    $('listen-timer-b').textContent = (listenBMs / 1000).toFixed(1);
    $('vote-b-btn').disabled  = !alreadyHeardB;
    if (listenBMs > 0) show($('listen-indicator-b')); else hide($('listen-indicator-b'));

    // Wildcard badge
    if (data.is_wildcard) show($('wildcard-badge')); else hide($('wildcard-badge'));

    wireAudio('a', alreadyHeardA);
    wireAudio('b', alreadyHeardB);

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

    if (status === 422) {
      // Listen requirements not met — re-enable buttons
      $('vote-a-btn').disabled = false;
      $('vote-b-btn').disabled = false;
      show(skipArea);
      showFlash('warning', `Listen for at least ${MIN_LISTEN_MS / 1000}s before voting. ` + (body.message || ''));
      return;
    }
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
    showFlash('success',
      `✅ Voted for <strong>${winnerName}</strong>! ELO: ${body.winner.old_elo} → ${body.winner.new_elo} (+${eloChange})`
    );

    // Reset maps to world view before next matchup loads
    resetMaps();

    // Load next matchup after brief pause
    setTimeout(loadMatchup, 1800);
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
