/**
 * POST /listen
 * Body: { session_id, events: [{ country_id, total_listen_ms, max_position_ms, duration_ms,
 *         heard_full_weight, heard_full_anthem }] }
 *
 * Ingests client-side listen progress for one or more countries.
 * Updates ListenHistoryTable with the maximum values across client + server.
 *
 * Security mitigations:
 *   S-05: expired sessions rejected with 403
 *   S-06: country_id validated against ISO-2/3 regex (rejects injection attempts)
 *   S-01: total_listen_ms capped at 2× anthem duration_ms from rankings table
 *
 * Response 200: { updated: number }
 * Response 400: bad request / invalid country_id
 * Response 403: session not found / expired
 */
const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const db = require('../shared/db');
const { ok, badRequest, forbidden, serverError, options } = require('../shared/response');
const { detectLanguage } = require('../shared/messages');

const SESSIONS_TABLE = process.env.SESSIONS_TABLE;
const RANKINGS_TABLE = process.env.RANKINGS_TABLE;
const LISTEN_TABLE   = process.env.LISTEN_TABLE;
const MAX_EVENTS     = 50; // cap per request

/** Default listen cap when ranking has no duration_ms: 10 minutes. */
const DEFAULT_MAX_DURATION_MS = 10 * 60 * 1000;

/** S-06: Valid country_id — ISO-3166-1 alpha-2 or alpha-3 (2–3 uppercase letters). */
const COUNTRY_ID_RE = /^[A-Z]{2,3}$/;

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return options();
    const lang = detectLanguage(event.headers);

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return badRequest('listen_invalid_json', null, lang);
    }

    const { session_id, events } = body;
    if (!session_id) return badRequest('listen_session_required', null, lang);
    if (!Array.isArray(events) || events.length === 0) {
        return badRequest('listen_events_required', null, lang);
    }
    if (events.length > MAX_EVENTS) {
        return badRequest('listen_too_many_events', null, lang, { max: MAX_EVENTS });
    }

    // S-06: Validate all country_ids up front before touching DynamoDB
    for (const e of events) {
        const id = typeof e.country_id === 'string' ? e.country_id.toUpperCase() : '';
        if (!COUNTRY_ID_RE.test(id)) {
            return badRequest('listen_invalid_country_id', null, lang);
        }
    }

    try {
        // Validate session exists
        const sessionRes = await db.send(new GetCommand({
            TableName: SESSIONS_TABLE,
            Key: { session_id },
        }));
        if (!sessionRes.Item) return forbidden('session_not_found', null, lang);

        // S-05: Reject expired sessions server-side
        const nowSec = Math.floor(Date.now() / 1000);
        if (sessionRes.Item.ttl && sessionRes.Item.ttl < nowSec) {
            return forbidden('session_expired', null, lang);
        }

        // S-01: Fetch anthem duration_ms for each unique country to cap listen times
        const uniqueIds = [...new Set(events.map(e => e.country_id.toUpperCase()))];
        const rankingResults = await Promise.all(
            uniqueIds.map(id => db.send(new GetCommand({ TableName: RANKINGS_TABLE, Key: { country_id: id } })))
        );
        const durationMap = {};
        uniqueIds.forEach((id, i) => {
            durationMap[id] = rankingResults[i].Item?.duration_ms || DEFAULT_MAX_DURATION_MS;
        });

        const ttl = Math.floor(Date.now() / 1000) + 24 * 3600;
        let updated = 0;

        // Process each listen event (single write per event)
        const updates = events
            .filter(e => e.country_id && typeof e.total_listen_ms === 'number')
            .slice(0, MAX_EVENTS)
            .map(async (e) => {
                const countryId = e.country_id.toUpperCase();
                const pk = `${session_id}#${countryId}`;

                // S-01: Cap total_listen_ms at 2× anthem duration
                const maxAllowedMs = 2 * (durationMap[countryId] || DEFAULT_MAX_DURATION_MS);
                const cappedListenMs = Math.min(Math.max(0, e.total_listen_ms), maxAllowedMs);

                const setParts = [
                    'total_listen_ms = :tlm',
                    'updated_at = :now',
                    '#ttl = :ttl',
                ];
                const values = {
                    ':tlm': cappedListenMs,
                    ':now': new Date().toISOString(),
                    ':ttl': ttl,
                };

                if (e.max_position_ms > 0) {
                    setParts.push('max_position_ms = :mpm');
                    values[':mpm'] = Math.max(0, e.max_position_ms);
                }
                if (e.duration_ms > 0) {
                    setParts.push('duration_ms = :dm');
                    values[':dm'] = Math.max(0, e.duration_ms);
                }
                // Boolean flags: set true when client says true, otherwise
                // preserve existing value (if_not_exists defaults new items).
                if (e.heard_full_weight) {
                    setParts.push('heard_full_weight = :true_fw');
                    values[':true_fw'] = true;
                } else {
                    setParts.push('heard_full_weight = if_not_exists(heard_full_weight, :false_fw)');
                    values[':false_fw'] = false;
                }
                if (e.heard_full_anthem) {
                    setParts.push('heard_full_anthem = :true_fa');
                    values[':true_fa'] = true;
                } else {
                    setParts.push('heard_full_anthem = if_not_exists(heard_full_anthem, :false_fa)');
                    values[':false_fa'] = false;
                }

                await db.send(new UpdateCommand({
                    TableName: LISTEN_TABLE,
                    Key: { pk },
                    UpdateExpression: `SET ${setParts.join(', ')}`,
                    ExpressionAttributeNames: { '#ttl': 'ttl' },
                    ExpressionAttributeValues: values,
                }));

                updated++;
            });

        await Promise.all(updates);

        return ok({ updated });
    } catch (err) {
        console.error('listen error:', err);
        return serverError(null, lang);
    }
};
