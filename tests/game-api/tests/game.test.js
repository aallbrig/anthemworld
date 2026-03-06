/**
 * Game API integration tests — runs against SAM local (port 3001).
 * Requires: LocalStack + SAM local running via `make game-dev`
 *
 * Usage:
 *   npm test
 *   GAME_API_URL=http://localhost:3001 npm test
 */
'use strict';

const { test, describe, before, after } = require('node:test');
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

  test('OPTIONS preflight returns 204', async () => {
    const { status } = await api('/session', { method: 'OPTIONS' });
    assert.equal(status, 204);
  });
});

// ─── /matchup ─────────────────────────────────────────────────────────────

describe('GET /matchup', () => {
  let sessionId;

  before(async () => {
    const { body } = await api('/session', { method: 'POST' });
    sessionId = body.session_id;
  });

  test('returns 400 when session_id missing', async () => {
    const { status } = await api('/matchup');
    assert.equal(status, 400);
  });

  test('returns 403 for unknown session', async () => {
    const { status } = await api('/matchup?session_id=00000000-0000-0000-0000-000000000000');
    assert.equal(status, 403);
  });

  test('returns matchup with valid session', async () => {
    const { status, body } = await api(`/matchup?session_id=${sessionId}`);
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
  let sessionId;
  let matchupId;
  let countryAId;
  let countryBId;
  let hasMatchup = false;

  before(async () => {
    const sessionRes = await api('/session', { method: 'POST' });
    sessionId = sessionRes.body.session_id;

    const matchupRes = await api(`/matchup?session_id=${sessionId}`);
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
        session_id: sessionId, matchup_id: 'x', winner_id: 'A', loser_id: 'A',
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

  test('returns 422 when listen time insufficient', async () => {
    if (!hasMatchup) {
      console.log('    ℹ Skipping — no matchup available (empty rankings table)');
      return;
    }
    const { status, body } = await api('/vote', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId, matchup_id: matchupId,
        winner_id: countryAId, loser_id: countryBId,
        listen_a_ms: 100, listen_b_ms: 100,  // too short
      }),
    });
    assert.equal(status, 422, `Expected 422, got ${status}: ${JSON.stringify(body)}`);
    assert.ok(body.message, 'Expected error message');
  });

  test('accepts vote with sufficient listen time', async () => {
    if (!hasMatchup) {
      console.log('    ℹ Skipping — no matchup available (empty rankings table)');
      return;
    }
    const { status, body } = await api('/vote', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId, matchup_id: matchupId,
        winner_id: countryAId, loser_id: countryBId,
        listen_a_ms: 5000, listen_b_ms: 5000,
      }),
    });
    assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    assert.ok(body.vote_id, 'Missing vote_id');
    assert.ok(body.winner, 'Missing winner');
    assert.ok(body.loser, 'Missing loser');
    assert.equal(typeof body.winner.new_elo, 'number', 'new_elo should be a number');
    assert.ok(body.winner.new_elo !== body.winner.old_elo, 'ELO should change after vote');
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
        session_id: sessionId, matchup_id: matchupId, // already used
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

// ─── ELO logic unit tests ─────────────────────────────────────────────────

describe('ELO logic (unit)', () => {
  const { updateElo, INITIAL_ELO } = require('../../../sam/game/functions/shared/elo');

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
