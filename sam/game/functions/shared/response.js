/**
 * HTTP response helpers — CORS headers included on every response.
 */
const CORS = {
    'Access-Control-Allow-Origin':  process.env.CORS_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Session-Id',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

function ok(body) {
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function created(body) {
    return { statusCode: 201, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function badRequest(message, details) {
    return {
        statusCode: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'bad_request', message, ...(details ? { details } : {}) }),
    };
}

function forbidden(message, retryAfter) {
    return {
        statusCode: 403,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'forbidden', message, ...(retryAfter ? { retry_after: retryAfter } : {}) }),
    };
}

function tooManyRequests(message, retryAfter) {
    return {
        statusCode: 429,
        headers: { ...CORS, 'Content-Type': 'application/json', ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}) },
        body: JSON.stringify({ error: 'rate_limited', message, retry_after: retryAfter }),
    };
}

function unprocessable(message, details) {
    return {
        statusCode: 422,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'unprocessable', message, ...(details ? { details } : {}) }),
    };
}

function serverError(message) {
    return {
        statusCode: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'internal_error', message: message || 'An unexpected error occurred' }),
    };
}

function options() {
    return { statusCode: 204, headers: CORS, body: '' };
}

module.exports = { ok, created, badRequest, forbidden, tooManyRequests, unprocessable, serverError, options };
