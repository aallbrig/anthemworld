/**
 * Input validation helpers shared across all Lambda handlers.
 */
const crypto = require('crypto');

/** UUID v4 format. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** ISO 8601 week ID: YYYY-Www where ww is 01–53. */
const WEEK_ID_RE = /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/;

function isValidUUID(str) {
    return typeof str === 'string' && UUID_RE.test(str);
}

function isValidWeekId(str) {
    return typeof str === 'string' && WEEK_ID_RE.test(str);
}

/** SHA-256 hash of an IP address (or 'unknown' fallback). */
function hashIp(ip) {
    return crypto.createHash('sha256').update(ip || 'unknown').digest('hex');
}

/** Extract client IP from API Gateway event. */
function clientIp(event) {
    return event.requestContext?.identity?.sourceIp || 'unknown';
}

/**
 * Evict the oldest entry from a Map-based cache when it exceeds maxSize.
 * Call before inserting a new key.
 */
function evictOldest(cache, maxSize) {
    while (cache.size >= maxSize) {
        const oldest = cache.keys().next().value;
        cache.delete(oldest);
    }
}

module.exports = { isValidUUID, isValidWeekId, hashIp, clientIp, evictOldest };
