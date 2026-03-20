/**
 * POST /listen
 * Body: { session_id, events: [{ country_id, total_listen_ms, max_position_ms, duration_ms,
 *         heard_full_weight, heard_full_anthem }] }
 *
 * Ingests client-side listen progress for one or more countries.
 * Updates ListenHistoryTable with the maximum values across client + server.
 *
 * Response 200: { updated: number }
 * Response 400: bad request
 * Response 403: session not found
 */
const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const db = require('../shared/db');
const { ok, badRequest, forbidden, serverError, options } = require('../shared/response');
const { detectLanguage } = require('../shared/messages');

const SESSIONS_TABLE = process.env.SESSIONS_TABLE;
const LISTEN_TABLE   = process.env.LISTEN_TABLE;
const MAX_EVENTS     = 50; // cap per request

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

    try {
        // Validate session exists
        const sessionRes = await db.send(new GetCommand({
            TableName: SESSIONS_TABLE,
            Key: { session_id },
        }));
        if (!sessionRes.Item) return forbidden('session_not_found', null, lang);

        const ttl = Math.floor(Date.now() / 1000) + 24 * 3600;
        let updated = 0;

        // Process each listen event
        const updates = events
            .filter(e => e.country_id && typeof e.total_listen_ms === 'number')
            .slice(0, MAX_EVENTS)
            .map(async (e) => {
                const pk = `${session_id}#${e.country_id.toUpperCase()}`;

                await db.send(new UpdateCommand({
                    TableName: LISTEN_TABLE,
                    Key: { pk },
                    UpdateExpression: [
                        'SET total_listen_ms = if_not_exists(total_listen_ms, :zero)',
                        'max_position_ms = if_not_exists(max_position_ms, :zero)',
                        'duration_ms = if_not_exists(duration_ms, :zero)',
                        'heard_full_weight = if_not_exists(heard_full_weight, :false)',
                        'heard_full_anthem = if_not_exists(heard_full_anthem, :false)',
                        'updated_at = :now',
                        '#ttl = :ttl',
                    ].join(', '),
                    ExpressionAttributeNames: { '#ttl': 'ttl' },
                    ExpressionAttributeValues: {
                        ':zero': 0,
                        ':false': false,
                        ':now': new Date().toISOString(),
                        ':ttl': ttl,
                    },
                }));

                // Second pass: update with max values using conditional
                const updateParts = [];
                const names = {};
                const values = {};

                if (e.total_listen_ms > 0) {
                    updateParts.push('total_listen_ms = :tlm');
                    values[':tlm'] = Math.max(0, e.total_listen_ms);
                }
                if (e.max_position_ms > 0) {
                    updateParts.push('max_position_ms = :mpm');
                    values[':mpm'] = Math.max(0, e.max_position_ms);
                }
                if (e.duration_ms > 0) {
                    updateParts.push('duration_ms = :dm');
                    values[':dm'] = Math.max(0, e.duration_ms);
                }
                if (e.heard_full_weight) {
                    updateParts.push('heard_full_weight = :true');
                    values[':true'] = true;
                }
                if (e.heard_full_anthem) {
                    updateParts.push('heard_full_anthem = :hfa');
                    values[':hfa'] = true;
                }

                if (updateParts.length > 0) {
                    await db.send(new UpdateCommand({
                        TableName: LISTEN_TABLE,
                        Key: { pk },
                        UpdateExpression: `SET ${updateParts.join(', ')}`,
                        ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
                        ExpressionAttributeValues: values,
                    }));
                }

                updated++;
            });

        await Promise.all(updates);

        return ok({ updated });
    } catch (err) {
        console.error('listen error:', err);
        return serverError(null, lang);
    }
};
