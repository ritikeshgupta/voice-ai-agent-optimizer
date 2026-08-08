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

- Node.js **>= 22.5** (this project uses the built-in `node:sqlite` module instead of a
  native-compiled dependency, specifically to avoid the "npm install fails on the reviewer's
  machine" class of problem — no `node-gyp`/Xcode toolchain needed)
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

In the sandbox: **AI Agents → Knowledge Base → Create knowledge base**, and add a handful of
short FAQ entries for the agent's business (hours, services, pricing, escalation/transfer policy,
cancellation policy — 2-4 sentences each). **Don't attach it to the agent's actions.** The point
isn't "give the agent a knowledge base" — it's to create a real, populated KB that the agent has
no way to reach, so the Optimizer has something concrete to find and recommend fixing. This is
what makes the `knowledge_base` recommendation category land on a specific, verifiable gap
("the answer exists, the agent just can't reach it") instead of generic advice.

`scripts/seed.ts`'s `SCENARIO_OVERRIDES` hardcodes two synthetic transcripts against this specific
setup — one caller asking about hours/pricing, one invoking the escalation policy by name. If you
populate different FAQ topics, update those two scenario descriptions to match, or the seeded
"gap" transcripts won't correspond to anything actually in your KB.

### 3. Create a Private Integration Token

In the sandbox: **Settings → Private Integrations → Create**. Grant these scopes:

- `voice-ai-agents.readonly`, `voice-ai-agents.write`
- `voice-ai-dashboard.readonly`
- `voice-ai-agent-goals.readonly`, `voice-ai-agent-goals.write`

A PIT is used instead of full OAuth2 — this is a single-tenant sandbox integration, so the
OAuth app-review/install flow adds no value here (see Team-of-One notes below).

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
   require HTTPS and won't render in an iframe over plain HTTP). For the actual demo/submission,
   deploy `npm run build && npm start` to a host with a stable URL (e.g. Render — the official
   `ghl-marketplace-app-template` this project started from documents that path).
2. In the Marketplace Developer Portal, create a (private/unlisted) app.
3. Add a **Custom Page**: point it at your deployed URL, placement = left navigation, available
   to the sandbox's distribution type.
4. Install the app into the sandbox sub-account.
5. Open the new nav item inside HighLevel — the dashboard renders in the iframe, hitting the same
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

- **PIT over OAuth2**: full marketplace-app OAuth (client id/secret, install flow, token refresh)
  adds real engineering surface with no product value for a single sandbox integration. Chose the
  simpler, equally-legitimate auth path and spent the saved time on the actual three loops instead.
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
