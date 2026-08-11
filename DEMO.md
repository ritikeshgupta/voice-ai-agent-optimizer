# Demo script (2-5 min, Loom)

Matches the assignment's four required beats: Workflow, Dashboard, Insight, Before vs. After.
Written against the baked-in demo snapshot (`src/db/seed-data.sql`) — the specific numbers/quotes
below match that dataset. The live call is placed **on camera**, mid-recording, not beforehand —
seeing the before/after delta is more convincing than narrating "I did this earlier."

Record with the Custom Page open **inside HighLevel** (not localhost) — narrate that it's running
inside the real HighLevel UI as you open it. You'll switch between the Optimizer's Custom Page and
the agent's own "Test Audio" panel (**AI Agents → Voice AI → My Agent 150 → Start Web Call**) mid-recording, so have both tabs/panels ready before you hit record.

---

## 0:00–0:15 — Intro (one breath)

"This is an Agent Optimizer for HighLevel Voice AI agents — it closes the loop from past call
transcripts, to detected issues, to generated test cases, to optimization recommendations,
running inside HighLevel as a Custom Page against a real sandbox account."

## 0:15–0:45 — Baseline, before the live call

Open the **Call Logs & Issues** tab.

- Point at the table: badge column shows `real` vs `synthetic` per call — say explicitly that most
  of this history is a disclosed synthetic backfill, not hidden as real. Note the current count
  (calls ingested / issues found).
- "This is the state before I place a live call against the agent, right now."

## 0:45–1:30 — Workflow: place a real call, on camera

Switch to the agent's **Test Audio** panel and click **Start Web Call**. Ask the agent something
like *"Hi, what are your business hours?"* or *"How much do your plans cost?"*. This targets a
real, known gap: the account's knowledge base has both answers, but this agent has no
knowledge-base action wired up, so it'll defer instead of answering — watch it happen live. End
the call once the agent asks for a callback instead of answering.

## 1:30–2:15 — Workflow: sync and analyze that call

Switch back to the Optimizer's **Call Logs & Issues** tab.

- Click **Sync real calls from HighLevel** live — the call you just placed appears as a new row
  tagged `real`.
- Click **Analyze unprocessed calls** live — this only processes the new real call (everything
  else was already analyzed). Point at the updated count (one more call, one more issue) against
  the baseline from a minute ago. Expand the new issue and read the explanation out loud: the agent
  followed its prompt correctly by deferring, but this highlights a gap in the agent's
  configuration — no knowledge-base access to answer a routine question it could have answered
  correctly. This is the beat that shows the analyzer catches missed opportunities on genuinely
  fresh evidence, not just canned synthetic examples.

## 2:15–2:40 — Dashboard (unified view)

Switch to **Overview** — stat tiles (calls ingested, issues found, test case pass rate,
recommendation count) and the category breakdown bars. Point out the real call now counted
alongside the synthetic ones.

Switch to **Test Cases** — point at one passed and one failed case, showing the structured
success criteria (not prose) and the per-criterion pass/fail. Mention: most runs are simulated
LLM-vs-LLM calls, labeled as such, sharing the same judge as any real-call test run would.

## 2:40–3:20 — Insight (AI-generated recommendations, all six categories)

Switch to **Recommendations** and regenerate them live (this now has one more real data point to
draw on than before). Point out that this spans all six categories the assignment asks for —
prompt, actions, knowledge base, guardrails, model, temperature — each grounded in a distinct
piece of real evidence, not padding.

- Open the **knowledge_base** recommendation. Read the reasoning — it cites the actual
  pricing/hours deferral pattern, now including the real call you just placed. Point out the
  **disabled Apply button** with its label explaining why: HighLevel's public API has no lever to
  attach a KB, so this stays advisory, honestly.
- Open the **guardrails** and **actions** pair together — both trace back to the same evidence (a
  caller invoking the account's real escalation policy, asking to be transferred, and the agent
  having no way to honor it): guardrails proposes the *rule* ("transfer when a caller invokes
  escalation"), actions proposes the *capability* ("configure the transfer action the rule would
  invoke"). Naming both from one root cause is the point — a rule with nothing to invoke, or a
  tool with no rule triggering it, is only half a fix.
- Briefly: this is AI-generated from real evidence (explanation + verbatim quotes per issue), not
  a canned suggestion.

## 3:20–4:00 — Before vs. After (the closing loop)

Open the **prompt** recommendation.

- Show the before/after diff panel side by side.
- Read 1-2 sentences of the reasoning (ties back to the tone/qualification/follow-up issues shown
  earlier).
- Click **Apply to agent** live.
- Switch to HighLevel's own Voice AI agent Build screen (or re-open the agent via the API/dashboard)
  and show the prompt actually changed — this is the "verify it really applied" beat, the same
  thing already confirmed once via the API directly.

## 4:00–4:15 — Close

"Everything shown here — the ingestion, the analysis, the test generation, and the apply action —
is real against the live sandbox, including the call I just placed. What's disclosed as mocked
(the synthetic backfill history, simulated test calls, and the two advisory-only categories the
platform doesn't expose) is documented in the README."

---

## If something goes sideways while recording

- **The real call doesn't show up on the first "Sync real calls" click**: HighLevel's Call Logs
  API can lag a bit behind the actual call ending. Keep narrating (e.g. describe the Overview tab
  while you wait) and click Sync again after ~20-30s rather than restarting the take.
- **Gemini rate limit mid-recording**: don't panic-retry on camera — cut, wait ~60s, resume. The
  retry logic handles this automatically outside of a live take; a live 429 will just show a
  console wait message if you're watching server logs.
- **Custom Page not installed yet**: fall back to `localhost:5173` and say so explicitly rather
  than implying it's already live in HighLevel.
