/**
 * Shared test helpers for handler unit tests.
 *
 * Handlers `require('../shared/db')` and call `db.send(command)`. Test files
 * mock that module with `jest.mock('../shared/db', () => ({ send: jest.fn() }))`;
 * because Jest's module registry is shared, the `db` required here is the same
 * mock instance the handler under test uses.
 */
const db = require('../shared/db');

/** Build a minimal API Gateway proxy event. */
function apiEvent({ method = 'GET', body, headers = {}, query = null, ip = '1.2.3.4' } = {}) {
    return {
        httpMethod: method,
        headers,
        queryStringParameters: query,
        body: body === undefined ? null : (typeof body === 'string' ? body : JSON.stringify(body)),
        requestContext: { identity: { sourceIp: ip } },
    };
}

/**
 * Route mocked DynamoDB calls. `routes` maps either `CommandName:TableName`
 * (e.g. `GetCommand:sessions`) or just `CommandName` to a response value or a
 * `(input) => response` function. Unmatched calls throw so tests fail loudly.
 */
function routeDb(routes) {
    db.send.mockImplementation((command) => {
        const name = command.constructor.name;
        const table = command.input?.TableName;
        const handler = routes[`${name}:${table}`] ?? routes[name];
        if (handler === undefined) {
            return Promise.reject(new Error(`Unexpected DynamoDB call: ${name} on ${table}`));
        }
        const res = typeof handler === 'function' ? handler(command.input) : handler;
        return Promise.resolve(res);
    });
}

module.exports = { db, apiEvent, routeDb };
