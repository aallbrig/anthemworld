process.env.RANKINGS_TABLE = 'rankings';
process.env.VOTES_TABLE = 'votes';

jest.mock('../shared/db', () => ({ send: jest.fn() }));

const { apiEvent, routeDb, db } = require('./helpers');
const { handler } = require('../leaderboard');

const RANKINGS = [
    { country_id: 'USA', name: 'United States', elo_score: 1600, wins: 3, losses: 1 },
    { country_id: 'FRA', name: 'France',        elo_score: 1500, wins: 1, losses: 1 },
    { country_id: 'JPN', name: 'Japan',         elo_score: 1700, wins: 5, losses: 0 },
];

beforeEach(() => db.send.mockReset());

describe('GET /leaderboard', () => {
    test('OPTIONS preflight returns 204', async () => {
        expect((await handler(apiEvent({ method: 'OPTIONS' }))).statusCode).toBe(204);
    });

    test('returns countries ranked by ELO descending', async () => {
        routeDb({ 'ScanCommand:rankings': { Items: RANKINGS } });
        const res = await handler(apiEvent({}));
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.countries[0].country_id).toBe('JPN'); // highest ELO
        expect(body.countries[0].rank).toBe(1);
        expect(body.total).toBe(3);
    });

    test('400 on invalid week_id', async () => {
        const res = await handler(apiEvent({ query: { stats: 'true', week_id: 'bogus' } }));
        expect(res.statusCode).toBe(400);
    });

    test('includes vote stats when stats=true', async () => {
        routeDb({
            'ScanCommand:rankings': { Items: RANKINGS },
            'ScanCommand:votes': { Items: [
                { session_id: 's1', vote_category: 'full_weight', voter_country: 'USA' },
                { session_id: 's2', vote_category: 'bonus', voter_country: 'FRA', anthem_bonus: true, elo_delta_winner: 5, vote_weight: 1 },
            ] },
        });
        const res = await handler(apiEvent({ query: { stats: 'true' } }));
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.stats.total_votes).toBe(2);
        expect(body.stats.unique_voters).toBe(2);
    });
});
