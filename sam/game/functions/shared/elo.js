/**
 * ELO rating helpers.
 * K=32 is standard for a new/volatile system.
 */
const K = 32;
const INITIAL_ELO = 1500;

/**
 * Expected score for player A given ratings.
 */
function expectedScore(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Compute new ELO ratings after a match.
 * @param {number} ratingWinner
 * @param {number} ratingLoser
 * @returns {{ winner: number, loser: number }}
 */
function updateElo(ratingWinner, ratingLoser) {
    const eW = expectedScore(ratingWinner, ratingLoser);
    const eL = expectedScore(ratingLoser, ratingWinner);
    return {
        winner: Math.round(ratingWinner + K * (1 - eW)),
        loser:  Math.round(ratingLoser  + K * (0 - eL)),
    };
}

module.exports = { INITIAL_ELO, updateElo };
