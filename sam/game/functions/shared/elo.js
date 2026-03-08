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
 * Compute new ELO ratings after a match, scaled by listen quality.
 *
 * voteWeight = listenWeight(winner) * listenWeight(loser)
 * Both anthems need to have been heard for a full-weight opinion.
 *
 * @param {number} ratingWinner
 * @param {number} ratingLoser
 * @param {number} totalListenWinnerMs  cumulative ms heard for winner anthem
 * @param {number} totalListenLoserMs   cumulative ms heard for loser anthem
 * @returns {{ winner: number, loser: number, vote_weight: number }}
 */
function updateElo(ratingWinner, ratingLoser, totalListenWinnerMs = FULL_LISTEN_MS, totalListenLoserMs = FULL_LISTEN_MS) {
    const weight = listenWeight(totalListenWinnerMs) * listenWeight(totalListenLoserMs);
    const eW = expectedScore(ratingWinner, ratingLoser);
    const eL = expectedScore(ratingLoser, ratingWinner);
    return {
        winner:      Math.round(ratingWinner + K * weight * (1 - eW)),
        loser:       Math.round(ratingLoser  + K * weight * (0 - eL)),
        vote_weight: Math.round(weight * 100) / 100,
    };
}

module.exports = { INITIAL_ELO, FULL_LISTEN_MS, updateElo };
