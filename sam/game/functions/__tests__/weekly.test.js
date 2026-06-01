process.env.VOTES_TABLE = 'votes';
process.env.RANKINGS_TABLE = 'rankings';

jest.mock('../shared/db', () => ({ send: jest.fn() }));

const { apiEvent, routeDb, db } = require('./helpers');
const { handler } = require('../weekly');

beforeEach(() => db.send.mockReset());

describe('GET /weekly', () => {
    test('OPTIONS preflight returns 204', async () => {
        expect((await handler(apiEvent({ method: 'OPTIONS' }))).statusCode).toBe(204);
    });

    test('400 on invalid week_id', async () => {
        const res = await handler(apiEvent({ query: { week_id: 'nope' } }));
        expect(res.statusCode).toBe(400);
    });

    test('returns top winners and stats for a week', async () => {
        const week = '2026-W21';
        routeDb({
            'ScanCommand:votes': { Items: [
                { session_id: 's1', week_id: week, winner_id: 'USA', loser_id: 'FRA', elo_delta_winner: 8, elo_delta_loser: -8, vote_category: 'full_weight', voter_country: 'USA' },
                { session_id: 's2', week_id: week, winner_id: 'USA', loser_id: 'JPN', elo_delta_winner: 6, elo_delta_loser: -6, vote_category: 'bonus', voter_country: 'GBR' },
                { session_id: 's3', week_id: 'other', winner_id: 'JPN', loser_id: 'USA', elo_delta_winner: 5, elo_delta_loser: -5 },
            ] },
            'ScanCommand:rankings': { Items: [
                { country_id: 'USA', name: 'United States' },
                { country_id: 'FRA', name: 'France' },
                { country_id: 'JPN', name: 'Japan' },
            ] },
        });
        const res = await handler(apiEvent({ query: { week_id: week } }));
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.week_id).toBe(week);
        expect(body.winners[0].country_id).toBe('USA'); // highest net ELO this week
        expect(body.stats.total_votes).toBe(2); // 'other' week filtered out
        expect(body.stats.unique_voters).toBe(2);
    });
});
