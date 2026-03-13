/**
 * HTTP response helpers — CORS headers included on every response.
 */
const { translate } = require('./messages');

const CORS = {
    'Access-Control-Allow-Origin':  process.env.CORS_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type,X-Session-Id,Accept-Language',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

function messageFor(lang, message, vars) {
    if (!message) return translate(lang || 'en', 'internal_error');
    return translate(lang || 'en', message, vars);
}

function ok(body) {
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function created(body) {
    return { statusCode: 201, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function badRequest(message, details, lang, vars) {
    return {
        statusCode: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'bad_request', message: messageFor(lang, message, vars), ...(details ? { details } : {}) }),
    };
}

function forbidden(message, retryAfter, lang, vars) {
    return {
        statusCode: 403,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'forbidden', message: messageFor(lang, message, vars), ...(retryAfter ? { retry_after: retryAfter } : {}) }),
    };
}

function tooManyRequests(message, retryAfter, lang, vars) {
    return {
        statusCode: 429,
        headers: { ...CORS, 'Content-Type': 'application/json', ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}) },
        body: JSON.stringify({ error: 'rate_limited', message: messageFor(lang, message, vars), retry_after: retryAfter }),
    };
}

function unprocessable(message, details, lang, vars) {
    return {
        statusCode: 422,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'unprocessable', message: messageFor(lang, message, vars), ...(details ? { details } : {}) }),
    };
}

function serverError(message, lang, vars) {
    return {
        statusCode: 500,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'internal_error', message: messageFor(lang, message || 'internal_error', vars) }),
    };
}

function options() {
    return { statusCode: 204, headers: CORS, body: '' };
}

module.exports = { ok, created, badRequest, forbidden, tooManyRequests, unprocessable, serverError, options };
