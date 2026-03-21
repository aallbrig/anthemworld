# Game API Security Analysis

**Analysis date:** 2026-03-21T13:28:34Z  
**Commit analysed:** `8a1b094e6d924701ecae263581180e4716165a20`  
_(feat: listen progress indicators across all pages)_

**Scope:** The six SAM Lambda endpoints (`/session`, `/matchup`, `/vote`, `/listen`,
`/leaderboard`, `/weekly`) and their shared infrastructure (`template.yaml`,
`shared/db.js`, `shared/elo.js`, `shared/response.js`).

---

## Summary Table

| # | Finding | Endpoint(s) | Priority | Locally testable? |
|---|---------|------------|----------|-------------------|
| S-01 | Client-controlled listen times → ELO manipulation | `/vote`, `/listen` | 🔴 P1 HIGH | ✅ Yes |
| S-02 | No API Gateway throttling configured | All | 🔴 P1 HIGH | ✅ Yes (LocalStack) |
| S-03 | `session_id` exposed in query string | `/matchup` | 🟠 P2 MED | ✅ Yes |
| S-04 | Matchup farming — cherry-picking pairings | `/matchup` | 🟠 P2 MED | ✅ Yes |
| S-05 | Session TTL not enforced server-side | `/matchup`, `/vote`, `/listen` | 🟠 P2 MED | ✅ Yes |
| S-06 | Country ID not validated against whitelist | `/listen` | 🟠 P2 MED | ✅ Yes |
| S-07 | Unbounded table scan on `/leaderboard?stats=true` and `/weekly` | `/leaderboard`, `/weekly` | 🟠 P2 MED | ✅ Yes |
| S-08 | `vote_count` never incremented (wildcard logic broken) | `/matchup` | 🟡 P3 LOW | ✅ Yes |
| S-09 | IP-only rate limiting — botnet bypass | `/session` | 🟡 P3 LOW | ✅ Yes |
| S-10 | `CloudFront-Viewer-Country` header spoofable outside CloudFront | `/session`, `/vote` | 🟡 P3 LOW | ✅ Yes |
| S-11 | CORS `*` — any origin may call the API | All | 🟡 P3 LOW | ✅ Yes |

---

## Detailed Findings

---

### S-01 🔴 P1 — Client-Controlled Listen Times Enable ELO Manipulation

**Files:** `vote/index.js:56`, `listen/index.js:61`, `shared/elo.js`

**Description**  
ELO delta is scaled by `vote_weight`, which is derived entirely from `listen_a_ms`,
`listen_b_ms`, `heard_full_anthem_a`, and `heard_full_anthem_b` values submitted by the
client. There is no server-side cap, no cross-check against the anthem's actual duration,
and no independent verification that the user actually played the audio.

A script can submit:
```json
{
  "session_id": "...",
  "matchup_id": "...",
  "winner_id": "FRA",
  "loser_id": "DEU",
  "listen_a_ms": 999999,
  "listen_b_ms": 999999,
  "full_anthem_a": true,
  "full_anthem_b": true
}
```
This yields the maximum `vote_weight` (1.5) and `anthem_bonus`, giving ~+24 ELO per vote
instead of ~+4 for a quick vote. 100 such votes per session per day → +2400 ELO/day for
a chosen country.

Similarly, `POST /listen` accepts `total_listen_ms: 999999` and `heard_full_anthem: true`
with no ceiling, pre-inflating the cumulative listen counters before the vote is cast.

**Mitigation**

1. Store `duration_ms` for each anthem in `RankingsTable` (or a separate table) when
   seeding rankings.
2. In `/vote` (and `/listen`), cap each submitted listen value:
   ```js
   const MAX_LISTEN_CAP_FACTOR = 2.0; // allow up to 2× anthem duration
   const cap = (anthemDuration || FULL_LISTEN_MS) * MAX_LISTEN_CAP_FACTOR;
   const safeListenA = Math.min(Math.max(0, listen_a_ms), cap);
   ```
3. Reject `heard_full_anthem: true` server-side unless the stored
   `total_listen_ms ≥ duration_ms` for that country in this session.
4. Keep ELO deltas as they are; only the input cap changes — no ELO formula rewrite
   needed.

**Locally testable?** Yes. Add `duration_ms` to seed script, add cap logic to
`vote/index.js` and `listen/index.js`, write a Jest test that submits an inflated value
and asserts the stored `total_listen_ms` is capped.

---

### S-02 🔴 P1 — No API Gateway Throttling Configured

**File:** `template.yaml`

**Description**  
`template.yaml` defines no `UsagePlan`, `ApiKey`, or `ThrottlingSettings` on the
`GameApi` resource. The API is completely open to flood:

- Any IP can call `GET /leaderboard?stats=true` or `GET /weekly` thousands of times per
  second, each triggering a full paginated `ScanCommand` on `VotesTable`. As vote counts
  grow this becomes both slow and expensive.
- `POST /session` application-level rate limiting (5/IP/day) still fires a DynamoDB
  `QueryCommand` before rejecting — a 1000 req/s flood to `/session` from a single IP
  costs 1000 DynamoDB reads/s just to enforce the limit.
- Lambda concurrency is limited per AWS account but still incurs cost.

**Mitigation**

Add throttling to the API Gateway stage in `template.yaml`:
```yaml
GameApi:
  Type: AWS::Serverless::Api
  Properties:
    StageName: !Ref Stage
    MethodSettings:
      - ResourcePath: "/*"
        HttpMethod: "*"
        ThrottlingBurstLimit: 50
        ThrottlingRateLimit: 20
    Cors: ...
```
For production, also add a `UsagePlan` with a monthly quota.

Additionally, add AWS WAF (via `AWS::WAFv2::WebACL`) for IP-based rate limiting at the
edge — this is supported in LocalStack Pro or can be mocked in tests.

**Locally testable?** Yes — `ThrottlingBurstLimit`/`ThrottlingRateLimit` on
`MethodSettings` is supported by LocalStack and `sam local` (though SAM local doesn't
enforce it in dev, the template is what gets deployed).

---

### S-03 🟠 P2 — `session_id` Exposed in Query String

**File:** `matchup/index.js:26`

**Description**  
`GET /matchup?session_id=<uuid>` puts the session token in the URL. This means it
appears in:
- Server access logs
- Browser history
- HTTP `Referer` headers sent to third-party resources loaded on the game page
- Any intermediate proxy/CDN logs

An attacker who gains access to logs can steal valid session tokens and submit votes on
behalf of real users (though since all users are anonymous, the main risk is vote
stuffing via stolen sessions).

**Mitigation**  
Move `session_id` to the `X-Session-Id` request header (already defined in `CORS`
`AllowHeaders`). Update `matchup/index.js`:
```js
const sessionId = event.headers?.['X-Session-Id'] ||
                  event.headers?.['x-session-id'] ||
                  event.queryStringParameters?.session_id; // keep as fallback during migration
```
Update the frontend `game.js` to send the header instead of the query param.

**Locally testable?** Yes — change and verify with existing `sam local` + curl tests.

---

### S-04 🟠 P2 — Matchup Farming (Cherry-Picking Pairings)

**File:** `matchup/index.js`

**Description**  
`GET /matchup` can be called any number of times. Each call overwrites
`current_matchup` on the session, with no rate limit or history check. A script can
call `/matchup` in a loop until a desired country pair appears (e.g., a strong country
vs. a very weak one), then vote. This allows gaming the ELO system by selecting only
favourable matchups.

The DynamoDB `ScanCommand` on `RankingsTable` is also called on every `/matchup`
request — at 193+ items this is fine today, but matchup farming amplifies it.

**Mitigation**

1. **Track matchup requests per session per day.** Add a `matchup_count_today` field to
   the session (same pattern as `vote_count_today`) and cap at e.g. `MAX_VOTES * 3`.
2. **Optionally record recent matchup pairs** (last N) on the session and refuse to
   re-issue the same pairing in the same session.
3. Return `429` when the matchup cap is exceeded.

**Locally testable?** Yes.

---

### S-05 🟠 P2 — Session TTL Not Enforced Server-Side

**Files:** `matchup/index.js:33`, `vote/index.js:59`, `listen/index.js:53`

**Description**  
DynamoDB TTL deletion is eventually consistent — items with an expired `ttl` field can
remain in the table for up to **48 hours** after expiry. None of the session validation
code checks whether `session.ttl < now`. A session nominally valid for 24 hours could
in practice be usable for up to 72 hours.

```js
// Current check — only looks for item existence:
if (!sessionRes.Item) return forbidden(...);

// Missing check:
const now = Math.floor(Date.now() / 1000);
if (session.ttl && session.ttl < now) return forbidden('session_expired', ...);
```

**Mitigation**  
Add a TTL check immediately after the session item is loaded in all three endpoints:
```js
const now = Math.floor(Date.now() / 1000);
if (session.ttl && session.ttl < now) return forbidden('session_expired', null, lang);
```

**Locally testable?** Yes — write a test that seeds a session with `ttl` set to 1 second
ago and asserts the endpoint returns 403.

---

### S-06 🟠 P2 — Country ID Not Validated Against Whitelist in `/listen`

**File:** `listen/index.js:64`

**Description**  
`e.country_id.toUpperCase()` is the only normalisation applied to the `country_id` field
in `/listen` events. Any string is accepted, including:
- Excessively long strings (DynamoDB PK has a 2048-byte limit, but values waste capacity)
- Fake country codes (`"HACK"`, `"XXXX"`) that pollute `ListenHistoryTable`
- Values with special characters

Since `/vote` validates `winner_id`/`loser_id` against the session's `current_matchup`,
vote manipulation via fake country IDs is blocked there. But `/listen` has no such guard,
so listen history can be polluted with arbitrary keys, inflating `total_listen_ms` for
fake countries that could be later used if validation is ever relaxed.

**Mitigation**  
1. Validate `country_id` against a regex: `/^[A-Z]{2,3}$/`.
2. Optionally, load the list of valid country IDs from `RankingsTable` at cold start
   (cached in Lambda memory) and reject unknown codes.

**Locally testable?** Yes.

---

### S-07 🟠 P2 — Unbounded Table Scan on `/leaderboard?stats=true` and `/weekly`

**Files:** `leaderboard/index.js:computeVoteStats`, `weekly/index.js`

**Description**  
Both endpoints perform a paginated full scan of `VotesTable` with no caching and no rate
limit on the endpoint itself. As votes accumulate:
- At 10,000 votes, each `stats=true` call scans ~10,000 items.
- At 1,000,000 votes, it scans 1,000,000 items per request.
- Any anonymous user can trigger this repeatedly.

The `/weekly` endpoint always does this scan (it is the primary endpoint purpose).

**Mitigation**

1. **Rate-limit these endpoints** at API Gateway level (lower throttle than other
   endpoints, e.g., 1 req/s).
2. **Cache stats** in a dedicated `StatsCache` DynamoDB item (or ElastiCache if scaling
   further) with a TTL of e.g. 5 minutes. This is the standard pattern:
   ```js
   // Check cache first
   const cached = await db.send(new GetCommand({ TableName: RANKINGS_TABLE, Key: { country_id: '__stats_cache__' } }));
   if (cached.Item && cached.Item.cache_ttl > now) return ok(JSON.parse(cached.Item.data));
   // ... compute and store ...
   ```
3. For `/weekly`, pre-compute the weekly summary on a schedule (EventBridge cron) and
   store the result. The endpoint just reads the cached result.

**Locally testable?** Yes — caching in DynamoDB is fully testable with LocalStack.
EventBridge scheduled rules are supported in LocalStack Pro.

---

### S-08 🟡 P3 — `vote_count` Never Incremented (Wildcard Logic Broken)

**Files:** `matchup/index.js:47`, `vote/index.js:152`

**Description**  
`matchup/index.js` reads `session.vote_count` to decide if this is a wildcard matchup
(every 10th vote). But `vote/index.js` only ever updates `vote_count_today` — the plain
`vote_count` field is set to `0` at session creation and never incremented. Wildcards
therefore never trigger.

This is not a direct security issue but it is a logic bug that could cause detectable
unfairness if wildcards are the mechanism to prevent ELO clusters.

**Mitigation**  
In `vote/index.js`, include `vote_count = if_not_exists(vote_count, :z) + :one` in the
session `UpdateExpression`, or rename the matchup check to use `vote_count_today`.

---

### S-09 🟡 P3 — IP-Only Rate Limiting is Bypassable at Scale

**File:** `session/index.js`

**Description**  
The 5-sessions/IP/day limit is hashed by source IP. This is effective against a single
machine but a botnet, a VPN, or a CGN (carrier-grade NAT, where many users share one IP)
all defeat it:
- Botnet: hundreds of IPs → hundreds of daily session budgets.
- Shared IP (university network, corporate NAT): legitimate users blocked while one bad
  actor consumes the quota.

**Mitigation**  
In production, add AWS WAF rate-based rules at the CloudFront/API Gateway layer that
rate-limit by IP at the HTTP layer before Lambda is invoked. For the application layer,
consider also:
- A CAPTCHA challenge after the first session per IP per day (Amazon WAF managed CAPTCHA
  is available; for open-source consider hCaptcha).
- Fingerprinting beyond IP (User-Agent hash, Accept-Language, etc.) for a composite
  session budget — higher entropy than IP alone.

**Locally testable?** WAF rules require LocalStack Pro for full emulation. Application-
level composite fingerprinting is fully testable locally.

---

### S-10 🟡 P3 — `CloudFront-Viewer-Country` Spoofable Outside CloudFront

**File:** `session/index.js:48`, `vote/index.js` (stored as `voter_country`)

**Description**  
When not behind CloudFront (local dev, direct API Gateway invocations, non-AWS
deployments) any client can set `CloudFront-Viewer-Country: US` in their request and
have that stored as their country in both sessions and vote records. This only affects
analytics, not access control, but it means country-level vote statistics can be
artificially inflated.

**Mitigation**  
1. In production, enforce that the API is only accessible through CloudFront (API Gateway
   resource policy that restricts to CloudFront-originating requests).
2. In Lambda, add a guard: only trust `CloudFront-Viewer-Country` when a corresponding
   `X-Forwarded-For` or `CloudFront-Is-Desktop-Viewer` header is present (these are all
   injected by CloudFront and cannot be set by clients when the resource policy is
   enforced).

**Locally testable?** Yes for the Lambda logic check. The resource policy requires a real
AWS account to test.

---

### S-11 🟡 P3 — CORS `Access-Control-Allow-Origin: *`

**Files:** `shared/response.js:4`, `template.yaml` (API Gateway CORS)

**Description**  
`CORS_ORIGIN` defaults to `*` in `template.yaml` globals and `response.js`. Since the
API uses no cookies and all users are anonymous, the risk is limited — CORS `*` cannot
expose session tokens to third-party origins via cookie theft. However, it does mean any
web page (including malicious ones) can call the API from a user's browser, silently
creating sessions and submitting votes without user interaction.

**Mitigation**  
1. Set `CORS_ORIGIN` to the specific production frontend origin (e.g.
   `https://anthemworld.example.com`) in the production SAM parameter/environment.
2. Keep `*` for local dev only. The `env.local.json` already sets `STAGE: "local"` — tie
   the CORS origin to the stage.

**Locally testable?** Yes — set `CORS_ORIGIN` in `env.local.json` to
`http://localhost:1313` and verify preflight `OPTIONS` returns the correct header.

---

## Prioritised Fix Roadmap

### Sprint 1 — Fix Now (P1)

| Action | File(s) | Effort |
|--------|---------|--------|
| Cap `listen_a_ms`/`listen_b_ms` in `/vote` at `duration_ms × 2` | `vote/index.js` | S |
| Cap `total_listen_ms` in `/listen` at `duration_ms × 2` | `listen/index.js` | S |
| Reject `heard_full_anthem: true` unless stored listen ≥ duration | `vote/index.js` | S |
| Add `duration_ms` to rankings seed script | `scripts/seed-rankings.sh` | S |
| Add `ThrottlingBurstLimit`/`ThrottlingRateLimit` to `template.yaml` | `template.yaml` | S |

### Sprint 2 — Fix Soon (P2)

| Action | File(s) | Effort |
|--------|---------|--------|
| Move `session_id` to `X-Session-Id` header in `/matchup` | `matchup/index.js`, `game.js` | S |
| Add `matchup_count_today` cap to prevent matchup farming | `matchup/index.js` | M |
| Add server-side TTL check after session load | `matchup/index.js`, `vote/index.js`, `listen/index.js` | S |
| Validate `country_id` with regex in `/listen` | `listen/index.js` | S |
| Cache `/leaderboard?stats=true` result with 5-min TTL | `leaderboard/index.js` | M |
| Cache `/weekly` result with 5-min TTL | `weekly/index.js` | M |

### Sprint 3 — Nice to Have (P3)

| Action | File(s) | Effort |
|--------|---------|--------|
| Fix `vote_count` increment (wildcard logic) | `vote/index.js`, `matchup/index.js` | S |
| Restrict `CORS_ORIGIN` per stage | `template.yaml`, `env.local.json.example` | S |
| Guard `CloudFront-Viewer-Country` trust | `session/index.js`, `vote/index.js` | S |

---

## LocalStack Testability Matrix

All mitigations listed above can be tested locally. The table below lists the LocalStack
services required:

| Mitigation | LocalStack service needed |
|-----------|--------------------------|
| API Gateway throttling (`MethodSettings`) | `apigateway` — included in LocalStack Community |
| DynamoDB cache item (stats TTL) | `dynamodb` — already used |
| EventBridge scheduled pre-compute (weekly) | `events` — LocalStack Community |
| WAF rate-based rules | `waf` — LocalStack Pro only; can be skipped locally and tested in staging |
| CloudFront resource policy | `cloudfront` — LocalStack Community (limited) |

For Sprint 1 & 2 items specifically: no new AWS services are required beyond what is
already running.
