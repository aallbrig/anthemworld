const {
    K, INITIAL_ELO, FULL_LISTEN_MS, FULL_ANTHEM_BONUS, MIN_ELO_CHANGE,
    VOTE_CATEGORIES,
    listenWeight, categorizeVote, updateElo,
} = require('../shared/elo');

// ── Constants ────────────────────────────────────────────────────────────────

describe('constants', () => {
    test('K is 32', () => expect(K).toBe(32));
    test('INITIAL_ELO is 1500', () => expect(INITIAL_ELO).toBe(1500));
    test('FULL_LISTEN_MS is 10000', () => expect(FULL_LISTEN_MS).toBe(10_000));
    test('FULL_ANTHEM_BONUS is 0.25', () => expect(FULL_ANTHEM_BONUS).toBe(0.25));
    test('MIN_ELO_CHANGE is 0.25', () => expect(MIN_ELO_CHANGE).toBe(0.25));
    test('VOTE_CATEGORIES has expected values', () => {
        expect(VOTE_CATEGORIES.UNDER_WEIGHT).toBe('under_weight');
        expect(VOTE_CATEGORIES.FULL_WEIGHT).toBe('full_weight');
        expect(VOTE_CATEGORIES.BONUS).toBe('bonus');
    });
});

// ── listenWeight ─────────────────────────────────────────────────────────────

describe('listenWeight', () => {
    test('no listening → 0', () => {
        expect(listenWeight(0)).toBe(0);
    });

    test('half of threshold → 0.5', () => {
        expect(listenWeight(FULL_LISTEN_MS / 2)).toBe(0.5);
    });

    test('exactly at threshold → 1.0', () => {
        expect(listenWeight(FULL_LISTEN_MS)).toBe(1.0);
    });

    test('beyond threshold is capped at 1.0', () => {
        expect(listenWeight(FULL_LISTEN_MS * 2)).toBe(1.0);
        expect(listenWeight(99_999)).toBe(1.0);
    });

    test('quarter of threshold → 0.25', () => {
        expect(listenWeight(FULL_LISTEN_MS / 4)).toBe(0.25);
    });
});

// ── categorizeVote ───────────────────────────────────────────────────────────

describe('categorizeVote', () => {
    test('any anthem bonus → BONUS regardless of baseWeight', () => {
        expect(categorizeVote(0, 0.25)).toBe(VOTE_CATEGORIES.BONUS);
        expect(categorizeVote(1.0, 0.25)).toBe(VOTE_CATEGORIES.BONUS);
        expect(categorizeVote(0, 0.5)).toBe(VOTE_CATEGORIES.BONUS);
    });

    test('full baseWeight, no bonus → FULL_WEIGHT', () => {
        expect(categorizeVote(1.0, 0)).toBe(VOTE_CATEGORIES.FULL_WEIGHT);
    });

    test('partial baseWeight, no bonus → UNDER_WEIGHT', () => {
        expect(categorizeVote(0, 0)).toBe(VOTE_CATEGORIES.UNDER_WEIGHT);
        expect(categorizeVote(0.5, 0)).toBe(VOTE_CATEGORIES.UNDER_WEIGHT);
        expect(categorizeVote(0.99, 0)).toBe(VOTE_CATEGORIES.UNDER_WEIGHT);
    });
});

// ── updateElo ────────────────────────────────────────────────────────────────

describe('updateElo', () => {

    // ── return shape ─────────────────────────────────────────────────────────

    test('returns all expected keys', () => {
        const result = updateElo(1500, 1500);
        expect(result).toHaveProperty('winner');
        expect(result).toHaveProperty('loser');
        expect(result).toHaveProperty('vote_weight');
        expect(result).toHaveProperty('anthem_bonus');
        expect(result).toHaveProperty('vote_category');
        expect(result).toHaveProperty('elo_delta_winner');
        expect(result).toHaveProperty('elo_delta_loser');
    });

    // ── equal ratings, full listen (the standard case) ───────────────────────
    //
    // baseWeight = 1.0, weight = 1.0, eW = eL = 0.5
    // deltaW = 32 × 1.0 × (1 − 0.5) = +16
    // deltaL = 32 × 1.0 × (0 − 0.5) = −16

    test('equal ratings, full listen → standard ±16 delta', () => {
        const r = updateElo(1500, 1500, FULL_LISTEN_MS, FULL_LISTEN_MS);
        expect(r.winner).toBe(1516);
        expect(r.loser).toBe(1484);
        expect(r.elo_delta_winner).toBe(16);
        expect(r.elo_delta_loser).toBe(-16);
        expect(r.vote_weight).toBe(1.0);
        expect(r.anthem_bonus).toBe(false);
        expect(r.vote_category).toBe(VOTE_CATEGORIES.FULL_WEIGHT);
    });

    // ── winner has higher rating (favourite wins) ─────────────────────────────
    //
    // ratingWinner = 1700, ratingLoser = 1300 → 400-pt gap
    // eW = 1/(1+10^(−1)) = 10/11,  eL = 1/11
    // deltaW = 32 × (1/11)   = 32/11 → toFixed(4) → 2.9091
    // deltaL = 32 × (−1/11)  = −32/11 → toFixed(4) → −2.9091

    test('higher-rated winner: smaller delta (favourite wins less)', () => {
        const r = updateElo(1700, 1300, FULL_LISTEN_MS, FULL_LISTEN_MS);
        expect(r.winner).toBe(1702.9091);
        expect(r.loser).toBe(1297.0909);
        expect(r.elo_delta_winner).toBe(2.9091);
        expect(r.elo_delta_loser).toBe(-2.9091);
        expect(r.vote_category).toBe(VOTE_CATEGORIES.FULL_WEIGHT);
    });

    // ── lower-rated winner (upset) ────────────────────────────────────────────
    //
    // ratingWinner = 1300, ratingLoser = 1700 → upset
    // eW = 1/11,  1 − eW = 10/11
    // deltaW = 32 × (10/11) = 320/11 → toFixed(4) → 29.0909
    // deltaL = −320/11 → toFixed(4) → −29.0909

    test('lower-rated winner (upset): larger delta', () => {
        const r = updateElo(1300, 1700, FULL_LISTEN_MS, FULL_LISTEN_MS);
        expect(r.winner).toBe(1329.0909);
        expect(r.loser).toBe(1670.9091);
        expect(r.elo_delta_winner).toBe(29.0909);
        expect(r.elo_delta_loser).toBe(-29.0909);
    });

    // ── zero listen time → MIN_ELO_CHANGE floor ───────────────────────────────
    //
    // baseWeight = 0×0 = 0,  weight = 0
    // raw deltaW = deltaL = 0  →  both hit ±MIN_ELO_CHANGE floor

    test('zero listen time → floor ±0.25 applied', () => {
        const r = updateElo(1500, 1500, 0, 0);
        expect(r.winner).toBe(1500.25);
        expect(r.loser).toBe(1499.75);
        expect(r.elo_delta_winner).toBe(0.25);
        expect(r.elo_delta_loser).toBe(-0.25);
        expect(r.vote_weight).toBe(0);
        expect(r.vote_category).toBe(VOTE_CATEGORIES.UNDER_WEIGHT);
    });

    // ── heavy favourite wins → MIN_ELO_CHANGE floor ───────────────────────────
    //
    // ratingWinner = 2500, ratingLoser = 500 → 2000-pt gap
    // eW ≈ 0.99999,  raw deltaW ≈ 0.00032  →  floor → 0.25

    test('very high-rated winner: floor prevents delta below 0.25', () => {
        const r = updateElo(2500, 500, FULL_LISTEN_MS, FULL_LISTEN_MS);
        expect(r.winner).toBe(2500.25);
        expect(r.loser).toBe(499.75);
        expect(r.elo_delta_winner).toBe(0.25);
        expect(r.elo_delta_loser).toBe(-0.25);
    });

    // ── partial listen ────────────────────────────────────────────────────────
    //
    // 5000ms each → listenWeight = 0.5 each
    // baseWeight = 0.5 × 0.5 = 0.25,  weight = 0.25
    // deltaW = 32 × 0.25 × 0.5 = +4,  deltaL = −4

    test('partial listen both sides → scaled delta', () => {
        const r = updateElo(1500, 1500, FULL_LISTEN_MS / 2, FULL_LISTEN_MS / 2);
        expect(r.winner).toBe(1504);
        expect(r.loser).toBe(1496);
        expect(r.elo_delta_winner).toBe(4);
        expect(r.elo_delta_loser).toBe(-4);
        expect(r.vote_weight).toBe(0.25);
        expect(r.vote_category).toBe(VOTE_CATEGORIES.UNDER_WEIGHT);
    });

    // ── one anthem fully heard → 1.25× weight ────────────────────────────────
    //
    // baseWeight = 1.0,  anthemBonus = 0.25,  weight = 1.25
    // deltaW = 32 × 1.25 × 0.5 = +20,  deltaL = −20

    test('one anthem fully heard → 1.25× weight, BONUS category', () => {
        const r = updateElo(1500, 1500, FULL_LISTEN_MS, FULL_LISTEN_MS, true, false);
        expect(r.winner).toBe(1520);
        expect(r.loser).toBe(1480);
        expect(r.elo_delta_winner).toBe(20);
        expect(r.elo_delta_loser).toBe(-20);
        expect(r.vote_weight).toBe(1.25);
        expect(r.anthem_bonus).toBe(true);
        expect(r.vote_category).toBe(VOTE_CATEGORIES.BONUS);
    });

    // ── both anthems fully heard → 1.5× weight cap ───────────────────────────
    //
    // baseWeight = 1.0,  anthemBonus = 0.5,  weight = min(1.5, 1.5) = 1.5
    // deltaW = 32 × 1.5 × 0.5 = +24,  deltaL = −24

    test('both anthems fully heard → 1.5× weight cap', () => {
        const r = updateElo(1500, 1500, FULL_LISTEN_MS, FULL_LISTEN_MS, true, true);
        expect(r.winner).toBe(1524);
        expect(r.loser).toBe(1476);
        expect(r.elo_delta_winner).toBe(24);
        expect(r.elo_delta_loser).toBe(-24);
        expect(r.vote_weight).toBe(1.5);
        expect(r.anthem_bonus).toBe(true);
        expect(r.vote_category).toBe(VOTE_CATEGORIES.BONUS);
    });

    // ── anthem bonus does not exceed 1.5× weight cap ─────────────────────────
    //
    // Even with both anthems heard, weight is capped at 1.5, not 1.5+ something.
    // Verified by: weight = min(1.0 × 1.5, 1.5) = 1.5 exactly (no overshoot).

    test('weight never exceeds 1.5 cap', () => {
        const r = updateElo(1500, 1500, FULL_LISTEN_MS, FULL_LISTEN_MS, true, true);
        expect(r.vote_weight).toBeLessThanOrEqual(1.5);
    });

    // ── defaults: full listen, no anthem bonus ────────────────────────────────

    test('defaults (no listen args) treat both as FULL_LISTEN_MS', () => {
        const withDefaults = updateElo(1500, 1500);
        const withExplicit = updateElo(1500, 1500, FULL_LISTEN_MS, FULL_LISTEN_MS);
        expect(withDefaults).toEqual(withExplicit);
    });

    // ── winner always gains, loser always loses ───────────────────────────────

    test('winner ELO always increases', () => {
        expect(updateElo(1500, 1500).winner).toBeGreaterThan(1500);
        expect(updateElo(1700, 1300).winner).toBeGreaterThan(1700);
        expect(updateElo(1300, 1700).winner).toBeGreaterThan(1300);
        expect(updateElo(2500, 500).winner).toBeGreaterThan(2500);
    });

    test('loser ELO always decreases', () => {
        expect(updateElo(1500, 1500).loser).toBeLessThan(1500);
        expect(updateElo(1700, 1300).loser).toBeLessThan(1300);
        expect(updateElo(1300, 1700).loser).toBeLessThan(1700);
        expect(updateElo(2500, 500).loser).toBeLessThan(500);
    });

    // ── result precision ─────────────────────────────────────────────────────

    test('winner and loser are rounded to at most 4 decimal places', () => {
        const r = updateElo(1700, 1300, FULL_LISTEN_MS, FULL_LISTEN_MS);
        expect(r.winner).toBe(parseFloat(r.winner.toFixed(4)));
        expect(r.loser).toBe(parseFloat(r.loser.toFixed(4)));
    });
});
