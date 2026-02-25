/**
 * GET /leaderboard?limit={n}&last_key={cursor}
 * Returns countries sorted by ELO score descending.
 * Uses a full scan + sort (193 items — acceptable at this scale).
 *
 * Response 200: { countries: [...], total, generated_at }
 *   country: { rank, country_id, name, flag_url, elo_score, wins, losses, total_votes, win_rate }
 */
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const db = require('../shared/db');
const { ok, serverError, options } = require('../shared/response');

const RANKINGS_TABLE = process.env.RANKINGS_TABLE;

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return options();

    const limit = Math.min(parseInt(event.queryStringParameters?.limit || '50', 10), 200);

    try {
        const scanRes = await db.send(new ScanCommand({ TableName: RANKINGS_TABLE }));
        const items = scanRes.Items || [];

        // Sort by ELO descending, then alphabetically for ties
        items.sort((a, b) => {
            const diff = (b.elo_score || 1500) - (a.elo_score || 1500);
            return diff !== 0 ? diff : (a.name || '').localeCompare(b.name || '');
        });

        const ranked = items.slice(0, limit).map((item, i) => {
            const wins    = item.wins   || 0;
            const losses  = item.losses || 0;
            const total   = wins + losses;
            return {
                rank:        i + 1,
                country_id:  item.country_id,
                name:        item.name || item.country_id,
                flag_url:    item.flag_url || null,
                anthem_name: item.anthem_name || null,
                elo_score:   item.elo_score || 1500,
                wins,
                losses,
                total_votes: total,
                win_rate:    total > 0 ? Math.round((wins / total) * 100) : null,
            };
        });

        return ok({
            countries:    ranked,
            total:        items.length,
            generated_at: new Date().toISOString(),
        });
    } catch (err) {
        console.error('leaderboard error:', err);
        return serverError();
    }
};
