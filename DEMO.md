# Demo script (2-5 min, Loom)

Matches the assignment's four required beats: Workflow, Dashboard, Insight, Before vs. After.
Written against the actual current data in the sandbox — re-check the specific numbers/quotes if
you re-seed before recording, but the flow stays the same.

Record with the Custom Page open **inside HighLevel** (not localhost) if the Custom Page install
is done — narrate that it's running inside the real HighLevel UI as you open it.

---

## 0:00–0:20 — Intro (one breath)

"This is an Agent Optimizer for HighLevel Voice AI agents — it closes the loop from past call
transcripts, to detected issues, to generated test cases, to optimization recommendations,
running inside HighLevel as a Custom Page against a real sandbox account."

## 0:20–1:00 — Workflow (ingestion + analysis)

Open the **Call Logs & Issues** tab.

- Point at the table: badge column shows `real` vs `synthetic` per call — say explicitly that a
  fresh sandbox has no organic call history, so this seed mix is disclosed, not hidden.
- Click **Analyze unprocessed calls** live (or just point at existing results if already run).
- Expand one row — the business-hours call. Read the detected issue explanation out loud: *"the
  agent followed its prompt correctly by deferring, but this highlights a gap in the agent's
  configuration: lacking knowledge-base access to answer a routine question."* This is the beat
  that shows the analyzer catches missed opportunities, not just rule-breaks.

## 1:00–1:45 — Dashboard (unified view)

Switch to **Overview** — stat tiles (calls ingested, issues found, test case pass rate,
recommendation count) and the category breakdown bars.

Switch to **Test Cases** — point at one passed and one failed case, showing the structured
success criteria (not prose) and the per-criterion pass/fail. Mention: most runs are simulated
LLM-vs-LLM calls, labeled as such, sharing the same judge as any real-call test run would.

## 1:45–2:30 — Insight (AI-generated recommendations)

Switch to **Recommendations**.

- Open the **knowledge_base** recommendation. Read the reasoning — it cites the actual
  pricing/hours deferral pattern. Point out the **disabled Apply button** with its label
  explaining why: HighLevel's public API has no lever to attach a KB, so this stays advisory,
  honestly.
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
is real against the live sandbox. What's disclosed as mocked (synthetic backfill data, simulated
test calls, and the two advisory-only categories the platform doesn't expose) is documented in
the README."

---

## If something goes sideways while recording

- **Gemini rate limit mid-recording**: don't panic-retry on camera — cut, wait ~60s, resume. The
  retry logic handles this automatically outside of a live take; a live 429 will just show a
  console wait message if you're watching server logs.
- **Custom Page not installed yet**: fall back to `localhost:5173` and say so explicitly rather
  than implying it's already live in HighLevel.
