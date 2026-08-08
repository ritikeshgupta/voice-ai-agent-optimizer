import { generateStructured } from "../../services/llm";
import { analysisResultSchema, CATEGORY_DESCRIPTIONS, ISSUE_CATEGORIES } from "./taxonomy";
import { parseTranscript } from "./transcriptParser";
import { getAgent } from "../../db/agents";
import { insertIssue, getCategoryAggregates, type CategoryAggregate } from "../../db/issues";
import { listUnanalyzedCallLogs, type CallLogRecord } from "../../db/callLogs";

const SYSTEM_PROMPT = `You are a QA reviewer for a business's Voice AI phone agent. You compare a
single call transcript against the agent's intended script/goal (given as its configured prompt)
and identify where the agent succeeded, failed, or missed an opportunity -- not stylistic
nitpicks.

A missed opportunity is NOT the same as "the agent broke a rule." The agent can follow its own
prompt perfectly and still miss an opportunity, if the prompt itself is the gap -- e.g. it
correctly defers a question it has no tool/knowledge-base access to answer, when a well-equipped
agent could have resolved it on the spot. That is real evidence for policy_violation just as much
as an outright rule break is; don't withhold a finding just because the agent was "only doing
what it was told."

Only report an issue when the transcript gives clear evidence for it (a rule break, or a concrete
missed opportunity). If the call went well and nothing was missed, return an empty issues array
rather than inventing minor complaints.

Categories and what they mean:
${ISSUE_CATEGORIES.map((c) => `- ${c}: ${CATEGORY_DESCRIPTIONS[c]}`).join("\n")}`;

function buildPrompt(agentPrompt: string, transcript: string): string {
  const turns = parseTranscript(transcript);
  const rendered = turns.map((t) => `${t.speaker.toUpperCase()}: ${t.text}`).join("\n");
  return `AGENT'S CONFIGURED PROMPT / SCRIPT:
"""
${agentPrompt}
"""

CALL TRANSCRIPT:
"""
${rendered}
"""

Identify every issue in this call against the agent's configured goal above.`;
}

/** Runs the analyze loop for one call: LLM classification against the fixed taxonomy. */
export async function analyzeCallLog(callLog: CallLogRecord): Promise<number> {
  const agent = getAgent(callLog.agentId);
  if (!agent) {
    throw new Error(`Cannot analyze call log ${callLog.id}: agent ${callLog.agentId} not cached locally`);
  }

  const result = await generateStructured({
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(agent.agentPrompt, callLog.transcript),
    schema: analysisResultSchema,
  });

  for (const issue of result.issues) {
    insertIssue({
      callLogId: callLog.id,
      category: issue.category,
      severity: issue.severity,
      evidenceQuote: issue.evidenceQuote,
      explanation: issue.explanation,
    });
  }

  return result.issues.length;
}

/** Analyzes every call log for this agent that hasn't been analyzed yet. */
export async function analyzeUnprocessedCallLogs(agentId: string): Promise<{
  callsAnalyzed: number;
  issuesFound: number;
}> {
  const pending = listUnanalyzedCallLogs(agentId);
  let issuesFound = 0;
  for (const callLog of pending) {
    issuesFound += await analyzeCallLog(callLog);
  }
  return { callsAnalyzed: pending.length, issuesFound };
}

export function getRecurringIssues(agentId: string): CategoryAggregate[] {
  return getCategoryAggregates(agentId);
}
