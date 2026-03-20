/**
 * ELO rating helpers.
 * K=32 is standard for a new/volatile system.
 */
const K = 32;
const INITIAL_ELO = 1500;

/**
 * Time in ms a user must listen to an anthem (cumulative, any rounds)
 * for their vote to carry full weight on that track.
 */
const FULL_LISTEN_MS = 10_000;

/**
 * Fractional bonus applied when a user listened to the entire anthem.
 * Each full-anthem flag can boost the combined weight by this fraction.
 * Max combined weight is capped at 1.5 (both anthems heard in full = +50%).
 */
const FULL_ANTHEM_BONUS = 0.25;

/**
 * Minimum absolute ELO change per vote.  Every genuine vote moves ELO by
 * at least this amount, even when the user didn't listen at all.  Respects
 * the user: their vote always counts, even if lightly.
 */
const MIN_ELO_CHANGE = 0.25;

/**
 * Vote weight category thresholds.
 */
const VOTE_CATEGORIES = {
    UNDER_WEIGHT: 'under_weight',
    FULL_WEIGHT:  'full_weight',
    BONUS:        'bonus',
};

/**
 * Expected score for player A given ratings.
 */
function expectedScore(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Compute the listen weight for a single anthem [0, 1].
 * weight = clamp(totalListenMs / FULL_LISTEN_MS, 0, 1)
 */
function listenWeight(totalListenMs) {
    return Math.min(totalListenMs / FULL_LISTEN_MS, 1.0);
}

/**
 * Determine vote category from base weight and anthem bonus.
 */
function categorizeVote(baseWeight, anthemBonus) {
    if (anthemBonus > 0) return VOTE_CATEGORIES.BONUS;
    if (baseWeight >= 1.0) return VOTE_CATEGORIES.FULL_WEIGHT;
    return VOTE_CATEGORIES.UNDER_WEIGHT;
}

/**
 * Compute new ELO ratings after a match, scaled by listen quality.
 *
 * baseWeight = listenWeight(winner) × listenWeight(loser)  (0–1.0)
 * anthemBonus adds FULL_ANTHEM_BONUS per fully-heard anthem, capped at 1.5.
 * voteWeight = min(baseWeight × (1 + anthemBonus), 1.5)
 *
 * ELO deltas are stored as decimals (not rounded to integers).
 * A minimum floor of MIN_ELO_CHANGE (0.25) ensures every genuine vote counts.
 *
 * @param {number}  ratingWinner
 * @param {number}  ratingLoser
 * @param {number}  totalListenWinnerMs  cumulative ms heard for winner anthem
 * @param {number}  totalListenLoserMs   cumulative ms heard for loser anthem
 * @param {boolean} fullAnthemWinner     user heard the winner anthem in full
 * @param {boolean} fullAnthemLoser      user heard the loser anthem in full
 * @returns {{ winner: number, loser: number, vote_weight: number, anthem_bonus: boolean,
 *             vote_category: string, elo_delta_winner: number, elo_delta_loser: number }}
 */
function updateElo(
    ratingWinner, ratingLoser,
    totalListenWinnerMs = FULL_LISTEN_MS, totalListenLoserMs = FULL_LISTEN_MS,
    fullAnthemWinner = false, fullAnthemLoser = false
) {
    const baseWeight  = listenWeight(totalListenWinnerMs) * listenWeight(totalListenLoserMs);
    const anthemBonus = (fullAnthemWinner ? FULL_ANTHEM_BONUS : 0) +
                        (fullAnthemLoser  ? FULL_ANTHEM_BONUS : 0);
    const weight = Math.min(baseWeight * (1 + anthemBonus), 1.5);

    const eW = expectedScore(ratingWinner, ratingLoser);
    const eL = expectedScore(ratingLoser, ratingWinner);

    let deltaW = K * weight * (1 - eW);
    let deltaL = K * weight * (0 - eL);

    // Floor: every vote produces at least ±MIN_ELO_CHANGE
    if (Math.abs(deltaW) < MIN_ELO_CHANGE) deltaW = MIN_ELO_CHANGE;
    if (Math.abs(deltaL) < MIN_ELO_CHANGE) deltaL = -MIN_ELO_CHANGE;

    const newWinner = parseFloat((ratingWinner + deltaW).toFixed(4));
    const newLoser  = parseFloat((ratingLoser  + deltaL).toFixed(4));

    return {
        winner:           newWinner,
        loser:            newLoser,
        vote_weight:      Math.round(weight * 100) / 100,
        anthem_bonus:     fullAnthemWinner || fullAnthemLoser,
        vote_category:    categorizeVote(baseWeight, anthemBonus),
        elo_delta_winner: parseFloat(deltaW.toFixed(4)),
        elo_delta_loser:  parseFloat(deltaL.toFixed(4)),
    };
}

module.exports = {
    K, INITIAL_ELO, FULL_LISTEN_MS, FULL_ANTHEM_BONUS, MIN_ELO_CHANGE,
    VOTE_CATEGORIES, listenWeight, categorizeVote, updateElo,
};
