/**
 * GET /matchup?session_id={id}
 * Returns two anthem entries for the user to compare.
 * Selects two countries with similar ELO scores (within 200 points).
 * Every 10th matchup is a wildcard (random ELO spread).
 * Includes per-anthem listen history so the client knows if voting is instant.
 *
 * Response 200: { matchup_id, country_a, country_b }
 *   country: { country_id, name, flag_url, anthem_name, audio_url, elo_score,
 *              listen_ms (cumulative ms heard this session) }
 * Response 400: missing session_id
 * Response 403: session not found / expired
 * Response 429: too many active matchups
 */
const { GetCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const db = require('../shared/db');
const { ok, badRequest, forbidden, serverError, options } = require('../shared/response');

const SESSIONS_TABLE = process.env.SESSIONS_TABLE;
const RANKINGS_TABLE = process.env.RANKINGS_TABLE;
const LISTEN_TABLE   = process.env.LISTEN_TABLE;

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return options();

    const sessionId = event.queryStringParameters?.session_id;
    if (!sessionId) return badRequest('session_id query parameter is required');

    try {
        // Validate session
        const sessionRes = await db.send(new GetCommand({ TableName: SESSIONS_TABLE, Key: { session_id: sessionId } }));
        if (!sessionRes.Item) return forbidden('Session not found or expired. Create a new session.');

        // Fetch all ranked countries (scan is fine at 193 items)
        const scanRes = await db.send(new ScanCommand({ TableName: RANKINGS_TABLE }));
        const allCountries = scanRes.Items || [];

        if (allCountries.length < 2) {
            return serverError('Not enough countries in rankings table. Run data initialization first.');
        }

        // Decide wildcard (every 10 votes inject a random pairing)
        const voteCount = sessionRes.Item.vote_count || 0;
        const isWildcard = (voteCount > 0 && voteCount % 10 === 0);

        // Pick country A randomly from full list
        const idxA = Math.floor(Math.random() * allCountries.length);
        const countryA = allCountries[idxA];

        let countryB;
        if (isWildcard) {
            // Wildcard: pick any other country
            let idxB;
            do { idxB = Math.floor(Math.random() * allCountries.length); } while (idxB === idxA);
            countryB = allCountries[idxB];
        } else {
            // ELO-similar: find candidates within 200 ELO points of A
            const eloA = countryA.elo_score || 1500;
            const candidates = allCountries.filter((c, i) =>
                i !== idxA && Math.abs((c.elo_score || 1500) - eloA) <= 200
            );
            const pool = candidates.length >= 2 ? candidates : allCountries.filter((_, i) => i !== idxA);
            countryB = pool[Math.floor(Math.random() * pool.length)];
        }

        // Fetch listen history for both countries in this session
        const [listenA, listenB] = await Promise.all([
            db.send(new GetCommand({ TableName: LISTEN_TABLE, Key: { pk: `${sessionId}#${countryA.country_id}` } })),
            db.send(new GetCommand({ TableName: LISTEN_TABLE, Key: { pk: `${sessionId}#${countryB.country_id}` } })),
        ]);

        const matchupId = uuidv4();

        // Store current matchup on session so vote can validate it
        await db.send(new UpdateCommand({
            TableName: SESSIONS_TABLE,
            Key: { session_id: sessionId },
            UpdateExpression: 'SET current_matchup = :m',
            ExpressionAttributeValues: { ':m': { matchup_id: matchupId, country_a: countryA.country_id, country_b: countryB.country_id } },
        }));

        const fmt = (country, listenRes) => ({
            country_id:   country.country_id,
            name:         country.name,
            flag_url:     country.flag_url || null,
            anthem_name:  country.anthem_name || null,
            audio_url:    country.audio_url || null,
            elo_score:    country.elo_score || 1500,
            wins:         country.wins || 0,
            losses:       country.losses || 0,
            listen_ms:    listenRes.Item?.total_listen_ms || 0,
        });

        return ok({
            matchup_id: matchupId,
            is_wildcard: isWildcard,
            country_a: fmt(countryA, listenA),
            country_b: fmt(countryB, listenB),
        });
    } catch (err) {
        console.error('matchup error:', err);
        return serverError();
    }
};
