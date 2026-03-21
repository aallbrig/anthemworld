/**
 * DynamoDB test helpers — seed and inspect LocalStack tables directly.
 *
 * All functions use the test credentials (`test`/`test`) that match
 * the LocalStack namespace used by `make dev` and the seed scripts.
 *
 * Usage:
 *   const db = require('../helpers/db');
 *   const sid = await db.seedSession({ vote_count: 9 });
 *   await db.deleteSession(sid);
 */
'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  DeleteCommand,
  ScanCommand,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');

const ENDPOINT = process.env.LOCAL_DYNAMODB_ENDPOINT || 'http://localhost:4566';
const STAGE    = process.env.STAGE || 'local';
const REGION   = process.env.AWS_REGION || 'us-east-1';

const rawClient = new DynamoDBClient({
  region: REGION,
  endpoint: ENDPOINT,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
});

const db = DynamoDBDocumentClient.from(rawClient, {
  marshallOptions: { removeUndefinedValues: true },
});

const SESSIONS_TABLE = `anthem-sessions-${STAGE}`;
const RANKINGS_TABLE = `anthem-rankings-${STAGE}`;
const LISTEN_TABLE   = `anthem-listen-history-${STAGE}`;
const VOTES_TABLE    = `anthem-votes-${STAGE}`;

/**
 * Seed a session row. Returns the session_id used.
 * Any field can be overridden. Sensible defaults are applied for all fields.
 */
async function seedSession(overrides = {}) {
  const session_id = overrides.session_id || `test-sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = Math.floor(Date.now() / 1000);
  const today = new Date().toISOString().slice(0, 10);

  const item = {
    session_id,
    ip_hash:             overrides.ip_hash            ?? 'test-ip-hash-fixture',
    created_date:        overrides.created_date        ?? new Date().toISOString(),
    vote_count:          overrides.vote_count          ?? 0,
    vote_count_today:    overrides.vote_count_today    ?? 0,
    vote_date:           overrides.vote_date           ?? today,
    matchup_count_today: overrides.matchup_count_today ?? 0,
    matchup_date:        overrides.matchup_date        ?? today,
    ttl:                 overrides.ttl                 ?? now + 86400,
    ...overrides,
  };

  await db.send(new PutCommand({ TableName: SESSIONS_TABLE, Item: item }));
  return session_id;
}

/**
 * Seed a ranking row. Returns the country_id used.
 * Defaults give a country with a 60-second anthem and an audio URL,
 * which is required for it to appear in /matchup results.
 */
async function seedRanking(overrides = {}) {
  const item = {
    country_id:  overrides.country_id  ?? 'TST',
    name:        overrides.name        ?? 'Test Country',
    elo_score:   overrides.elo_score   ?? 1500,
    wins:        overrides.wins        ?? 0,
    losses:      overrides.losses      ?? 0,
    audio_url:   overrides.audio_url   ?? 'https://example.com/test.ogg',
    duration_ms: overrides.duration_ms ?? 60000,
    ...overrides,
  };
  await db.send(new PutCommand({ TableName: RANKINGS_TABLE, Item: item }));
  return item.country_id;
}

/**
 * Seed a listen-history row for a session+country.
 */
async function seedListenRecord(session_id, country_id, overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  const item = {
    pk:              `${session_id}#${country_id.toUpperCase()}`,
    total_listen_ms: overrides.total_listen_ms ?? 0,
    ttl:             overrides.ttl             ?? now + 86400,
    ...overrides,
  };
  await db.send(new PutCommand({ TableName: LISTEN_TABLE, Item: item }));
}

/** Fetch a session row. Returns null if not found. */
async function getSession(session_id) {
  const res = await db.send(new GetCommand({ TableName: SESSIONS_TABLE, Key: { session_id } }));
  return res.Item ?? null;
}

/** Fetch a ranking row. Returns null if not found. */
async function getRanking(country_id) {
  const res = await db.send(new GetCommand({ TableName: RANKINGS_TABLE, Key: { country_id } }));
  return res.Item ?? null;
}

/** Fetch a listen-history row. Returns null if not found. */
async function getListenRecord(session_id, country_id) {
  const res = await db.send(new GetCommand({
    TableName: LISTEN_TABLE,
    Key: { pk: `${session_id}#${country_id.toUpperCase()}` },
  }));
  return res.Item ?? null;
}

/** Delete a session row (cleanup after test). */
async function deleteSession(session_id) {
  await db.send(new DeleteCommand({ TableName: SESSIONS_TABLE, Key: { session_id } }));
}

/** Delete a ranking row (cleanup after test). */
async function deleteRanking(country_id) {
  await db.send(new DeleteCommand({ TableName: RANKINGS_TABLE, Key: { country_id } }));
}

/** Delete a listen-history row (cleanup after test). */
async function deleteListenRecord(session_id, country_id) {
  await db.send(new DeleteCommand({
    TableName: LISTEN_TABLE,
    Key: { pk: `${session_id}#${country_id.toUpperCase()}` },
  }));
}

/** Delete all sessions with a test_ prefix (safe cleanup for test runs). */
async function cleanupTestSessions() {
  let lastKey;
  do {
    const params = { TableName: SESSIONS_TABLE };
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const res = await db.send(new ScanCommand(params));
    const testItems = (res.Items || []).filter(i => i.session_id?.startsWith('test-sess-'));
    await Promise.all(testItems.map(i =>
      db.send(new DeleteCommand({ TableName: SESSIONS_TABLE, Key: { session_id: i.session_id } }))
    ));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
}

/** Delete rankings with test country codes (TST, TS2, TS3…). */
async function cleanupTestRankings() {
  const testIds = ['TST', 'TS2', 'TS3', 'TS4', 'TS5'];
  await Promise.all(testIds.map(id => deleteRanking(id)));
}

module.exports = {
  db,
  SESSIONS_TABLE, RANKINGS_TABLE, LISTEN_TABLE, VOTES_TABLE,
  seedSession, seedRanking, seedListenRecord,
  getSession, getRanking, getListenRecord,
  deleteSession, deleteRanking, deleteListenRecord,
  cleanupTestSessions, cleanupTestRankings,
};
