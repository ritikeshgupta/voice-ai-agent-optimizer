import { randomUUID } from "node:crypto";
import { generateStructured } from "../../services/llm";
import { testCaseBatchSchema } from "./schema";
import { getAgent } from "../../db/agents";
import { getCategoryAggregates } from "../../db/issues";
import { listRecentIssueIdsByCategory } from "../../db/issues";
import { insertTestCase } from "../../db/testCases";

const SYSTEM_PROMPT = `You design regression test cases for a business's Voice AI phone agent, based
on its configured prompt/script and its recent recurring-issue history.

Produce a mixed batch: some happy-path scenarios (the call should go well end to end) and some
edge cases (interruptions, objections, off-script questions, callers who try to skip steps,
callers who ask about things the agent shouldn't promise). Prioritize edge cases that target the
agent's actual recurring issues, but include at least one or two happy-path cases too.

Every test case needs:
- a caller persona prompt detailed enough to drive a believable simulated phone call
- 1-5 structured, machine-checkable success criteria (not prose descriptions of what "good" looks
  like -- pick from: must_collect_field, must_follow_booking_flow, must_stay_on_brand,
  must_handle_interruption_or_objection, must_not_claim, must_offer_transfer_on, or custom)

CRITICAL: every criterion attached to a test case must be something that test case's specific
persona actually attempts or asks for. Never attach must_follow_booking_flow unless that persona
actually tries to book an appointment; never attach must_offer_transfer_on unless that persona
actually asks to be transferred/escalated; same logic for every other criterion type. A criterion
that isn't triggered by anything in the scenario isn't testing anything -- it just fails by
construction and produces a false negative.

Separately: only use a criterion type at all if the agent's configured prompt/actions plausibly
support it. If the agent has no booking-related instructions or actions anywhere in its prompt,
don't generate booking-flow test cases for it at all -- that capability doesn't exist yet, so
there's nothing to regression-test.`;

function buildPrompt(
  agentPrompt: string,
  aggregates: { category: string; count: number; callCount: number }[],
  count: number
): string {
  const issueSummary =
    aggregates.length > 0
      ? aggregates.map((a) => `- ${a.category}: seen in ${a.count} issue(s) across ${a.callCount} call(s)`).join("\n")
      : "(no recurring issues recorded yet -- generate primarily happy-path and generic edge cases)";

  return `AGENT'S CONFIGURED PROMPT / SCRIPT:
"""
${agentPrompt}
"""

RECURRING ISSUES OBSERVED IN PAST CALLS:
${issueSummary}

Generate ${count} test cases.`;
}

export async function generateTestCases(agentId: string, count = 8): Promise<number> {
  const agent = getAgent(agentId);
  if (!agent) {
    throw new Error(`Cannot generate test cases: agent ${agentId} not cached locally`);
  }
  const aggregates = getCategoryAggregates(agentId);

  const result = await generateStructured({
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(agent.agentPrompt, aggregates, count),
    schema: testCaseBatchSchema,
    maxTokens: 8192,
  });

  for (const tc of result.testCases) {
    const sourceIssueIds = tc.sourceCategories.flatMap((category) =>
      listRecentIssueIdsByCategory(agentId, category, 3)
    );
    insertTestCase({
      id: randomUUID(),
      agentId,
      title: tc.title,
      scenarioType: tc.scenarioType,
      personaPrompt: tc.personaPrompt,
      successCriteria: tc.successCriteria,
      sourceIssueIds: [...new Set(sourceIssueIds)],
    });
  }

  return result.testCases.length;
}
