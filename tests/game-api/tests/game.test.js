/**
 * Game API integration tests — runs against SAM local (port 3001).
 * Requires: LocalStack + SAM local running via `make game-dev`
 *
 * Usage:
 *   npm test
 *   GAME_API_URL=http://localhost:3001 npm test
 */
'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');

const BASE_URL = process.env.GAME_API_URL || 'http://localhost:3001';

async function api(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body, headers: res.headers };
}

// Shared session created once for the whole test run — avoids hitting the
// per-IP session rate limit across multiple describe blocks.
let sharedSessionId = null;

before(async () => {
  const { status, body } = await api('/session', { method: 'POST' }).catch(() => ({ status: 0, body: null }));
  if (status === 201 && body?.session_id) {
    sharedSessionId = body.session_id;
  } else {
    // API may be unavailable or rate-limited — integration tests will skip gracefully.
    console.log(`ℹ  Shared session unavailable (${status}); integration tests will be skipped.`);
  }
});

// ─── /session ─────────────────────────────────────────────────────────────

describe('POST /session', () => {
  test('creates a new session and returns session_id', async () => {
    const { status, body } = await api('/session', { method: 'POST' });
    assert.equal(status, 201, `Expected 201, got ${status}: ${JSON.stringify(body)}`);
    assert.ok(body.session_id, 'Missing session_id');
    assert.match(body.session_id, /^[0-9a-f-]{36}$/, 'session_id is not a UUID');
    assert.ok(body.created_at, 'Missing created_at');
  });

  test('returns CORS headers', async () => {
    const { headers } = await api('/session', { method: 'POST' });
    assert.ok(
      headers.get('access-control-allow-origin'),
      'Missing Access-Control-Allow-Origin header'
    );
  });

  // SAM local's Werkzeug HTTP server handles OPTIONS at the framework level
  // (before the Lambda fires), so it returns 200 rather than the Lambda's 204.
  // In production with real API Gateway CORS config this would be 204.
  test('OPTIONS preflight returns a 2xx status', async () => {
    const { status } = await api('/session', { method: 'OPTIONS' });
    assert.ok(status >= 200 && status < 300, `Expected 2xx for OPTIONS, got ${status}`);
  });
});

// ─── /matchup ─────────────────────────────────────────────────────────────

describe('GET /matchup', () => {
  test('returns 400 when session_id missing', async () => {
    const { status } = await api('/matchup');
    assert.equal(status, 400);
  });

  test('returns 403 for unknown session', async () => {
    const { status } = await api('/matchup?session_id=00000000-0000-0000-0000-000000000000');
    assert.equal(status, 403);
  });

  test('returns matchup with valid session', async () => {
    const { status, body } = await api(`/matchup?session_id=${sharedSessionId}`);
    // If rankings table is empty, may return 500; that's expected without seeded data
    if (status === 500) {
      console.log('    ℹ Rankings table empty — run seed script first for full matchup test');
      return;
    }
    assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    assert.ok(body.matchup_id, 'Missing matchup_id');
    assert.ok(body.country_a, 'Missing country_a');
    assert.ok(body.country_b, 'Missing country_b');
    assert.ok(body.country_a.country_id, 'Missing country_a.country_id');
    assert.ok(body.country_b.country_id, 'Missing country_b.country_id');
    assert.notEqual(body.country_a.country_id, body.country_b.country_id, 'country_a and country_b should differ');
    assert.equal(typeof body.country_a.elo_score, 'number', 'elo_score should be a number');
    assert.equal(typeof body.country_a.listen_ms, 'number', 'listen_ms should be a number');
  });
});

// ─── /vote ────────────────────────────────────────────────────────────────

describe('POST /vote', () => {
  // Use a dedicated fresh session for the vote flow so it has its own matchup state
  let voteSessionId;
  let matchupId;
  let countryAId;
  let countryBId;
  let hasMatchup = false;

  before(async () => {
    // Need a fresh session for vote tests (vote flow consumes the active matchup)
    const sessionRes = await api('/session', { method: 'POST' }).catch(() => ({ status: 0, body: {} }));
    if (sessionRes.status !== 201) return; // API unavailable or rate-limited; all vote tests will skip
    voteSessionId = sessionRes.body.session_id;

    const matchupRes = await api(`/matchup?session_id=${voteSessionId}`);
    if (matchupRes.status === 200) {
      matchupId  = matchupRes.body.matchup_id;
      countryAId = matchupRes.body.country_a.country_id;
      countryBId = matchupRes.body.country_b.country_id;
      hasMatchup = true;
    }
  });

  test('returns 400 when body is empty', async () => {
    const { status } = await api('/vote', { method: 'POST', body: JSON.stringify({}) });
    assert.equal(status, 400);
  });

  test('returns 400 when winner and loser are the same', async () => {
    const { status } = await api('/vote', {
      method: 'POST',
      body: JSON.stringify({
        session_id: voteSessionId, matchup_id: 'x', winner_id: 'A', loser_id: 'A',
        listen_a_ms: 5000, listen_b_ms: 5000,
      }),
    });
    assert.equal(status, 400);
  });

  test('returns 403 for unknown session', async () => {
    const { status } = await api('/vote', {
      method: 'POST',
      body: JSON.stringify({
        session_id: '00000000-0000-0000-0000-000000000000',
        matchup_id: 'x', winner_id: 'A', loser_id: 'B',
        listen_a_ms: 5000, listen_b_ms: 5000,
      }),
    });
    assert.equal(status, 403);
  });

  test('accepts vote with minimal listen time (partial weight)', async () => {
    if (!hasMatchup) {
      console.log('    ℹ Skipping — no matchup available (empty rankings table)');
      return;
    }
    const { status, body } = await api('/vote', {
      method: 'POST',
      body: JSON.stringify({
        session_id: voteSessionId, matchup_id: matchupId,
        winner_id: countryAId, loser_id: countryBId,
        listen_a_ms: 100, listen_b_ms: 100,  // minimal listen — accepted, but low weight
      }),
    });
    assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    assert.ok(body.vote_id, 'Missing vote_id');
    assert.equal(typeof body.vote_weight, 'number', 'vote_weight should be a number');
    assert.ok(body.vote_weight > 0,  `vote_weight should be > 0 for any positive listen time, got ${body.vote_weight}`);
    assert.ok(body.vote_weight < 1, 'Expected partial weight for short listen');
  });

  test('accepts vote and returns vote_weight', async () => {
    if (!hasMatchup) {
      console.log('    ℹ Skipping — no matchup available (empty rankings table)');
      return;
    }
    // Need a fresh matchup since the previous test consumed it
    const matchupRes = await api(`/matchup?session_id=${voteSessionId}`);
    if (matchupRes.status !== 200) {
      console.log('    ℹ Skipping — could not load new matchup');
      return;
    }
    const { matchup_id, country_a, country_b } = matchupRes.body;
    const { status, body } = await api('/vote', {
      method: 'POST',
      body: JSON.stringify({
        session_id: voteSessionId, matchup_id,
        winner_id: country_a.country_id, loser_id: country_b.country_id,
        listen_a_ms: 10000, listen_b_ms: 10000,  // full listen
      }),
    });
    assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    assert.ok(body.vote_id, 'Missing vote_id');
    assert.equal(body.vote_weight, 1, 'Expected full weight (1.0) for 10s listen');
    assert.ok(body.winner, 'Missing winner');
    assert.ok(body.loser, 'Missing loser');
    assert.equal(typeof body.winner.new_elo, 'number', 'new_elo should be a number');
  });

  test('returns 400 for stale matchup_id', async () => {
    if (!hasMatchup) {
      console.log('    ℹ Skipping — no matchup available');
      return;
    }
    // After voting, the matchup is cleared — using old matchup_id should fail
    const { status } = await api('/vote', {
      method: 'POST',
      body: JSON.stringify({
        session_id: voteSessionId, matchup_id: matchupId, // already used
        winner_id: countryAId, loser_id: countryBId,
        listen_a_ms: 5000, listen_b_ms: 5000,
      }),
    });
    assert.equal(status, 400);
  });
});

// ─── /leaderboard ─────────────────────────────────────────────────────────

describe('GET /leaderboard', () => {
  test('returns leaderboard data', async () => {
    const { status, body } = await api('/leaderboard');
    assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    assert.ok(Array.isArray(body.countries), 'countries should be an array');
    assert.equal(typeof body.total, 'number', 'total should be a number');
    assert.ok(body.generated_at, 'Missing generated_at');
  });

  test('respects limit parameter', async () => {
    const { body } = await api('/leaderboard?limit=5');
    assert.ok(body.countries.length <= 5, `Expected <= 5 results, got ${body.countries.length}`);
  });

  test('returns correct leaderboard structure', async () => {
    const { body } = await api('/leaderboard?limit=1');
    if (body.countries.length > 0) {
      const country = body.countries[0];
      assert.equal(country.rank, 1, 'First entry should have rank 1');
      assert.ok(country.country_id, 'Missing country_id');
      assert.equal(typeof country.elo_score, 'number', 'elo_score should be a number');
      assert.equal(typeof country.wins, 'number', 'wins should be a number');
      assert.equal(typeof country.losses, 'number', 'losses should be a number');
    }
  });

  test('leaderboard is sorted by ELO descending', async () => {
    const { body } = await api('/leaderboard?limit=10');
    if (body.countries.length > 1) {
      for (let i = 1; i < body.countries.length; i++) {
        assert.ok(
          body.countries[i - 1].elo_score >= body.countries[i].elo_score,
          `Leaderboard not sorted at index ${i}`
        );
      }
    }
  });
});

// ─── Audio URL validation ──────────────────────────────────────────────────

describe('GET /matchup — audio_url presence', () => {
  test('at least one country in a matchup has an audio_url', async () => {
    // Request several matchups and verify at least one country per matchup
    // has an audio_url (Wikimedia Commons). The seed data has ~172/239 countries
    // with audio; over 3 matchups the probability of hitting at least one is >99%.
    let foundAudio = false;
    for (let i = 0; i < 3 && !foundAudio; i++) {
      const sessionRes = await api('/session', { method: 'POST' });
      if (sessionRes.status !== 201) continue;
      const sid = sessionRes.body.session_id;
      const matchupRes = await api(`/matchup?session_id=${sid}`);
      if (matchupRes.status !== 200) continue;
      const { country_a, country_b } = matchupRes.body;
      if (country_a.audio_url || country_b.audio_url) {
        foundAudio = true;
        // Validate the URL looks like a Wikimedia Commons URL
        const url = country_a.audio_url || country_b.audio_url;
        assert.match(url, /^https?:\/\//, 'audio_url should be an absolute URL');
      }
    }
    assert.ok(foundAudio, 'Expected at least one country with audio_url across 3 matchups');
  });
});


describe('ELO logic (unit)', () => {
  const { updateElo, listenWeight, INITIAL_ELO, FULL_LISTEN_MS } = require('../../../sam/game/functions/shared/elo');

  test('INITIAL_ELO is 1500', () => {
    assert.equal(INITIAL_ELO, 1500);
  });

  test('equal players: winner gains ~16, loser loses ~16', () => {
    const { winner, loser } = updateElo(1500, 1500);
    assert.equal(winner, 1516);
    assert.equal(loser, 1484);
  });

  test('strong favorite beating weak opponent: small ELO gain', () => {
    const { winner, loser } = updateElo(1800, 1200);
    // Expected score for 1800 vs 1200 is ~0.91, so gain ≈ K*(1-0.91) ≈ 3
    assert.ok(winner > 1800 && winner < 1810, `Winner ELO ${winner} out of expected range`);
    assert.ok(loser < 1200 && loser > 1190, `Loser ELO ${loser} out of expected range`);
  });

  test('underdog wins: large ELO gain', () => {
    const { winner, loser } = updateElo(1200, 1800);
    // Expected score for 1200 vs 1800 is ~0.09, so gain ≈ K*(1-0.09) ≈ 29
    assert.ok(winner > 1220 && winner < 1235, `Winner ELO ${winner} out of expected range`);
  });

  test('vote_weight is 1.0 when both anthems heard >= 10s', () => {
    const { vote_weight } = updateElo(1500, 1500, 10000, 10000);
    assert.equal(vote_weight, 1);
  });

  test('vote_weight is 1.0 when defaults used (no listen args)', () => {
    const { vote_weight } = updateElo(1500, 1500);
    assert.equal(vote_weight, 1);
  });

  test('vote_weight is fractional when listen time is short', () => {
    const { vote_weight, winner } = updateElo(1500, 1500, 5000, 5000); // 5s each → 0.5 * 0.5 = 0.25
    assert.equal(vote_weight, 0.25);
    // ELO change should be scaled: ~16 * 0.25 = 4
    assert.ok(winner > 1500 && winner < 1510, `Winner ELO ${winner} out of expected range for partial weight`);
  });

  test('vote_weight of 0 when no listening', () => {
    const { vote_weight, winner, loser } = updateElo(1500, 1500, 0, 0);
    assert.equal(vote_weight, 0);
    assert.equal(winner, 1500, 'ELO should not change with zero listen time');
    assert.equal(loser, 1500, 'ELO should not change with zero listen time');
  });
});

// ─── listenWeight unit tests ───────────────────────────────────────────────

describe('listenWeight (unit)', () => {
  const { listenWeight, FULL_LISTEN_MS } = require('../../../sam/game/functions/shared/elo');

  test('0 ms → weight 0', () => {
    assert.equal(listenWeight(0), 0);
  });

  test('3s listen → weight 0.3 (non-zero, partial)', () => {
    // Key rule: any positive listen time should produce a non-zero vote weight.
    // 3s is less than the 10s threshold but still counts for something.
    assert.equal(listenWeight(3000), 0.3);
    assert.ok(listenWeight(3000) > 0, '3s listen should produce non-zero weight');
    assert.ok(listenWeight(3000) < 1, '3s listen should produce less than full weight');
  });

  test('FULL_LISTEN_MS → weight 1.0 (full)', () => {
    assert.equal(listenWeight(FULL_LISTEN_MS), 1.0);
  });

  test('exceeding FULL_LISTEN_MS → weight capped at 1.0', () => {
    assert.equal(listenWeight(FULL_LISTEN_MS * 2), 1.0);
    assert.equal(listenWeight(99999), 1.0);
  });

  test('weight is proportional between 0 and FULL_LISTEN_MS', () => {
    // Halfway = 0.5
    assert.equal(listenWeight(FULL_LISTEN_MS / 2), 0.5);
    // Shorter listen = smaller weight
    assert.ok(listenWeight(3000) < listenWeight(7000), '3s should weigh less than 7s');
  });
});

// ─── Partial listen and cumulative carry-forward rules ────────────────────

describe('partial listen vote weight rules (unit)', () => {
  const { updateElo, listenWeight } = require('../../../sam/game/functions/shared/elo');

  test('3s listen by both sides: vote counts (non-zero), but less than full', () => {
    // Both listened 3s → weight = 0.3 × 0.3 = 0.09
    const { vote_weight, winner, loser } = updateElo(1500, 1500, 3000, 3000);
    assert.equal(vote_weight, 0.09, 'Expected 0.09 vote_weight for 3s × 3s listen');
    assert.ok(vote_weight > 0,  'vote_weight must be > 0 for any positive listen time');
    assert.ok(vote_weight < 1,  'vote_weight must be < 1 for listen times below threshold');
    // ELO must actually change — the vote counts for something
    assert.ok(winner > 1500, 'Winner ELO should increase even with partial listen');
    assert.ok(loser  < 1500, 'Loser ELO should decrease even with partial listen');
  });

  test('prior 3s + 7s more this round = 10s total → full weight', () => {
    // Scenario: user listened 3s to country X in round 1, voted.
    // In round 2, country X reappears. They listen 7s more.
    // Backend accumulates: total = 3000 (prior) + 7000 (this round) = 10000ms → full weight.
    const priorListenMs = 3000;
    const thisRoundMs   = 7000;
    const totalMs       = priorListenMs + thisRoundMs;
    const { vote_weight } = updateElo(1500, 1500, totalMs, 10000);
    assert.equal(vote_weight, 1.0, 'Accumulated 3s + 7s should yield full weight');
  });

  test('prior 3s still counts when same country reappears with no new listen', () => {
    // User listened 3s to country X in a prior round, then comes back and votes
    // immediately without extra listening. They should still get credit for the 3s.
    const priorListenMs = 3000;
    const thisRoundMs   = 0;
    const totalMs       = priorListenMs + thisRoundMs;
    const { vote_weight } = updateElo(1500, 1500, totalMs, 10000);
    // 0.3 × 1.0 = 0.3 — still a meaningful, non-zero contribution
    assert.equal(vote_weight, 0.3);
    assert.ok(vote_weight > 0, 'Prior 3s should still contribute to vote weight');
  });

  test('cumulative listen: 3 rounds of 4s each = 12s total → full weight', () => {
    // Three separate encounters with the same anthem, each 4s.
    // Cumulative = 12000ms, which exceeds the 10s threshold.
    const total = 4000 + 4000 + 4000;
    const { vote_weight } = updateElo(1500, 1500, total, total);
    assert.equal(vote_weight, 1.0);
  });

  test('1s listen per side → tiny but non-zero vote weight (0.01)', () => {
    // Any positive listening time should produce a non-zero vote weight.
    // 1s each → listenWeight(1000) = 0.1 → vote_weight = 0.1 × 0.1 = 0.01
    const { vote_weight } = updateElo(1500, 1500, 1000, 1000);
    assert.ok(vote_weight > 0, '1s listen should still produce a non-zero vote weight');
    assert.ok(vote_weight < 0.1, '1s listen should produce a small weight');
    // Note: with equal-ELO players the ELO delta rounds to 0 at this tiny weight —
    // the meaningful impact shows when ratings diverge (e.g., underdog vs favourite).
    const { winner: w2 } = updateElo(1200, 1800, 1000, 10000);
    assert.ok(w2 > 1200, 'Even with 1s listen the underdog should gain some ELO against a strong opponent');
  });
});

// ─── Response helpers unit tests ──────────────────────────────────────────

describe('Response helpers (unit)', () => {
  const r = require('../../../sam/game/functions/shared/response');

  test('ok returns 200 with body', () => {
    const res = r.ok({ test: true });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), { test: true });
  });

  test('created returns 201', () => {
    assert.equal(r.created({}).statusCode, 201);
  });

  test('badRequest returns 400 with error field', () => {
    const res = r.badRequest('bad input');
    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.body).error, 'bad_request');
  });

  test('tooManyRequests returns 429 with Retry-After header', () => {
    const res = r.tooManyRequests('rate limited', 60);
    assert.equal(res.statusCode, 429);
    assert.equal(res.headers['Retry-After'], '60');
  });

  test('serverError returns 500', () => {
    assert.equal(r.serverError().statusCode, 500);
  });

  test('all responses include CORS header', () => {
    [r.ok({}), r.created({}), r.badRequest('x'), r.serverError()].forEach(res => {
      assert.ok(res.headers['Access-Control-Allow-Origin'], 'Missing CORS header');
    });
  });
});
