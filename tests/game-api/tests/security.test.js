/**
 * Security integration tests — exercises all findings from docs/security.md.
 *
 * Tests are written RED-first (TDD). Run after implementing each fix to watch
 * them turn green. Requires: LocalStack + SAM local running (`make dev`).
 *
 * Usage:
 *   npm run test:security
 *   GAME_API_URL=http://localhost:3001 npm run test:security
 */
'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const dbh = require('../helpers/db');

const BASE_URL = process.env.GAME_API_URL || 'http://localhost:3001';

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const body = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body, headers: res.headers };
}

// ─── S-01: Client-controlled listen times ─────────────────────────────────

describe('S-01: listen time cap prevents ELO manipulation', () => {
  let sessionId, matchupId;

  before(async () => {
    // Seed two test countries with known 60-second anthems
    await dbh.seedRanking({ country_id: 'TST', name: 'Test Country A', duration_ms: 60_000 });
    await dbh.seedRanking({ country_id: 'TS2', name: 'Test Country B', duration_ms: 60_000 });

    matchupId = `test-matchup-${Date.now()}`;
    sessionId = await dbh.seedSession({
      current_matchup: { matchup_id: matchupId, country_a: 'TST', country_b: 'TS2' },
    });
  });

  after(async () => {
    await dbh.deleteSession(sessionId);
    await dbh.cleanupTestRankings();
  });

  test('vote: full_anthem flag is rejected server-side when listen_ms < anthem duration', async () => {
    const { status, body } = await api('/vote', {
      method: 'POST',
      body: JSON.stringify({
        session_id:   sessionId,
        matchup_id:   matchupId,
        winner_id:    'TST',
        loser_id:     'TS2',
        listen_a_ms:  1_000, // 1s — well below 60s duration
        listen_b_ms:  1_000,
        full_anthem_a: true, // ATTACK: claim full anthem without listening
        full_anthem_b: true,
      }),
    });

    assert.equal(status, 200, `Expected 200, got ${status}: ${JSON.stringify(body)}`);
    // Server must ignore the full_anthem flag when listen < duration
    assert.equal(body.anthem_bonus, false,
      `anthem_bonus should be false when listen_ms (1000) < duration_ms (60000), got: ${body.anthem_bonus}`);
    assert.notEqual(body.vote_category, 'bonus',
      `vote_category should not be 'bonus' when listen time is insufficient, got: ${body.vote_category}`);
  });

  test('/listen: total_listen_ms is capped at 2× anthem duration', async () => {
    const capSession = await dbh.seedSession();

    const { status, body } = await api('/listen', {
      method: 'POST',
      body: JSON.stringify({
        session_id: capSession,
        events: [{
          country_id:      'TST',
          total_listen_ms: 999_999, // ATTACK: claim 1000 seconds of listen
          max_position_ms: 999_999,
          duration_ms:     60_000,
          heard_full_weight: true,
          heard_full_anthem: true,
        }],
      }),
    });

    assert.equal(status, 200, `Expected 200: ${JSON.stringify(body)}`);

    const record = await dbh.getListenRecord(capSession, 'TST');
    assert.ok(record, 'Listen record should have been created');

    const CAP = 60_000 * 2; // 2 × duration_ms
    assert.ok(
      record.total_listen_ms <= CAP,
      `total_listen_ms (${record.total_listen_ms}) should be capped at ${CAP}`
    );

    await dbh.deleteSession(capSession);
  });
});

// ─── S-02: API Gateway throttling (static config test) ────────────────────
// Covered by config.test.js

// ─── S-03: session_id via X-Session-Id header ─────────────────────────────

describe('S-03: /matchup accepts session_id from X-Session-Id header', () => {
  let sessionId;

  before(async () => {
    sessionId = await dbh.seedSession();
  });

  after(async () => {
    await dbh.deleteSession(sessionId);
  });

  test('X-Session-Id header is accepted (no query param)', async () => {
    const { status } = await api('/matchup', {
      headers: { 'X-Session-Id': sessionId },
    });
    // 200 = matchup found; 500 = no rankings but session was accepted
    // Either way, NOT 400 (missing session) or 403 (session not found)
    assert.ok(
      status !== 400 && status !== 403,
      `Expected session to be found via header, got ${status}`
    );
  });

  test('returns 400 when neither header nor query param provided', async () => {
    const { status } = await api('/matchup');
    assert.equal(status, 400, `Expected 400 when no session_id supplied, got ${status}`);
  });

  test('query param still works as backward-compatible fallback', async () => {
    const { status } = await api(`/matchup?session_id=${sessionId}`);
    assert.ok(
      status !== 400 && status !== 403,
      `Expected query param fallback to work, got ${status}`
    );
  });
});

// ─── S-04: Matchup farming / cap ──────────────────────────────────────────

describe('S-04: /matchup rate-limits matchup requests per session per day', () => {
  const MAX = parseInt(process.env.MAX_MATCHUPS_PER_SESSION || '300', 10);
  let cappedSessionId, okSessionId;

  before(async () => {
    const today = new Date().toISOString().slice(0, 10);
    cappedSessionId = await dbh.seedSession({
      matchup_count_today: MAX,
      matchup_date: today,
    });
    okSessionId = await dbh.seedSession({
      matchup_count_today: MAX - 1,
      matchup_date: today,
    });
  });

  after(async () => {
    await dbh.deleteSession(cappedSessionId);
    await dbh.deleteSession(okSessionId);
  });

  test('returns 429 when matchup_count_today is at cap', async () => {
    const { status } = await api(`/matchup?session_id=${cappedSessionId}`);
    assert.equal(status, 429, `Expected 429 when at matchup cap, got ${status}`);
  });

  test('returns 200 or 500 (not 429) when one below cap', async () => {
    const { status } = await api(`/matchup?session_id=${okSessionId}`);
    assert.ok(status !== 429, `Expected not 429 when below cap, got ${status}`);
  });
});

// ─── S-05: Server-side session TTL check ──────────────────────────────────

describe('S-05: expired sessions are rejected with 403', () => {
  let expiredSessionId, matchupId;

  before(async () => {
    matchupId = `test-matchup-ttl-${Date.now()}`;
    expiredSessionId = await dbh.seedSession({
      ttl: Math.floor(Date.now() / 1000) - 60, // expired 60 seconds ago
      current_matchup: {
        matchup_id: matchupId,
        country_a: 'TST',
        country_b: 'TS2',
      },
    });
  });

  after(async () => {
    await dbh.deleteSession(expiredSessionId);
  });

  test('GET /matchup returns 403 for expired session', async () => {
    const { status, body } = await api(`/matchup?session_id=${expiredSessionId}`);
    assert.equal(status, 403,
      `Expected 403 for expired session, got ${status}: ${JSON.stringify(body)}`);
  });

  test('POST /vote returns 403 for expired session', async () => {
    const { status, body } = await api('/vote', {
      method: 'POST',
      body: JSON.stringify({
        session_id: expiredSessionId,
        matchup_id: matchupId,
        winner_id: 'TST', loser_id: 'TS2',
        listen_a_ms: 5000, listen_b_ms: 5000,
      }),
    });
    assert.equal(status, 403,
      `Expected 403 for expired session in /vote, got ${status}: ${JSON.stringify(body)}`);
  });

  test('POST /listen returns 403 for expired session', async () => {
    const { status, body } = await api('/listen', {
      method: 'POST',
      body: JSON.stringify({
        session_id: expiredSessionId,
        events: [{ country_id: 'TST', total_listen_ms: 1000 }],
      }),
    });
    assert.equal(status, 403,
      `Expected 403 for expired session in /listen, got ${status}: ${JSON.stringify(body)}`);
  });
});

// ─── S-06: Country ID validation in /listen ───────────────────────────────

describe('S-06: /listen validates country_id', () => {
  let sessionId;

  before(async () => {
    sessionId = await dbh.seedSession();
  });

  after(async () => {
    await dbh.deleteSession(sessionId);
  });

  test('rejects country_id that fails alpha-2/3 regex', async () => {
    const { status, body } = await api('/listen', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        events: [{ country_id: 'HACK123', total_listen_ms: 1000 }],
      }),
    });
    assert.equal(status, 400,
      `Expected 400 for invalid country_id 'HACK123', got ${status}: ${JSON.stringify(body)}`);
  });

  test('rejects country_id with special characters', async () => {
    const { status } = await api('/listen', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        events: [{ country_id: 'US A', total_listen_ms: 1000 }],
      }),
    });
    assert.equal(status, 400, `Expected 400 for country_id 'US A', got ${status}`);
  });

  test('accepts valid ISO-3 country code', async () => {
    const { status } = await api('/listen', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        events: [{ country_id: 'USA', total_listen_ms: 1000 }],
      }),
    });
    assert.equal(status, 200, `Expected 200 for valid country_id 'USA', got ${status}`);
  });

  test('accepts valid ISO-2 country code', async () => {
    const { status } = await api('/listen', {
      method: 'POST',
      body: JSON.stringify({
        session_id: sessionId,
        events: [{ country_id: 'US', total_listen_ms: 1000 }],
      }),
    });
    assert.equal(status, 200, `Expected 200 for valid country_id 'US', got ${status}`);
  });
});

// ─── S-07: Stats scan caching ─────────────────────────────────────────────

describe('S-07: /leaderboard?stats=true caches result for 5 minutes', () => {
  test('consecutive calls return the same generated_at (cache hit)', async () => {
    const r1 = await api('/leaderboard?stats=true&limit=1');
    assert.equal(r1.status, 200, `First call failed: ${JSON.stringify(r1.body)}`);
    const generated1 = r1.body?.generated_at;
    assert.ok(generated1, 'Response missing generated_at');

    // Immediate second call should hit cache
    const r2 = await api('/leaderboard?stats=true&limit=1');
    assert.equal(r2.status, 200);
    const generated2 = r2.body?.generated_at;

    assert.equal(generated2, generated1,
      `Cache miss: generated_at changed between immediate calls (${generated1} vs ${generated2})`);
    assert.equal(r2.body?.cache_hit, true,
      `Expected cache_hit: true on second call, got: ${r2.body?.cache_hit}`);
  });
});

// ─── S-08: vote_count increment (wildcard logic) ──────────────────────────

describe('S-08: every 10th matchup is a wildcard', () => {
  let sessionId;

  before(async () => {
    sessionId = await dbh.seedSession({ vote_count: 9 });
  });

  after(async () => {
    await dbh.deleteSession(sessionId);
  });

  test('is_wildcard is true when session vote_count is a multiple of 10', async () => {
    const { status, body } = await api(`/matchup?session_id=${sessionId}`);
    // May be 500 if no rankings, but if we get a matchup it must be wildcard
    if (status === 200) {
      assert.equal(body.is_wildcard, true,
        `Expected is_wildcard=true at vote_count=9+1=10, got: ${body.is_wildcard}`);
    } else {
      // Rankings empty — can't get matchup but session logic is correct
      assert.notEqual(status, 403, 'Session should still be valid');
    }
  });

  test('is_wildcard is false when vote_count is not a multiple of 10', async () => {
    const mid = await dbh.seedSession({ vote_count: 8 });
    const { status, body } = await api(`/matchup?session_id=${mid}`);
    if (status === 200) {
      assert.equal(body.is_wildcard, false,
        `Expected is_wildcard=false at vote_count=8, got: ${body.is_wildcard}`);
    }
    await dbh.deleteSession(mid);
  });
});

// ─── S-11: CORS origin per stage ──────────────────────────────────────────

describe('S-11: CORS Access-Control-Allow-Origin matches CORS_ORIGIN env var', () => {
  test('CORS origin is not a bare wildcard when CORS_ORIGIN env is set', async () => {
    const expectedOrigin = process.env.CORS_ORIGIN;
    if (!expectedOrigin || expectedOrigin === '*') {
      // In local dev with CORS_ORIGIN=* this test is informational only
      console.log('    ℹ CORS_ORIGIN is * or unset — set a specific origin to enforce this test');
      return;
    }
    const { headers } = await api('/leaderboard');
    const origin = headers.get('access-control-allow-origin');
    assert.equal(origin, expectedOrigin,
      `Expected CORS origin '${expectedOrigin}', got '${origin}'`);
  });

  test('CORS header is present on all endpoints', async () => {
    const endpoints = [
      ['/leaderboard', { method: 'GET' }],
      ['/session',     { method: 'POST' }],
    ];
    for (const [path, opts] of endpoints) {
      const { headers } = await api(path, opts);
      const origin = headers.get('access-control-allow-origin');
      assert.ok(origin, `Missing Access-Control-Allow-Origin on ${path}`);
    }
  });
});
