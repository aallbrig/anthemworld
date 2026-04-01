/**
 * POST /session
 * Creates an anonymous game session.
 * Rate-limits: MAX_SESSIONS_PER_IP per IP per day.
 *
 * Response 201: { session_id, user_country, created_at }
 * Response 429: rate limited
 */
const { PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const db = require('../shared/db');
const { created, tooManyRequests, options, serverError } = require('../shared/response');
const { detectLanguage } = require('../shared/messages');
const { hashIp, clientIp } = require('../shared/validate');

const SESSIONS_TABLE        = process.env.SESSIONS_TABLE;
const MAX_SESSIONS_PER_IP   = parseInt(process.env.MAX_SESSIONS_PER_IP || '3', 10);
// Session TTL: 24 hours
const SESSION_TTL_SECONDS   = 24 * 60 * 60;

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return options();
    const lang = detectLanguage(event.headers);

    try {
        const ipHash = hashIp(clientIp(event));
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

        // Check sessions created by this IP today
        const existing = await db.send(new QueryCommand({
            TableName: SESSIONS_TABLE,
            IndexName: 'ip-sessions-index',
            KeyConditionExpression: 'ip_hash = :h AND begins_with(created_date, :d)',
            ExpressionAttributeValues: { ':h': ipHash, ':d': today },
            Select: 'COUNT',
        }));

        if ((existing.Count || 0) >= MAX_SESSIONS_PER_IP) {
            return tooManyRequests(
                'session_limit_reached',
                86400,
                lang,
                { max: MAX_SESSIONS_PER_IP }
            );
        }

        const sessionId  = uuidv4();
        const createdAt  = new Date().toISOString();
        const ttl        = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;

        // Detect user country from IP (best-effort via CloudFront header)
        const userCountry = event.headers?.['CloudFront-Viewer-Country'] || null;

        await db.send(new PutCommand({
            TableName: SESSIONS_TABLE,
            Item: {
                session_id:   sessionId,
                ip_hash:      ipHash,
                created_date: createdAt,
                user_country: userCountry,
                vote_count:   0,
                ttl,
            },
        }));

        return created({ session_id: sessionId, user_country: userCountry, created_at: createdAt });
    } catch (err) {
        console.error('session error:', err);
        return serverError(null, lang);
    }
};
