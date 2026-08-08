import { randomUUID } from "node:crypto";
import { generateStructured } from "../../services/llm";
import { recommendationBatchSchema } from "./schema";
import { getAgent, upsertAgent } from "../../db/agents";
import { getCategoryAggregates, listIssuesForAgent, type CategoryAggregate } from "../../db/issues";
import { listFailedTestRunsForAgent } from "../../db/testRuns";
import { getTestCase } from "../../db/testCases";
import {
  insertRecommendation,
  setRecommendationStatus,
  getRecommendation,
} from "../../db/recommendations";
import { ghlClient } from "../../services/ghlClient";
import type { Issue } from "../../types";

const MAX_EXAMPLES_PER_CATEGORY = 3;

// These two categories both translate to an agentPrompt patch -- HighLevel implements guardrails
// (e.g. "transfer if caller mentions billing") as instructions written into the prompt, not a
// separate structured field. See SKILL.md.
const PROMPT_PATCHABLE = new Set(["prompt", "guardrails"]);

const SYSTEM_PROMPT = `You are optimizing a HighLevel Voice AI phone agent. You'll be given the
agent's current prompt, its recurring issue history, and failed test case results. Recommend
concrete, prioritized changes -- do not pad the list with vague or unsupported suggestions.

For "prompt" and "guardrails" categories, afterValue must be the FULL replacement agent prompt
text (not a diff, not a snippet) -- it will be written back as the new prompt verbatim. Preserve
everything in the current prompt that isn't the problem; change only what needs to change.

For "actions", "knowledge_base", "model", and "temperature" categories, afterValue should
describe the proposed change clearly in plain language. Note: HighLevel's public Voice AI API has
no "model" or "temperature" field today, so those two categories are inherently advisory --
recommend them anyway when justified, but don't claim they can be applied automatically.

Every recommendation must cite specific evidence -- a recurring issue category, a failed test
case, or both. If there isn't enough evidence to justify a change, return fewer recommendations
rather than inventing ones.`;

/**
 * Renders aggregate counts *plus* a handful of real examples (explanation + verbatim quote) per
 * category. Counts alone ("policy_violation: 2 issues across 2 calls") give the recommend LLM
 * nothing concrete to ground a specific recommendation in -- the actual evidence text is what
 * turns "add guardrails" into "add a transfer rule for callers who ask for a manager, per call
 * X where the caller said '...' and got no escalation path."
 */
function summarizeIssueEvidence(aggregates: CategoryAggregate[], issues: Issue[]): string {
  if (aggregates.length === 0) return "(none recorded)";

  const byCategory = new Map<string, Issue[]>();
  for (const issue of issues) {
    const list = byCategory.get(issue.category) ?? [];
    list.push(issue);
    byCategory.set(issue.category, list);
  }

  return aggregates
    .map((agg) => {
      const examples = (byCategory.get(agg.category) ?? []).slice(0, MAX_EXAMPLES_PER_CATEGORY);
      const exampleLines = examples
        .map((ex) => `    - ${ex.explanation}${ex.evidenceQuote ? ` (quote: "${ex.evidenceQuote}")` : ""}`)
        .join("\n");
      return `- ${agg.category}: ${agg.count} issue(s) across ${agg.callCount} call(s)\n${exampleLines}`;
    })
    .join("\n");
}

function buildPrompt(
  agentPrompt: string,
  aggregates: CategoryAggregate[],
  issues: Issue[],
  failedTestSummaries: string[]
): string {
  const issueSummary = summarizeIssueEvidence(aggregates, issues);
  const failedSummary = failedTestSummaries.length > 0 ? failedTestSummaries.join("\n") : "(none)";

  return `AGENT'S CURRENT PROMPT:
"""
${agentPrompt}
"""

RECURRING ISSUES FROM PAST CALLS:
${issueSummary}

FAILED TEST CASES:
${failedSummary}

Recommend the changes that would most improve this agent, grounded in the evidence above.`;
}

export async function generateRecommendations(agentId: string): Promise<number> {
  const agent = getAgent(agentId);
  if (!agent) {
    throw new Error(`Cannot generate recommendations: agent ${agentId} not cached locally`);
  }

  const aggregates = getCategoryAggregates(agentId);
  const issues = listIssuesForAgent(agentId);
  const failedRuns = listFailedTestRunsForAgent(agentId);
  const failedSummaries = failedRuns.map((run) => {
    const testCase = getTestCase(run.testCaseId);
    const failedCriteria = run.criteriaResults.filter((r) => !r.passed).map((r) => r.reasoning);
    return `- Test "${testCase?.title ?? run.testCaseId}": failed on ${failedCriteria.join("; ") || "unspecified criteria"}`;
  });

  if (aggregates.length === 0 && failedSummaries.length === 0) {
    return 0;
  }

  const result = await generateStructured({
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(agent.agentPrompt, aggregates, issues, failedSummaries),
    schema: recommendationBatchSchema,
    maxTokens: 8192,
  });

  for (const rec of result.recommendations) {
    const isPromptLike = PROMPT_PATCHABLE.has(rec.category);
    insertRecommendation({
      id: randomUUID(),
      agentId,
      category: rec.category,
      appliesViaApi: isPromptLike,
      beforeValue: isPromptLike ? agent.agentPrompt : null,
      afterValue: rec.afterValue,
      reasoning: rec.reasoning,
      evidence: [rec.evidenceSummary],
    });
  }

  return result.recommendations.length;
}

/**
 * Applies a recommendation for real against the sandbox agent. Only prompt/guardrails
 * recommendations have an apply path in this version -- actions/knowledge_base changes aren't
 * yet wired to the Actions API (see README "what's mocked"), and model/temperature have no API
 * lever to apply to at all.
 */
export async function applyRecommendation(recommendationId: string): Promise<void> {
  const rec = getRecommendation(recommendationId);
  if (!rec) {
    throw new Error(`Recommendation ${recommendationId} not found`);
  }
  if (!rec.appliesViaApi) {
    throw new Error(`Recommendation ${recommendationId} is advisory-only and has no API lever to apply`);
  }
  if (!PROMPT_PATCHABLE.has(rec.category)) {
    throw new Error(`No apply handler implemented yet for category "${rec.category}"`);
  }

  await ghlClient.patchAgent(rec.agentId, { agentPrompt: rec.afterValue });
  const refreshed = await ghlClient.getAgent(rec.agentId);
  upsertAgent(refreshed);
  setRecommendationStatus(recommendationId, "applied");
}
