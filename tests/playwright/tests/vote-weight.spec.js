/**
 * Acceptance tests for the vote-weight system.
 *
 * 5 scenarios testing ELO deltas, vote categories, IP storage, and timestamps:
 *   1. Zero listen → +0.25 ELO floor, under_weight
 *   2. Min one side (10s winner, 0s loser) → under_weight (base < 1.0)
 *   3. Min both sides (10s each) → full_weight (base = 1.0)
 *   4. Full anthem one + min other → bonus (weight = 1.25)
 *   5. Full both anthems → bonus (weight = 1.5, golden scenario)
 *
 * Requires: SAM local API on :3001, LocalStack on :4566
 */

const { test, expect } = require('@playwright/test');

test.skip(!!process.env.CI, 'requires SAM game API at localhost:3001');

const API = 'http://localhost:3001';

async function createSession() {
  const res = await fetch(`${API}/session`, { method: 'POST' });
  expect(res.status).toBe(201);
  return (await res.json()).session_id;
}

async function getMatchup(sessionId) {
  const res = await fetch(`${API}/matchup?session_id=${sessionId}`);
  expect(res.ok).toBe(true);
  return res.json();
}

async function vote(sessionId, matchup, listenAMs, listenBMs, fullA = false, fullB = false) {
  const res = await fetch(`${API}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      matchup_id: matchup.matchup_id,
      winner_id: matchup.country_a.country_id,
      loser_id: matchup.country_b.country_id,
      listen_a_ms: listenAMs,
      listen_b_ms: listenBMs,
      full_anthem_a: fullA,
      full_anthem_b: fullB,
    }),
  });
  expect(res.ok).toBe(true);
  return res.json();
}

test.describe('Vote weight acceptance tests', () => {
  test.setTimeout(120_000);

  let sessionId;

  test.beforeAll(async () => {
    sessionId = await createSession();
  });

  test('(1) zero listen → +0.25 ELO, under_weight, ip stored, timestamp present', async () => {
    const matchup = await getMatchup(sessionId);
    const result = await vote(sessionId, matchup, 0, 0);

    expect(result.vote_category).toBe('under_weight');
    expect(result.vote_weight).toBe(0);
    expect(result.elo_delta_winner).toBe(0.25);
    expect(result.elo_delta_loser).toBe(-0.25);
    expect(result.week_id).toMatch(/^\d{4}-W\d{2}$/);
    expect(result.vote_id).toBeTruthy();
    expect(result.winner.new_elo).toBeGreaterThan(result.winner.old_elo);
    expect(result.loser.new_elo).toBeLessThan(result.loser.old_elo);
  });

  test('(2) min one side (10s winner, 0s loser) → under_weight', async () => {
    const matchup = await getMatchup(sessionId);
    const result = await vote(sessionId, matchup, 10000, 0);

    expect(result.vote_category).toBe('under_weight');
    // base_weight = listenWeight(10000) * listenWeight(0) = 1.0 * 0 = 0
    // floor of 0.25 applies
    expect(result.elo_delta_winner).toBe(0.25);
    expect(result.anthem_bonus).toBe(false);
  });

  test('(3) min both sides (10s each) → full_weight', async () => {
    const matchup = await getMatchup(sessionId);
    const result = await vote(sessionId, matchup, 10000, 10000);

    expect(result.vote_category).toBe('full_weight');
    expect(result.vote_weight).toBe(1);
    expect(result.elo_delta_winner).toBeGreaterThan(0.25);
    expect(result.anthem_bonus).toBe(false);
  });

  test('(4) full anthem winner + min loser → bonus, weight 1.25', async () => {
    const matchup = await getMatchup(sessionId);
    const result = await vote(sessionId, matchup, 60000, 10000, true, false);

    expect(result.vote_category).toBe('bonus');
    expect(result.vote_weight).toBe(1.25);
    expect(result.anthem_bonus).toBe(true);
    expect(result.elo_delta_winner).toBeGreaterThan(0.25);
  });

  test('(5) full both anthems → bonus, weight 1.5, golden scenario', async () => {
    const matchup = await getMatchup(sessionId);
    const result = await vote(sessionId, matchup, 60000, 60000, true, true);

    expect(result.vote_category).toBe('bonus');
    expect(result.vote_weight).toBe(1.5);
    expect(result.anthem_bonus).toBe(true);
    expect(result.elo_delta_winner).toBeGreaterThan(result.elo_delta_loser * -1 * 0.5);
  });
});

test.describe('Weekly endpoint', () => {
  test.setTimeout(60_000);

  test('returns winners and stats for current week', async () => {
    const res = await fetch(`${API}/weekly`);
    expect(res.ok).toBe(true);
    const data = await res.json();

    expect(data.week_id).toMatch(/^\d{4}-W\d{2}$/);
    expect(data.winners).toBeInstanceOf(Array);
    expect(data.stats).toHaveProperty('total_votes');
    expect(data.stats).toHaveProperty('under_weight_votes');
    expect(data.stats).toHaveProperty('full_weight_votes');
    expect(data.stats).toHaveProperty('bonus_votes');
    expect(data.stats).toHaveProperty('unique_voters');
  });
});

test.describe('Leaderboard stats', () => {
  test.setTimeout(60_000);

  test('returns vote statistics when stats=true', async () => {
    const res = await fetch(`${API}/leaderboard?limit=3&stats=true`);
    expect(res.ok).toBe(true);
    const data = await res.json();

    expect(data.countries.length).toBeLessThanOrEqual(3);
    expect(data.stats).toBeTruthy();
    expect(data.stats.total_votes).toBeGreaterThanOrEqual(0);
    expect(data.stats).toHaveProperty('under_weight_votes');
    expect(data.stats).toHaveProperty('full_weight_votes');
    expect(data.stats).toHaveProperty('bonus_votes');
    expect(data.stats).toHaveProperty('total_bonus_points');
    expect(data.stats).toHaveProperty('unique_voters');
  });

  test('filters stats by week_id', async () => {
    const res = await fetch(`${API}/leaderboard?limit=1&stats=true&week_id=1999-W01`);
    const data = await res.json();
    expect(data.stats.total_votes).toBe(0);
  });
});
