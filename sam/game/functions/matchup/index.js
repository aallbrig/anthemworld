/**
 * GET /matchup?session_id={id}  OR  header X-Session-Id: {id}
 * Returns two anthem entries for the user to compare.
 * Selects two countries with similar ELO scores (within 200 points).
 * Every 10th vote triggers a wildcard (random ELO spread) on the NEXT matchup.
 *
 * Security mitigations:
 *   S-03: session_id accepted from X-Session-Id header (logs not exposed to query string)
 *   S-04: matchup_count_today cap (MAX_MATCHUPS_PER_SESSION per day)
 *   S-05: server-side TTL check rejects expired sessions
 *   S-08: wildcard condition fixed to (vote_count + 1) % 10 === 0
 *
 * Response 200: { matchup_id, country_a, country_b }
 *   country: { country_id, name, flag_url, anthem_name, audio_url, duration_ms,
 *              elo_score, listen_ms (cumulative ms heard this session) }
 * Response 400: missing session_id
 * Response 403: session not found / expired
 * Response 429: matchup daily cap exceeded
 */
// Required first so AWS SDK auto-instrumentation patches the client below.
const { withTelemetry, recordMatchupServed } = require('../shared/telemetry');
const { GetCommand, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const db = require('../shared/db');
const { ok, badRequest, forbidden, tooManyRequests, serverError, options } = require('../shared/response');
const { detectLanguage } = require('../shared/messages');
const { isValidUUID, hashIp, clientIp } = require('../shared/validate');

const SESSIONS_TABLE          = process.env.SESSIONS_TABLE;
const RANKINGS_TABLE          = process.env.RANKINGS_TABLE;
const LISTEN_TABLE            = process.env.LISTEN_TABLE;
const MAX_MATCHUPS_PER_SESSION = parseInt(process.env.MAX_MATCHUPS_PER_SESSION || '300', 10);

const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return options();
    const lang = detectLanguage(event.headers);

    // S-03: Accept session_id from header first, fall back to query param
    const sessionId = (event.headers || {})['X-Session-Id']
        || (event.headers || {})['x-session-id']
        || event.queryStringParameters?.session_id;

    if (!sessionId) return badRequest('matchup_session_required', null, lang);
    if (!isValidUUID(sessionId)) return badRequest('invalid_session_id', null, lang);

    try {
        // Validate session
        const sessionRes = await db.send(new GetCommand({ TableName: SESSIONS_TABLE, Key: { session_id: sessionId } }));
        if (!sessionRes.Item) return forbidden('session_not_found', null, lang);

        const session = sessionRes.Item;

        // S-05: Reject expired sessions (server-side TTL enforcement)
        const now = Math.floor(Date.now() / 1000);
        if (session.ttl && session.ttl < now) {
            return forbidden('session_expired', null, lang);
        }

        // P2: Verify request IP matches session creator
        const reqIpHash = hashIp(clientIp(event));
        if (session.ip_hash && session.ip_hash !== reqIpHash) {
            return forbidden('session_ip_mismatch', null, lang);
        }

        // S-04: Enforce daily matchup cap
        const today = new Date().toISOString().slice(0, 10);
        const matchupToday = session.matchup_date === today ? (session.matchup_count_today || 0) : 0;
        if (matchupToday >= MAX_MATCHUPS_PER_SESSION) {
            return tooManyRequests('matchup_limit_reached', 86400, lang, { max: MAX_MATCHUPS_PER_SESSION });
        }

        // Fetch all ranked countries (scan is fine at 193 items)
        const scanRes = await db.send(new ScanCommand({ TableName: RANKINGS_TABLE }));
        // Only battle countries that have an audio file
        const allCountries = (scanRes.Items || []).filter(c => c.audio_url);

        if (allCountries.length < 2) {
            return serverError('matchup_not_enough_countries', lang);
        }

        // S-08: Wildcard fires on the (vote_count+1)th matchup when it's a multiple of 10
        // i.e. every 10th vote triggers a wildcard on the next matchup request
        const voteCount = session.vote_count || 0;
        const isWildcard = voteCount > 0 && (voteCount + 1) % 10 === 0;

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

        // S-04: Increment matchup_count_today + store current matchup
        // P4: ConditionExpression prevents race condition on the counter
        try {
            await db.send(new UpdateCommand({
                TableName: SESSIONS_TABLE,
                Key: { session_id: sessionId },
                UpdateExpression: 'SET current_matchup = :m, matchup_count_today = :mc, matchup_date = :today',
                ConditionExpression: 'attribute_not_exists(matchup_date) OR matchup_date <> :today OR matchup_count_today < :max',
                ExpressionAttributeValues: {
                    ':m': { matchup_id: matchupId, country_a: countryA.country_id, country_b: countryB.country_id },
                    ':mc': matchupToday + 1,
                    ':today': today,
                    ':max': MAX_MATCHUPS_PER_SESSION,
                },
            }));
        } catch (condErr) {
            if (condErr.name === 'ConditionalCheckFailedException') {
                return tooManyRequests('matchup_limit_reached', 86400, lang, { max: MAX_MATCHUPS_PER_SESSION });
            }
            throw condErr;
        }

        const fmt = (country, listenRes) => ({
            country_id:   country.country_id,
            name:         country.name,
            flag_url:     country.flag_url || null,
            anthem_name:  country.anthem_name || null,
            audio_url:    country.audio_url || null,
            duration_ms:  country.duration_ms || null,
            elo_score:    country.elo_score || 1500,
            wins:         country.wins || 0,
            losses:       country.losses || 0,
            listen_ms:    listenRes.Item?.total_listen_ms || 0,
        });

        recordMatchupServed({ wildcard: isWildcard });
        return ok({
            matchup_id: matchupId,
            is_wildcard: isWildcard,
            country_a: fmt(countryA, listenA),
            country_b: fmt(countryB, listenB),
        });
    } catch (err) {
        console.error('matchup error:', err);
        return serverError(null, lang);
    }
};

exports.handler = withTelemetry('/matchup', handler);

