# Voice AI Agent Optimizer

An Agent Optimizer for HighLevel Voice AI agents. It closes the loop from **past call
transcripts → detected issues → generated test cases → optimization recommendations**, and
integrates directly into the HighLevel UI as a Custom Page against a real sandbox account.

Built for the HighLevel FSB Q3'26 hiring assignment (`[Hiring] FSB Assignment Q326.pdf`).

## The three loops

1. **Analyze Past Performance** — ingests real Voice AI call transcripts via the Call Logs API,
   classifies each call against a fixed issue taxonomy (missed qualification, poor objection
   handling, off-brand tone, incomplete booking flow, weak follow-up, policy violations), and
   aggregates recurring patterns per agent.
2. **Generate Test Cases** — derives happy-path and edge-case test scenarios from the agent's
   real configured prompt plus its recurring-issue history, each with structured (machine-
   checkable) success criteria — not prose descriptions of "good."
3. **Recommend Optimizations** — turns issue aggregates and failed test results into prioritized,
   evidence-cited before/after recommendations, with a real "Apply" path for prompt/guardrail
   changes and clearly labeled advisory-only recommendations where HighLevel's public API has no
   configurable lever (model, temperature).

## Architecture

```
HighLevel Sandbox Account
  Voice AI Agent (real)  <-- PIT -->  Custom Page (this app, iframe)
                                              |
                                     Backend (Express + TypeScript)
                                       - ghlClient    (Agents / Actions / Call Logs API)
                                       - llm          (Anthropic or Gemini, switchable
                                                        via LLM_PROVIDER, provider-agnostic
                                                        structured output)
                                       - analyze/      issue detection
                                       - testgen/      test case generation
                                       - simulate/     LLM-vs-LLM test execution + judge
                                       - recommend/    before/after diffs + apply
                                       - db/           SQLite (node:sqlite, no native deps)
                                              |
                                     Frontend (Vue 3 + Vite, served as the Custom Page)
                                       Overview | Call Logs & Issues | Test Cases | Recommendations
```

Full API contract details (exact request/response schemas) were verified directly against
HighLevel's public Voice AI OpenAPI spec, not just the rendered docs.

## Repo structure

```
src/
  db/                SQLite schema + typed repositories, one file per entity
  services/
    ghlClient.ts      HighLevel Voice AI API wrapper (PIT auth)
    llm.ts             LLM wrapper -- Anthropic or Gemini (LLM_PROVIDER), same
                          provider-agnostic interface (text / multi-turn / structured output)
  modules/
    analyze/            transcript parsing + issue classification
    testgen/             test case generation
    simulate/             LLM-vs-LLM call simulation + judge scoring
    recommend/             recommendation synthesis + apply
  routes/                REST API consumed by the frontend
  ui/                    Vue 3 + Vite frontend (the Custom Page content)
scripts/
  seed.ts                pulls real calls + generates a synthetic backfill
```

## Setup & install

### Prerequisites

- Node.js **>= 24** (this project uses the built-in `node:sqlite` module instead of a
  native-compiled dependency, specifically to avoid the "npm install fails on the reviewer's
  machine" class of problem — no `node-gyp`/Xcode toolchain needed. Note: `node:sqlite` landed in
  22.5 but stayed behind an `--experimental-sqlite` flag until later — it's unflagged by 24, which
  is what this app actually requires)
- A HighLevel [Marketplace Developer account](https://marketplace.gohighlevel.com) with a
  **sandbox** sub-account (Developer Portal → Testing → "+ Create App Test Account")
- An LLM API key — either a [Gemini API key](https://aistudio.google.com/) (free tier, the
  default) or an [Anthropic API key](https://console.anthropic.com); see `LLM_PROVIDER` in
  `.env.example`

### 1. Create a Voice AI agent in the sandbox

In the sandbox account's HighLevel UI, create one Voice AI agent by hand with a realistic prompt
(e.g. a home-services appointment-booking agent). This is the agent the whole demo runs against —
the API can read and patch it, but agent *creation* is a one-time manual step here rather than
scripted, since it only needs to happen once and doing it in the real UI is the most direct way
to get a realistic starting prompt.

### 2. Populate a Knowledge Base

In the sandbox: **AI Agents → Knowledge Base → Create knowledge base**, and add the FAQ entries
from [`KNOWLEDGE_BASE.md`](./KNOWLEDGE_BASE.md) verbatim (7 entries: hours, pricing, escalation
policy, cancellation policy, services offered, support channels, data handling). **Don't attach
the KB to the agent's actions.** The point isn't "give the agent a knowledge base" — it's to
create a real, populated KB that the agent has no way to reach, so the Optimizer has something
concrete to find and recommend fixing. This is what makes the `knowledge_base` recommendation
category land on a specific, verifiable gap ("the answer exists, the agent just can't reach it")
instead of generic advice.

`scripts/seed.ts`'s `SCENARIO_OVERRIDES` hardcodes two synthetic transcripts against this specific
setup — one caller asking about hours/pricing, one invoking the escalation policy by name. If you
populate different FAQ topics, update those two scenario descriptions to match, or the seeded
"gap" transcripts won't correspond to anything actually in your KB.

### 3. Create a Private Integration Token

In the sandbox: **Settings → Private Integrations → Create**. Grant these scopes:

- `voice-ai-agents.readonly`, `voice-ai-agents.write`
- `voice-ai-dashboard.readonly`
- `voice-ai-agent-goals.readonly`, `voice-ai-agent-goals.write`

All real API calls in this app (Agents, Actions, Call Logs) use this PIT, not OAuth2 — this is a
single-tenant sandbox integration, so per-installer OAuth tokens add no value here. A minimal OAuth
*client* is still required to satisfy HighLevel's Marketplace install handshake itself (see step 7
and the Team-of-One notes below) — that's a platform requirement independent of how the app
authenticates to the API afterward.

### 4. Configure environment variables

```sh
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable | Where to get it |
|---|---|
| `GHL_PIT` | Step 3 above |
| `GHL_LOCATION_ID` | The sandbox sub-account's location id (Settings → Business Profile) |
| `LLM_PROVIDER` | `gemini` or `anthropic`. If unset, defaults to Gemini when `GEMINI_API_KEY` is set, else Anthropic |
| `GEMINI_API_KEY` | aistudio.google.com — used when `LLM_PROVIDER=gemini` |
| `ANTHROPIC_API_KEY` | console.anthropic.com — used when `LLM_PROVIDER=anthropic` |
| `GHL_OAUTH_CLIENT_ID` / `GHL_OAUTH_CLIENT_SECRET` | Developer Portal → your app → Advanced Settings → Auth → Secrets → "+ Add" (step 7) |
| `GHL_OAUTH_REDIRECT_URI` | `<your HTTPS URL>/oauth/callback` — must match exactly what you register in step 7 |

Both providers implement the same `generateText`/`generateTurn`/`generateStructured` interface in
`src/services/llm.ts`, so every module (`analyze`/`testgen`/`simulate`/`recommend`) is written
against one provider-agnostic API regardless of which is active. Gemini also gets automatic
retry-with-fallback-model handling for transient 503s, and both providers get quota-exhaustion
detection that fails fast instead of burning retries against a dead key.

### 5. Seed data

```sh
npm run seed
```

This syncs the agent(s) and real call logs from the sandbox, then generates a synthetic backfill
so the "recurring issues" view has enough volume and variety to be meaningful from a fresh
sandbox with no organic call history. Coverage is deliberate, not left to chance: the backfill
always produces exactly **one transcript per issue category** (6, fixed — qualification,
objection handling, tone, booking flow, follow-up, policy violation), each with one clear,
unambiguous flaw, plus a configurable number of clean happy-path calls on top
(`SEED_SYNTHETIC_COUNT`, default 4). This guarantees every category has real evidence for
testgen/recommend to work from, rather than hoping a "generate N mixed transcripts" prompt
happens to cover all six. Which agent to seed is controlled by `SEED_AGENT_ID` (defaults to the
first synced agent). See **What's functional vs. mocked** below for the full real/synthetic
disclosure.

For the **real-call** side of the hybrid test-execution model: place a handful of actual trial
calls against the agent (phone or the sandbox's web-call tester) covering a spread of scenarios
before running `npm run seed` — those come back as `source: "real"` call logs, not synthetic.

### 6. Run locally

```sh
npm run dev      # backend on :3000
npm run dev:ui   # Vite dev server on :5173, proxies /api to :3000
```

Open `http://localhost:5173`.

### 7. Install into the HighLevel sandbox as a Custom Page

1. Expose the running app over HTTPS — for local iteration, `ngrok http 3000` (Custom Pages
   require HTTPS and won't render in an iframe over plain HTTP). For a stable URL that doesn't
   depend on your laptop staying on, deploy instead: this repo includes a `render.yaml` blueprint
   — on [Render](https://dashboard.render.com), **New → Blueprint**, point it at this repo, and it
   auto-configures the build (`npm install && npm run build`) and start (`npm start`) commands.
   Fill in the prompted secrets (`GHL_PIT`, `GHL_LOCATION_ID`, `GEMINI_API_KEY` or
   `ANTHROPIC_API_KEY`, and the `GHL_OAUTH_*` vars from step 5 below — you'll need Render's
   assigned `*.onrender.com` URL to fill in `GHL_OAUTH_REDIRECT_URI`, so do step 5 after the first
   deploy). Use that URL everywhere below instead of the ngrok one.

   Render's free tier has no persistent disk, so the SQLite file can reset on redeploy or after a
   cold start from inactivity. Rather than a paid disk or a database migration, this app self-heals
   by replaying a static, pre-generated snapshot (`src/db/seed-data.sql`, committed to the repo) if
   it boots with no cached agents — see the Team-of-One note below for why that's a static file and
   not a live re-seed.
2. In the [Marketplace Developer Portal](https://marketplace.gohighlevel.com), create an app
   (**My apps → Create app**). Fill in **Basic Info** (name, logo, category, tagline) and set
   **Distribution type** to **Private** — private apps skip GHL's manual review queue and go
   **Live** immediately on submit, which is what you want for a sandbox-only integration.
3. **App Profiles**: add an app description and at least one preview image (16:9, e.g. 960×540) —
   both are required before the app version can publish, even for a private app.
4. **Modules → Custom Page**: point it at `<your HTTPS URL>`, placement = left navigation.
5. **Advanced Settings → Auth**: add a Redirect URL of `<your HTTPS URL>/oauth/callback`, select at
   least one scope, then go to **Secrets** and click **+ Add** to generate a Client ID/Secret. Set
   `GHL_OAUTH_CLIENT_ID` / `GHL_OAUTH_CLIENT_SECRET` / `GHL_OAUTH_REDIRECT_URI` to those three
   values (`.env` locally, or Render's dashboard env vars if deployed there), then restart/redeploy
   so `/oauth/callback` (in `src/index.ts`) picks them up. This step exists purely to satisfy the
   Marketplace install handshake — see the Team-of-One note below for why it's required even
   though every real API call in this app uses the PIT, not this OAuth token.
6. **Manage → Versions → Submit for review**: fill the minimal required fields (this triggers a
   confirmation checklist, not GHL's actual review team, since the app is Private) — the version
   moves straight to **Live**.
7. Go back to **Basic Info → Install link → Show**, copy the **Standard** link, and open it in a
   browser logged into the target sandbox account. Click **Install**, then **Proceed to Install**
   (a "you're installing a private app" warning is expected and fine — it's your own app).
8. Refresh the sandbox. A new left-nav item appears (named after whatever you titled the Custom
   Page module) — click it. The dashboard renders inside HighLevel's iframe, hitting the same
   `/api/*` routes as local dev.

### Production build

```sh
npm run build   # tsc for the server, vite build for the UI, assembled into dist/
npm start       # node dist/index.js, serves both the API and the built UI
```

## Team-of-One notes

This was built end-to-end by one person covering product, design, engineering, and QA. A few
judgment calls worth being explicit about, since that's what "ownership" actually looks like
rather than a claim:

- **PIT for all real API calls, OAuth client only to satisfy the install handshake**: every
  Agents/Actions/Call-Logs request in this app authenticates with a PIT — building full
  per-installer OAuth (token refresh, per-location tokens) would've added real engineering surface
  with no product value for a single sandbox integration. What wasn't obvious going in: HighLevel's
  Marketplace install flow (`chooselocation`) still requires an app to have a registered OAuth
  client (redirect URI, at least one scope, a generated Client ID/Secret) before it'll resolve the
  app's identity and let anyone install it — even a Custom-Page-only app that never uses that
  token. Confirmed this the hard way: the install link failed with `user_not_logged_in` and an
  empty `appId` in HighLevel's own network requests regardless of login state, across a fresh
  incognito session too, until Auth was actually configured — at which point the same request
  started resolving correctly. Added a minimal `/oauth/callback` route that exchanges the code and
  discards the resulting token; it exists solely to complete that handshake.
- **Distribution type Private, not Public**: HighLevel's own "how versioning works" panel states
  private apps skip the manual review queue and go Live immediately on submit, while public apps
  queue for actual GHL staff review (and require a demo video up front, before you have one to
  give). Private is the correct choice for a sandbox-only submission for exactly that reason, not
  just as a shortcut.
- **`node:sqlite` over `better-sqlite3`**: hit a real native-build failure partway through (Xcode
  CLT/node-gyp on this machine) and treated it as a signal, not just a local workaround — a
  reviewer hitting the same class of failure on `npm install` would never get past setup.
  Switched engines rather than debugging one machine's toolchain.
- **Forced tool-use over `output_config`/`messages.parse()`** for structured Anthropic output: the
  published `@anthropic-ai/sdk` version in use doesn't yet expose that surface. Forced tool-use (a zod schema →
  JSON Schema → single forced tool call → parsed back through the same zod schema) is the
  version-stable equivalent. Gemini gets the same zod-schema-in, typed-result-out contract via its
  native `responseJsonSchema` mode — every module authors its expected output as one plain zod
  schema regardless of which provider is active.
- **Added a Gemini path + quota-exhaustion detection mid-build, not from the start**: hit real
  Anthropic rate-limit/billing exhaustion while testing against the live sandbox. Rather than just
  retrying blindly, added `anthropicQuota.ts` (reads rate-limit response headers, fails fast on
  subsequent calls once exhausted instead of burning retries) and a Gemini provider behind the
  same interface, so the demo isn't blocked on one vendor's quota.
- **Synthetic backfill generates one transcript per issue category, deterministically, not "N
  mixed transcripts" left to the model's judgment**: an earlier version asked for a mixed batch
  and trusted the LLM to cover all six categories; nothing guaranteed it would, and an uneven
  batch starves testgen/recommend of evidence for whichever category got skipped. Generating each
  category's flawed transcript as its own explicit call removes that risk entirely.
- **Apply is scoped to prompt/guardrails only, not actions/knowledge_base**: the API contract for
  those is real and documented, but wiring a general "apply" path across seven different
  `actionParameters` shapes was cut to keep the demonstrated path (recommend → apply → verify via
  `getAgent`) actually solid rather than spreading thin across every category. Recommendations
  still get generated for those categories, just flagged advisory-only. This is the single biggest
  intentional scope cut — see "what's mocked" below.
- **Hybrid test execution (simulated + real-call), decided explicitly rather than defaulted**: an
  all-simulated system risks never touching HighLevel's actual voice pipeline; an all-real system
  can't produce enough regression coverage fast enough. The judge-scoring code path is shared
  between both modes specifically so the choice doesn't fork the codebase.
- **Analyze initially missed "missed opportunities," and it showed up as a real, observable gap,
  not a hypothetical one**: a seeded transcript where the agent correctly deferred a business-hours
  question (per its own prompt -- no knowledge-base action exists to answer it) produced zero
  issues on the first real run. Not a bug -- `policy_violation`'s original definition ("unsupported
  claim / incorrect info") genuinely didn't apply, since the agent broke no rule. But the assignment
  itself names three outcomes to detect -- "succeeded, **failed**, or **missed opportunities**" --
  and the analyze prompt only asked for failures. Fixed by broadening `policy_violation` and
  `objection_handling`'s taxonomy descriptions to explicitly cover "did what it was told, but the
  prompt itself is the gap," and by naming missed-opportunity detection directly in the analyze
  system prompt instead of leaving it implicit. Confirmed by re-running: the same transcript now
  correctly produces a `policy_violation` finding, and `recommend` now surfaces a `knowledge_base`
  recommendation grounded in it -- previously that category never fired at all, on any evidence.
- **`recommend` originally saw only issue counts per category, not the actual evidence**: e.g.
  `"policy_violation: 2 issues across 2 calls"` with no explanations or quotes. That's enough to
  produce *generic* advice but not a recommendation grounded in what a caller actually said. Fixed
  by feeding `recommend` a capped sample (3) of real explanations + verbatim quotes per category,
  not just the count -- this is what makes recommendations cite specific evidence instead of
  paraphrasing a category label.
- **`testgen` generated success criteria that didn't correspond to anything the test's own persona
  attempts, or to a capability the agent even has** -- a "happy path" test case failed on
  `must_follow_booking_flow` even though that persona never mentioned an appointment and this
  agent has no booking action at all. Not a judge or executor bug; they scored the (irrelevant)
  criterion correctly. Fixed by adding an explicit coherence rule to `testgen`'s system prompt:
  every criterion must be something that specific persona actually attempts, and a criterion type
  should only be used at all if the agent's configured prompt/actions plausibly support it.
  Re-running after the fix produced zero booking/transfer criteria for this agent -- correctly,
  since it has neither capability.
- **Gemini's free-tier RPM limit (15 req/min) was being treated the same as real quota/billing
  exhaustion**, hard-stopping the whole process on the first 429. A single simulated test case can
  burn ~15-17 LLM calls (multi-turn caller + agent + judge), so this reliably killed runs partway
  through. The fix distinguishes the two: Gemini's 429 response includes a structured
  `RetryInfo.retryDelay` telling you exactly how long the throttle lasts -- that's parsed out and
  treated as "wait and retry," reserving the hard-stop for a 429 with no such hint (real
  exhaustion). Confirmed by re-running the full 8-test-case batch clean afterward.
- **`recommend` consistently declined to surface an `actions`/escalation recommendation** for a
  real, well-evidenced issue (a caller invoking a stated policy to be transferred, ignored) across
  two independent runs -- checked directly that the evidence (issue + verbatim quote) was actually
  present and being passed in, so this isn't a data gap. It's the model weighing a single
  occurrence against `policy_violation`'s four and choosing not to raise a fourth recommendation
  from thin evidence, per the system prompt's own instruction ("return fewer recommendations
  rather than inventing ones"). Left as-is rather than forced -- that caution is the behavior the
  prompt asked for, not a bug to route around.
- **Boot-time self-heal, once a real deploy target came up -- and a live re-seed turned out to be
  the wrong version of that fix**: a laptop + ngrok URL isn't something a reviewer can rely on
  being reachable whenever they check it, so the app needed a host that stays up independent of
  any one machine. Render fits (long-running Node process, matches this app's architecture with
  zero code changes) but its free tier has no persistent disk, so the SQLite file can reset on
  redeploy or after an inactivity-based cold start. Considered migrating to a hosted Postgres
  (Supabase) for real cross-restart persistence, but `node:sqlite`'s synchronous API means every
  one of the ~25 functions across `src/db/*.ts` and ~50 call sites across `routes/`/`modules/`
  would need converting to async -- a real refactor with real regression risk, not a quick swap.
  First fix was a boot-time check that re-ran the live seed pipeline (real GHL sync + LLM-generated
  synthetic backfill) whenever the DB came up empty. That worked, but it's the wrong shape for a
  demo: every cold start became a ~30-60s wait behind live LLM calls, with results that could vary
  run to run and were exposed to whatever rate limit the LLM provider was under at that exact
  moment -- the opposite of what you want mid-recording or mid-review. Replaced it with a static,
  pre-generated snapshot (`src/db/seed-data.sql`, plain INSERT statements, committed to the repo
  and copied into `dist/` at build time) that boot-time loads via `db.exec()` if no agents are
  cached -- zero API calls, deterministic, and fast enough that the dashboard is fully populated
  before the first request finishes. `npm run seed` (live) still exists for actually refreshing
  the underlying data; `npm run seed:snapshot` re-dumps whatever's in the local DB into that file
  afterward. The demo's real-call beat (see `DEMO.md`) deliberately layers a fresh, real trial call
  on top of this frozen baseline instead of relying on it for everything, so the live analyze →
  recommend loop still gets demonstrated against genuinely new evidence, not just replayed data.
- **First Render deploy crashed on boot with `ERR_UNKNOWN_BUILTIN_MODULE: No such built-in module:
  node:sqlite`**, on Node 22.11.0 — surfaced by an actual failed deploy, not caught locally, since
  local dev runs Node 24. `node:sqlite` landed in 22.5 but stayed behind an `--experimental-sqlite`
  flag until a later release; the README/`package.json` `engines` field had been claiming `>=22.5`
  the whole time, which was simply wrong for unflagged use. Fixed by bumping the real minimum to
  Node 24 in `package.json`, `render.yaml`, and the README instead of adding the flag, since the
  point of `node:sqlite` here was avoiding exactly this kind of "works on my machine" version
  gotcha for whoever runs this next.
- **Dismissed recommendations were still showing in the UI, uncovered while checking the
  dashboard before recording a demo**: `recommend` had been re-run a few times during development,
  and superseded duplicates were marked `status = 'dismissed'` in the DB but the list query never
  filtered on status, so both the Recommendations tab and the Overview stat tile counted and
  displayed them alongside current ones. Fixed by excluding `dismissed` in
  `listRecommendationsForAgent`'s query (`src/db/recommendations.ts`) -- a one-line fix, but the
  kind of thing that only surfaces by actually looking at the running product, not just reading
  the code.

## What's functional vs. what's mocked

**Real, no stubs:**
- PIT auth against a live HighLevel sandbox; every Agents/Actions/Call-Logs API call is a real
  HTTP request against HighLevel's documented Voice AI API contract
- LLM-driven issue detection, test-case generation, simulated-conversation execution, judge
  scoring, and recommendation synthesis (Gemini or Anthropic, per `LLM_PROVIDER`) — every one of
  those is an actual model call with a real schema, not a canned response
- The "Apply" action for prompt/guardrails recommendations really calls `PATCH /voice-ai/agents/:id`
  against the sandbox and re-fetches to confirm

**Simulated/mocked, and disclosed as such in the product itself (not just here):**
- The synthetic-backfill call logs from `npm run seed` — LLM-generated, one deliberately-flawed
  transcript per issue category plus a handful of happy-path calls (see Team-of-One notes),
  tagged `source: "synthetic"` in the database and visibly badged in the dashboard, never silently
  merged with real data
- Most test-case executions are **LLM-vs-LLM simulated conversations**, not live phone calls —
  labeled `mode: "simulated"` vs `mode: "real_call"` on every test run, both scored through the
  same judge
- **`model` and `temperature` recommendations are advisory only.** Verified by inspecting
  HighLevel's complete Voice AI OpenAPI spec, not assumed: neither field exists anywhere in the
  Agent schema, so there is no API lever to apply them to. The Optimizer still generates these
  recommendations (the assignment asks for the category) but the UI disables Apply and says why.
- **`actions`/`knowledge_base` recommendations are generated but not yet wired to an apply path**
  (see Team-of-One notes) — real API contract exists, apply handler doesn't yet.
- Tone/pacing/interruption-handling signals are inferred from transcript **text only** — the Call
  Log API has no recording-URL field, so there's no audio to analyze even if the UI shows a
  playback control for humans.

## API reference (backend routes consumed by the frontend)

```
GET    /api/agents                              POST /api/agents/sync
GET    /api/agents/:id

GET    /api/agents/:id/call-logs                POST /api/agents/:id/call-logs/sync
POST   /api/agents/:id/call-logs/analyze         GET  /api/agents/:id/call-logs/issues

GET    /api/agents/:id/test-cases                POST /api/agents/:id/test-cases/generate
POST   /api/test-cases/:id/run                   POST /api/test-cases/:id/record-real-call

GET    /api/agents/:id/recommendations           POST /api/agents/:id/recommendations/generate
POST   /api/recommendations/:id/apply
```
