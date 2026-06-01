# Proposal — Client-side product-objective tracking

**Date:** 2026-06-01 UTC
**Status:** Proposal (no client code shipped yet — backend-only this engagement)
**Audience:** Anthem World maintainer

The backend now emits OpenTelemetry traces/metrics/logs and we have Grafana
dashboards for the SRE golden signals **and** server-side product metrics
(votes, sessions, matchups, listens — see the *Product Engagement* dashboard).
That tells us *what the server did*. It does **not** tell us:

- What users do **before** they hit the API (did they land, scroll, bounce?)
- Why they **don't** convert (served a matchup but never voted — was the audio
  slow? did the UI confuse them? did playback fail?)
- **Client experience quality** (load time, input latency, audio stalls, JS
  errors) that server metrics can't see.

This proposal covers how to track product objectives from the client and tie
them back to the existing backend dashboards. It is deliberately phased and
cheap, matching the local-first, low-cost posture of the backend work.

---

## 1. Product objectives → the metrics that prove them

Frame tracking around objectives, not events. For an anthem-ranking game:

| # | Product objective                          | North-star / proxy metric                                  |
|---|--------------------------------------------|------------------------------------------------------------|
| O1| Visitors start playing                     | **Activation rate** = sessions that cast ≥1 vote / visitors |
| O2| Players actually *listen* (the point)      | **Listen-through rate** = anthems heard ≥N s / anthems served |
| O3| Players keep voting (depth of engagement)  | **Votes per active session**, time-to-first-vote           |
| O4| Players come back                          | **D1 / D7 return rate**                                     |
| O5| Players spread the game                    | **Share rate** = share clicks / active sessions            |
| O6| The experience feels fast & reliable       | **Core Web Vitals** (LCP/INP/CLS), audio-stall rate, JS error rate |

These map onto a funnel that mirrors the existing front-end modules
(`session-manager.js`, `game.js`, `listen-progress.js`, `leaderboard.js`):

```
land → game_start(session) → matchup_view → anthem_play → listen_progress
     → vote_cast → [repeat] → leaderboard_view → share → return_visit
```

The backend already counts the right-hand side (session/matchup/vote/listen).
The client adds the **top of funnel** and the **drop-off reasons**.

---

## 2. Event taxonomy (client)

A small, stable set of events. Names are snake_case; properties are bounded
(same cardinality discipline as the backend — no raw IDs as
dimensions/labels).

| Event                | When                                   | Key properties (bounded)                    |
|----------------------|----------------------------------------|---------------------------------------------|
| `page_view`          | route load                             | `page` (home/game/leaderboard/country)      |
| `game_start`         | first matchup of a session rendered    | `had_session` (resumed vs new)              |
| `matchup_view`       | matchup pair shown                      | `is_wildcard`                               |
| `anthem_play`        | user presses play                       | `slot` (a/b), `country_id`                  |
| `listen_progress`    | crosses 25/50/75/100 % of an anthem     | `country_id`, `milestone`                   |
| `anthem_stall`       | audio buffering/stall > 500 ms          | `country_id`                                |
| `vote_cast`          | vote submitted (client side)            | `result_country`, `vote_category?`          |
| `vote_blocked`       | client-side guard stopped a vote        | `reason` (too_fast/not_listened/rate_limit) |
| `leaderboard_view`   | leaderboard opened                      | `scope` (all/weekly)                        |
| `share_click`        | QR/share used                           | `method` (qr/link)                          |
| `return_visit`       | session resumed from localStorage       | `age_bucket` (h/d)                          |
| `client_error`       | window error / unhandled rejection      | `where` (module), `kind`                    |
| `web_vitals`         | on metric finalize                      | `name` (LCP/INP/CLS/TTFB), `rating`         |

`country_id` is bounded (≤193) and already used as a backend label, so client
and server slice the same way.

---

## 3. Instrumentation options (and the recommendation)

There are three viable transports. They are **not** mutually exclusive; the
recommendation layers them.

### Option A — GA4 custom events (already integrated)
The site already loads `gtag.js` conditionally
(`layouts/partials/google-analytics.html`). Emitting the taxonomy above as GA4
events is near-zero effort and free.

- **Pros:** already wired, free, marketing/funnel/retention reports built-in,
  geography out of the box.
- **Cons:** data lives in Google, not Grafana; sampling/thresholding on big
  numbers; consent/PII obligations; not correlatable with backend traces.

### Option B — Web-Vitals RUM beacon → collector → Prometheus/Loki
Add the tiny [`web-vitals`](https://github.com/GoogleChrome/web-vitals) library
(~2 KB) and POST a compact beacon (`navigator.sendBeacon`) of vitals + key
funnel events to a **dedicated lightweight ingest** that forwards to the **same
OTel collector** (OTLP/HTTP) we built. Then client RUM sits **next to** backend
golden signals in Grafana.

- **Pros:** unifies client + server in one Grafana; owns the data; cheap.
- **Cons:** must expose an ingest endpoint publicly (CORS, auth token, WAF rate
  limiting, PII scrubbing); a bit of plumbing.

### Option C — OpenTelemetry browser SDK (distributed tracing client→API)
Use `@opentelemetry/sdk-trace-web` + fetch instrumentation to create **browser
spans** and propagate `traceparent` into the API calls, so a `/vote` is one
trace spanning **browser → API Gateway → Lambda → DynamoDB** in Tempo.

- **Pros:** end-to-end traces; "why was this vote slow" answered in one view;
  reuses the exact stack we stood up.
- **Cons:** heaviest; needs **head sampling** (e.g. 5–10 %) to control volume
  and cost; CORS for `traceparent`; careful PII handling. Backend must accept
  and continue the trace context (our Lambdas already run the OTel SDK, so they
  will — once an OTLP endpoint is configured in prod).

### Recommendation — layered, phased

1. **Now / cheapest:** **Option A** for O1–O5 product funnel & retention. It's
   already wired; just emit the taxonomy. This answers most product questions
   immediately with zero infra.
2. **Next:** **Option B** for O6 (experience quality) so Core Web Vitals,
   audio-stall rate, and client error rate live beside the backend golden
   signals in Grafana — the single pane the maintainer already checks.
3. **Later / optional:** **Option C** at low sampling to get a handful of
   real browser→Lambda→DynamoDB traces for deep debugging, once the backend
   OTLP endpoint is wired in prod (the ADOT step described in
   `observability/README.md`).

A thin `window.AnthemTrack.event(name, props)` wrapper should fan out to
whichever transports are enabled, so modules call one API and we can turn
GA4/RUM/OTel on independently. Hook points already exist:
`session-manager.js` (game_start / return_visit), `game.js` (matchup_view /
vote_cast / vote_blocked), `listen-progress.js` (anthem_play / listen_progress
/ anthem_stall), `leaderboard.js` (leaderboard_view).

---

## 4. Tying client tracking to the backend dashboards

- **Funnel completion:** overlay client `matchup_view` (Option A/B) against
  backend `anthem_matchups_served` and `anthem_votes` to see drop-off the
  server can't: served-vs-viewed and viewed-vs-voted.
- **Experience → conversion:** correlate `web_vitals{rating="poor"}` and
  `anthem_stall` rate against vote conversion to test "slow audio kills votes."
- **Distributed traces (Option C):** a browser-rooted trace flows into the same
  Tempo we validated; the `/vote` server span already exists, so the client
  span just becomes its parent. Logs already carry `trace_id` for the jump.
- **New Grafana dashboard "Client Experience (RUM)":** LCP/INP/CLS percentiles,
  audio-stall rate by `country_id`, JS error rate, and a funnel panel —
  authored as code under `observability/grafana/dashboards/` like the others.

---

## 5. Privacy, consent, cost

- **Consent:** GA4 is already gated on a configured ID; gate **all** client
  tracking behind a consent signal (and respect Do-Not-Track / Global Privacy
  Control). Default to vitals-only (no behavioral) until consent.
- **No PII as dimensions:** never send IP, raw `session_id`, or free text as
  labels/properties. The backend already hashes IP and keeps unbounded IDs off
  metric labels; mirror that on the client.
- **Endpoint hardening (Options B/C):** the public OTLP/beacon ingest needs a
  write-only token, strict CORS to the site origin, WAF/rate limits (the repo
  already has a WAF stack), and a collector `filter`/`attributes` processor to
  drop anything sensitive before storage.
- **Cost:** Option A is free; Option B is a tiny beacon + the collector we
  already run; Option C is bounded by the sample rate. All consistent with the
  cheap, local-first posture.

---

## 6. Suggested rollout

| Phase | Deliverable                                                              | Effort |
|-------|--------------------------------------------------------------------------|--------|
| C1    | `AnthemTrack` wrapper + GA4 events for the funnel (O1–O5)                 | S      |
| C2    | `web-vitals` + beacon → collector; "Client Experience" Grafana dashboard | M      |
| C3    | OTel browser tracing at 5–10 % sampling; browser→Lambda traces in Tempo  | M/L    |
| C4    | Consent gating + PII scrubbing hardening; document in `observability/`    | S      |

Phase C1 alone answers the original question — *"are users engaging the way I
want?"* — from the client side, and needs no new infrastructure.
