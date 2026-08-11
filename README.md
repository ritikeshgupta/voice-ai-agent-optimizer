# Voice AI Agent Optimizer

An Agent Optimizer for HighLevel Voice AI agents. It closes the loop from **past call
transcripts → detected issues → generated test cases → optimization recommendations**, and
integrates directly into the HighLevel UI as a Custom Page against a real sandbox account.

Built for the HighLevel FSB Q3'26 hiring assignment (`[Hiring] FSB Assignment Q326.pdf`).

**Demo:** [Loom walkthrough](https://www.loom.com/share/4042d76349764cee8df57cc5b496c800)

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

Deliberately give the agent partial capability, not zero: bake one obvious fact (e.g. business
hours) directly into the prompt text so it answers that correctly, while leaving other things
(pricing, escalation) unaddressed. A gap that's targeted and specific ("this agent can't quote a
price, though it clearly knows its own hours") is a more useful, more credible demo than "this
agent can't answer anything" — and it's what makes the eventual `knowledge_base`/`guardrails`
recommendations read as precise fixes instead of generic advice for a broken agent.

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
setup — one caller asking about pricing (a real KB-only gap), one invoking the escalation policy
by name — plus a separate guaranteed happy-path transcript where a caller asks about business
hours and the agent answers correctly from its own prompt. If you populate different FAQ topics or
change what's baked into the prompt, update those scenario descriptions to match, or the seeded
transcripts won't correspond to anything actually in your setup.

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

- **PIT for all real API calls; an OAuth client exists only to satisfy the install handshake.**
  Full per-installer OAuth would add engineering surface with no product value for a single
  sandbox integration. What wasn't obvious: HighLevel's Marketplace install flow still requires a
  registered OAuth client (redirect URI, scope, Client ID/Secret) to resolve the app's identity
  before anyone can install it — confirmed by watching the install link fail with
  `user_not_logged_in` and an empty `appId` until Auth was actually configured. Added a minimal
  `/oauth/callback` that exchanges and discards the code solely to complete that handshake.
- **Distribution type Private, not Public.** HighLevel's own versioning docs confirm private apps
  skip the manual review queue and go Live immediately, while public apps queue for real review
  (and need a demo video before one exists) — the correct choice for a sandbox submission, not a
  shortcut.
- **`node:sqlite` over `better-sqlite3`**, after hitting a real native-build failure (Xcode
  CLT/node-gyp) locally — treated as a signal that a reviewer's `npm install` could hit the same
  wall, not a one-machine problem to route around.
- **Forced tool-use instead of `output_config`/`messages.parse()`** for structured Anthropic
  output, since the installed `@anthropic-ai/sdk` version doesn't expose that surface. Gemini gets
  the same zod-in/typed-out contract via `responseJsonSchema`, so every module authors one schema
  regardless of provider.
- **Added a Gemini provider + quota-exhaustion detection mid-build**, after hitting real Anthropic
  rate-limit/billing exhaustion against the live sandbox, so the demo isn't hostage to one
  vendor's quota.
- **Synthetic backfill generates one transcript per issue category as its own explicit call**, not
  "N mixed transcripts" left to the model — an earlier mixed-batch version had no guarantee of
  covering all six categories, which would starve testgen/recommend of evidence for whichever got
  skipped.
- **Apply only has a real handler for `prompt`/`guardrails`, not `actions`/`knowledge_base`.** The
  API contract for those exists, but wiring a general apply path across seven different
  `actionParameters` shapes was cut to keep the one demonstrated path (recommend → apply → verify)
  solid rather than spread thin. Those categories still generate, just flagged advisory-only — the
  single biggest intentional scope cut.
- **Test execution is hybrid (simulated + real-call) by explicit choice, not default.**
  All-simulated never touches HighLevel's actual voice pipeline; all-real can't produce enough
  coverage fast enough. Both modes share one judge-scoring path so the choice doesn't fork the
  codebase.
- **Analyze initially scored zero issues on a transcript where the agent correctly deferred a
  business-hours question it had no KB access to answer.** Not a bug — `policy_violation`'s
  original definition ("unsupported claim") genuinely didn't apply. But the assignment names three
  outcomes to detect, including missed opportunities, and analyze only looked for failures. Fixed
  by broadening the taxonomy and naming missed-opportunity detection directly in the system prompt;
  the same transcript now correctly produces a finding, and `recommend` surfaces a `knowledge_base`
  recommendation from it that never fired before.
- **`recommend` originally saw only issue counts per category** ("policy_violation: 2 issues"),
  enough for generic advice but not evidence-grounded recommendations. Fixed by feeding it a capped
  sample of real explanations + verbatim quotes per category, so recommendations cite what a
  caller actually said instead of paraphrasing a label.
- **`testgen` generated criteria that didn't match anything the test's own persona attempts** — a
  happy-path case failed `must_follow_booking_flow` even though neither the persona nor the
  agent's actions involved booking. Fixed with a coherence rule: a criterion must be something the
  persona actually attempts, and a type should only be used if the agent's actions plausibly
  support it.
- **Gemini's free-tier RPM limit was being treated the same as real quota exhaustion**,
  hard-stopping mid-batch on the first 429 (one simulated test case alone burns ~15-17 LLM calls).
  Fixed by parsing Gemini's `RetryInfo.retryDelay` to distinguish "wait and retry" from genuine
  exhaustion, which has no such hint.
- **`recommend` was treating issue-occurrence count as a gate on whether a category got
  recommended at all**, not just a priority signal — a single well-evidenced issue never beat a
  category with five occurrences, so `actions`/`guardrails` almost never fired despite real
  evidence. Fixed by separating "has any evidence" (the actual gate) from "how much" (priority
  only), and naming explicitly that an unhonored escalation policy is both a missing rule
  (`guardrails`) and a missing capability (`actions`).
- **`model` recommendations were generic** ("upgrade to a higher tier") since the LLM has no
  built-in knowledge of HighLevel's actual model dropdown. Fixed by web-researching the real
  options (GPT-4.1/5, Gemini Flash tiers, Claude Sonnet 4.5/4.0/Haiku 3.5) and published
  tone/empathy comparisons, then feeding that as solution-space context. This agent's issues match
  a tone/empathy failure specifically, so it now names Claude Sonnet 4.5 with its real cost
  trade-off against a cheaper Gemini Flash tier, instead of a vague tier bump.
- **Needed a host that stays up independent of any one laptop.** Render fits with zero code
  changes, but its free tier has no persistent disk, so the SQLite file resets on redeploy/cold
  start. Considered a Postgres migration for real persistence, but `node:sqlite`'s synchronous API
  would mean converting ~25 functions and ~50 call sites to async — too much regression risk for
  the actual problem. First fix re-ran the live seed pipeline on boot when empty, but that meant a
  30-60s wait behind live LLM calls with variable results on every cold start — wrong shape for a
  demo. Replaced it with a static, pre-generated snapshot (`seed-data.sql`) that loads instantly
  with zero API calls; the demo's real-call beat layers fresh evidence on top of that frozen
  baseline instead of relying on it for everything.
- **First Render deploy crashed on boot** (`ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`) on Node
  22.11 — `node:sqlite` landed in 22.5 behind an `--experimental-sqlite` flag and only became
  unflagged later, so the README's `>=22.5` claim was simply wrong; local dev on Node 24 had masked
  it. Fixed by bumping the real minimum to Node 24 everywhere instead of adding the flag.
- **Dismissed recommendations were still showing in the UI and the Overview count** —
  `recommend`'s re-runs during development left superseded duplicates marked dismissed, but the
  list query never filtered on status. One-line fix, found only by looking at the running
  dashboard, not by reading the code.
- **`npm run build`'s UI copy step (`cp -r src/ui/dist dist/ui/dist`) only overwrites correctly on
  the first build** — once the destination exists, `cp -r` nests the source into it instead of
  replacing it, so local rebuilds after the first silently served stale UI. Never affected Render
  (fresh clone every build), but caused a few rounds of confusing local verification. Fixed by
  clearing the destination first.
- **Test Cases badges reused the "warning" status color for test *type* (edge case), not
  outcome** — a passing edge case showed an orange badge next to a green "PASSED," a mixed signal.
  Separated identity (neutral badges: type, source category) from status (colored border, pass/
  fail, a new "`X/Y passing`" summary), and added a run-history dot strip from data that was
  already fetched but never rendered beyond the latest run — which immediately revealed two test
  cases that have never once passed.
- **The demo agent originally had zero capability beyond contact collection**, so it deferred on
  *every* question uniformly — a real but unconvincing demo, since "this agent can't answer
  anything" reads as broken rather than as a specific, fixable gap. Patched the real agent's
  prompt to answer business hours directly (baked into the prompt) while leaving pricing and
  escalation as genuine KB-only gaps, and split the synthetic backfill accordingly: a guaranteed
  happy-path transcript proving the agent isn't uniformly incapable, plus a pricing-specific
  (not hours) `policy_violation` scenario. Makes the eventual `knowledge_base`/`guardrails`
  recommendations read as targeted fixes for one missing capability, not generic advice for a
  broken agent.

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
- **The Optimizer never actually reads the real Knowledge Base's contents.** There's no API call
  anywhere in this codebase to HighLevel's KB endpoints — `knowledge_base` recommendations are
  inferred purely from the *pattern* in transcripts (the agent repeatedly deferring on things that
  sound like routine business questions), not from confirming what's actually in the account's KB.
  The reasoning happens to be correct in this demo because the KB really does contain those
  answers (see `KNOWLEDGE_BASE.md`), but that's the demo setup being honest, not the system
  verifying it live.
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
POST   /api/recommendations/:id/apply            POST /api/recommendations/:id/dismiss
```
