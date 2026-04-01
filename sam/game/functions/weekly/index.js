/**
 * GET /weekly?week_id=2026-W12
 *
 * Returns the top-3 anthem "winners of the week" based on net ELO gain,
 * plus aggregate vote statistics for the specified week.
 *
 * If week_id is omitted, uses the current ISO week.
 *
 * Response 200: {
 *   week_id, winners: [{ country_id, name, net_elo, wins, losses }],
 *   stats: { total_votes, under_weight_votes, full_weight_votes, bonus_votes,
 *            total_bonus_points, unique_voters, by_region, by_country }
 * }
 */
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const db = require('../shared/db');
const { ok, badRequest, serverError, options } = require('../shared/response');
const { detectLanguage } = require('../shared/messages');
const { isoWeekId } = require('../shared/week');
const { isValidWeekId, evictOldest } = require('../shared/validate');

const VOTES_TABLE    = process.env.VOTES_TABLE;
const RANKINGS_TABLE = process.env.RANKINGS_TABLE;

// Module-level cache: keyed by week_id, TTL 5 minutes
// P5: Capped to prevent memory exhaustion via arbitrary week_id values
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 60;
const cache = new Map();

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return options();
    const lang = detectLanguage(event.headers);

    const qs     = event.queryStringParameters || {};
    const weekId = qs.week_id || isoWeekId();

    // P0: Validate week_id format
    if (qs.week_id && !isValidWeekId(qs.week_id)) {
        return badRequest('invalid_week_id', null, lang);
    }

    // Return cached response if available
    const cached = cache.get(weekId);
    if (cached && Date.now() < cached.expiresAt) {
        return ok({ ...cached.body, cache_hit: true });
    }

    try {
        // Scan all votes (paginated) and filter by week_id
        let allVotes = [];
        let lastKey;
        do {
            const params = { TableName: VOTES_TABLE };
            if (lastKey) params.ExclusiveStartKey = lastKey;
            const res = await db.send(new ScanCommand(params));
            allVotes = allVotes.concat((res.Items || []).filter(v => v.week_id === weekId));
            lastKey = res.LastEvaluatedKey;
        } while (lastKey);

        // Aggregate per-country net ELO + per-country wins/losses
        const countryMap = {}; // country_id → { net_elo, wins, losses }
        const sessions = new Set();
        const stats = {
            total_votes: 0, under_weight_votes: 0, full_weight_votes: 0,
            bonus_votes: 0, total_bonus_points: 0, unique_voters: 0,
            by_region: {}, by_country: {},
        };

        for (const v of allVotes) {
            stats.total_votes++;
            if (v.session_id) sessions.add(v.session_id);

            const cat = v.vote_category || 'under_weight';
            if (cat === 'under_weight') stats.under_weight_votes++;
            else if (cat === 'full_weight') stats.full_weight_votes++;
            else if (cat === 'bonus') stats.bonus_votes++;

            // Winner
            const wid = v.winner_id;
            if (!countryMap[wid]) countryMap[wid] = { net_elo: 0, wins: 0, losses: 0 };
            countryMap[wid].net_elo += v.elo_delta_winner || 0;
            countryMap[wid].wins++;

            // Loser
            const lid = v.loser_id;
            if (!countryMap[lid]) countryMap[lid] = { net_elo: 0, wins: 0, losses: 0 };
            countryMap[lid].net_elo += v.elo_delta_loser || 0;
            countryMap[lid].losses++;

            // By voter country / region
            const vc = v.voter_country || 'Unknown';
            if (!stats.by_country[vc]) stats.by_country[vc] = { votes: 0, under_weight: 0, full_weight: 0, bonus: 0 };
            stats.by_country[vc].votes++;
            stats.by_country[vc][cat] = (stats.by_country[vc][cat] || 0) + 1;
        }

        stats.unique_voters = sessions.size;

        // Load ranking names for top countries
        const rankRes = await db.send(new ScanCommand({ TableName: RANKINGS_TABLE }));
        const nameMap = {};
        for (const r of (rankRes.Items || [])) {
            nameMap[r.country_id] = r.name || r.country_id;
        }

        // Top 3 by net ELO gain
        const winners = Object.entries(countryMap)
            .sort((a, b) => b[1].net_elo - a[1].net_elo)
            .slice(0, 3)
            .map(([id, data]) => ({
                country_id: id,
                name: nameMap[id] || id,
                net_elo: parseFloat(data.net_elo.toFixed(4)),
                wins: data.wins,
                losses: data.losses,
            }));

        const result = { week_id: weekId, winners, stats, cache_hit: false };
        // P5: Evict oldest entries when cache is full
        evictOldest(cache, MAX_CACHE_ENTRIES);
        cache.set(weekId, { body: result, expiresAt: Date.now() + CACHE_TTL_MS });
        return ok(result);
    } catch (err) {
        console.error('weekly error:', err);
        return serverError(null, lang);
    }
};
