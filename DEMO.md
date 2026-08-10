# Demo script (2-5 min, Loom)

Matches the assignment's four required beats: Workflow, Dashboard, Insight, Before vs. After.
Written against the baked-in demo snapshot (`src/db/seed-data.sql`) — the specific numbers/quotes
below match that dataset. The one live beat (the real call, see prep below) adds fresh data on top
of it rather than replacing it.

Record with the Custom Page open **inside HighLevel** (not localhost) — narrate that it's running
inside the real HighLevel UI as you open it.

---

## Before you record: place one real trial call

The synthetic backfill proves the analyze/testgen/recommend loops work, but the strongest beat in
this demo is proving they work against something that just happened, live, not just replayed data.

Call the sandbox agent (phone or the sandbox's web-call tester) and ask about **business hours or
pricing** — something like *"Hi, what are your business hours?"* or *"How much do your plans
cost?"*. This targets a real, known gap: the account's knowledge base has both answers, but this
agent has no knowledge-base action wired up, so it'll defer instead of answering — the same gap
the `knowledge_base` recommendation below is already built on, now with one more piece of live
evidence backing it.

Do this a few minutes before recording so the call log is ready in HighLevel by the time you open
the dashboard.

---

## 0:00–0:20 — Intro (one breath)

"This is an Agent Optimizer for HighLevel Voice AI agents — it closes the loop from past call
transcripts, to detected issues, to generated test cases, to optimization recommendations,
running inside HighLevel as a Custom Page against a real sandbox account."

## 0:20–1:15 — Workflow (the live beat: ingest and analyze a real call)

Open the **Call Logs & Issues** tab.

- Point at the table: badge column shows `real` vs `synthetic` per call — say explicitly that most
  of this history is a disclosed synthetic backfill, not hidden as real.
- Click **Sync real calls from HighLevel** live — the call you just placed appears as a new row
  tagged `real`.
- Click **Analyze unprocessed calls** live — this only processes the new real call (everything
  else was already analyzed). Expand it and read the detected issue explanation out loud: the
  agent followed its prompt correctly by deferring, but this highlights a gap in the agent's
  configuration — no knowledge-base access to answer a routine question it could have answered
  correctly. This is the beat that shows the analyzer catches missed opportunities on genuinely
  fresh evidence, not just canned synthetic examples.

## 1:15–1:45 — Dashboard (unified view)

Switch to **Overview** — stat tiles (calls ingested, issues found, test case pass rate,
recommendation count) and the category breakdown bars. Point out the real call now counted
alongside the synthetic ones.

Switch to **Test Cases** — point at one passed and one failed case, showing the structured
success criteria (not prose) and the per-criterion pass/fail. Mention: most runs are simulated
LLM-vs-LLM calls, labeled as such, sharing the same judge as any real-call test run would.

## 1:45–2:30 — Insight (AI-generated recommendations)

Switch to **Recommendations** and regenerate them live (this now has one more real data point to
draw on than before).

- Open the **knowledge_base** recommendation. Read the reasoning — it cites the actual
  pricing/hours deferral pattern, now including the real call you just placed. Point out the
  **disabled Apply button** with its label explaining why: HighLevel's public API has no lever to
  attach a KB, so this stays advisory, honestly.
- Briefly: this is AI-generated from real evidence (explanation + verbatim quotes per issue), not
  a canned suggestion.

## 2:30–3:15 — Before vs. After (the closing loop)

Open the **prompt** recommendation.

- Show the before/after diff panel side by side.
- Read 1-2 sentences of the reasoning (ties back to the tone/qualification/follow-up issues shown
  earlier).
- Click **Apply to agent** live.
- Switch to HighLevel's own Voice AI agent Build screen (or re-open the agent via the API/dashboard)
  and show the prompt actually changed — this is the "verify it really applied" beat, the same
  thing already confirmed once via the API directly.

## 3:15–3:30 — Close

"Everything shown here — the ingestion, the analysis, the test generation, and the apply action —
is real against the live sandbox, including the call I placed a few minutes before recording.
What's disclosed as mocked (the synthetic backfill history, simulated test calls, and the two
advisory-only categories the platform doesn't expose) is documented in the README."

---

## If something goes sideways while recording

- **The real call never shows up in "Sync real calls"**: HighLevel's Call Logs API can lag a
  couple minutes behind the actual call. Place the call earlier, or narrate through it and cut in
  the synced result afterward.
- **Gemini rate limit mid-recording**: don't panic-retry on camera — cut, wait ~60s, resume. The
  retry logic handles this automatically outside of a live take; a live 429 will just show a
  console wait message if you're watching server logs.
- **Custom Page not installed yet**: fall back to `localhost:5173` and say so explicitly rather
  than implying it's already live in HighLevel.
