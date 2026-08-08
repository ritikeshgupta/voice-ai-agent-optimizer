import dotenv from "dotenv";
dotenv.config();

import { randomUUID } from "node:crypto";
import { z } from "zod";
import "../src/db";
import { ghlClient } from "../src/services/ghlClient";
import { upsertAgent } from "../src/db/agents";
import { clearSyntheticCallLogs, insertCallLog } from "../src/db/callLogs";
import { generateStructured, QuotaExhaustedError } from "../src/services/llm";
import { CATEGORY_DESCRIPTIONS, ISSUE_CATEGORIES } from "../src/modules/analyze/taxonomy";
import type { IssueCategoryLiteral } from "../src/modules/analyze/taxonomy";
import type { GHLAgent } from "../src/types";

/**
 * Grounded, specific scenario descriptions for categories where the generic taxonomy
 * description alone tends to produce vague, interchangeable transcripts. These two exist
 * specifically to give real evidence for `knowledge_base` and `guardrails` recommendations
 * (neither of which has its own issue category) -- written against this agent's actual
 * configuration: a pure lead-capture/triage bot with zero actions configured (no KB attached, no
 * call transfer, no tools at all), whose own prompt requires it to defer anything not explicitly
 * given to it rather than guess.
 *
 * Both reference real entries already populated in the account's "Existing knowledge base" (see
 * SKILL.md / README) -- the point isn't "no KB exists," it's "a KB exists with the answer, but
 * this agent has no action wiring it up," which is a sharper, more specific recommendation than
 * "create a knowledge base from scratch." Falls back to the generic taxonomy description for
 * every other category.
 */
const SCENARIO_OVERRIDES: Partial<Record<IssueCategoryLiteral, string>> = {
  policy_violation: `The caller asks either "what are your business hours?" or "how much do your
plans cost?" -- both have real, specific answers sitting in the account's knowledge base (hours:
Mon-Fri 9AM-6PM IST; pricing: plans start at $99/month for up to 500 calls), but this agent has no
knowledge-base action configured, so it cannot reach that content. Its own prompt requires it to
defer anything not explicitly given to it rather than guess. Show the agent responding with "a
team member will reach out" instead of answering, even though the real answer exists just one
action away. This should read as a missed opportunity caused by a real capability gap -- the
agent isn't making anything up, it genuinely has no access to the answer.`,
  objection_handling: `The caller says something like "I was told I could ask to speak to a
specialist for urgent issues" (referencing the account's real escalation policy) and asks to be
transferred right now because their issue is urgent. This agent has no call-transfer action
configured and no escalation instructions in its own prompt, so instead of honoring that policy
it just continues the standard script -- asking for contact info and promising a callback -- even
though the caller directly invoked a real, stated policy that this agent has no way to fulfill.`,
};

const singleTranscriptSchema = z.object({
  scenario: z.string(),
  transcript: z.string(),
  durationSec: z.number().int().min(30).max(600),
});

const transcriptBatchSchema = z.object({
  calls: z.array(singleTranscriptSchema),
});

async function syncAgentsAndRealCalls(): Promise<GHLAgent[]> {
  console.log("Syncing agents from the HighLevel sandbox...");
  const agents = await ghlClient.listAgents();
  agents.forEach(upsertAgent);
  console.log(`Cached ${agents.length} agent(s).`);

  for (const agent of agents) {
    const { callLogs } = await ghlClient.listCallLogs({ agentId: agent.id, pageSize: 50 });
    for (const call of callLogs) {
      insertCallLog({
        id: call.id,
        agentId: call.agentId,
        transcript: call.transcript,
        summary: call.summary ?? null,
        source: "real",
        durationSec: call.duration,
        createdAt: call.createdAt,
      });
    }
    console.log(`  "${agent.agentName}": pulled ${callLogs.length} real call log(s) via the Call Logs API.`);
  }
  return agents;
}

/**
 * One transcript per issue category, deliberately targeted rather than left to chance -- a
 * "generate N mixed transcripts" prompt can easily skip a category or double up on another,
 * which then starves testgen/recommend of evidence for that category. Guaranteeing exactly one
 * unambiguous flaw per category means every category has real evidence to build on.
 */
async function generateCategoryTranscript(
  agentPrompt: string,
  category: IssueCategoryLiteral
): Promise<{ scenario: string; transcript: string; durationSec: number }> {
  const flawDescription = SCENARIO_OVERRIDES[category] ?? CATEGORY_DESCRIPTIONS[category];
  return generateStructured({
    system: `You generate one realistic but synthetic Voice AI phone call transcript for seeding
a QA demo. Format it as alternating "AGENT: ..." and "CALLER: ..." lines. The call must contain
exactly one clear, unambiguous flaw: ${flawDescription} The flaw must be obvious in the
transcript text -- a QA analyzer reading only the text should be able to spot it without
guessing. Keep everything else about the call normal and realistic; don't pile on unrelated
problems.`,
    prompt: `AGENT'S CONFIGURED PROMPT:\n"""\n${agentPrompt}\n"""\n\nGenerate one call transcript that clearly exhibits this issue: ${category} -- ${flawDescription}`,
    schema: singleTranscriptSchema,
    maxTokens: 2000,
  });
}

async function generateHappyPathTranscripts(
  agentPrompt: string,
  count: number
): Promise<{ scenario: string; transcript: string; durationSec: number }[]> {
  if (count <= 0) return [];
  const result = await generateStructured({
    system: `You generate realistic, synthetic Voice AI phone call transcripts for seeding a
demo, formatted as alternating "AGENT: ..." and "CALLER: ..." lines. Every call here must be a
clean success: the agent follows its configured prompt correctly end to end, handles the caller
politely and on-brand, and completes its goal (booking, information, follow-up, etc.) with no
issues at all.`,
    prompt: `AGENT'S CONFIGURED PROMPT:\n"""\n${agentPrompt}\n"""\n\nGenerate ${count} distinct clean, successful call transcripts.`,
    schema: transcriptBatchSchema,
    maxTokens: 8000,
  });
  return result.calls;
}

/**
 * Deterministic coverage: one transcript per issue category (6 total, always), plus
 * `happyPathCount` clean calls on top. This is what feeds the analyze/testgen/recommend demo --
 * see the Team-of-One conversation that led here: letting an LLM freely mix flaws into N
 * transcripts risks uneven or missing category coverage, which then starves downstream loops.
 */
async function backfillSynthetic(agentId: string, agentPrompt: string, happyPathCount: number): Promise<number> {
  const now = Date.now();
  let slot = 0;
  let inserted = 0;

  for (const category of ISSUE_CATEGORIES) {
    console.log(`  Generating a transcript targeting: ${category}...`);
    const call = await generateCategoryTranscript(agentPrompt, category);
    insertCallLog({
      id: `synthetic-${randomUUID()}`,
      agentId,
      transcript: call.transcript,
      summary: `[targets: ${category}] ${call.scenario}`,
      source: "synthetic",
      durationSec: call.durationSec,
      // Stagger over the past several days so the dashboard shows a history, not one burst.
      createdAt: new Date(now - ++slot * 6 * 60 * 60 * 1000).toISOString(),
    });
    inserted++;
  }

  if (happyPathCount > 0) {
    console.log(`  Generating ${happyPathCount} happy-path transcript(s)...`);
    const happyCalls = await generateHappyPathTranscripts(agentPrompt, happyPathCount);
    for (const call of happyCalls) {
      insertCallLog({
        id: `synthetic-${randomUUID()}`,
        agentId,
        transcript: call.transcript,
        summary: `[happy path] ${call.scenario}`,
        source: "synthetic",
        durationSec: call.durationSec,
        createdAt: new Date(now - ++slot * 6 * 60 * 60 * 1000).toISOString(),
      });
      inserted++;
    }
  }

  return inserted;
}

async function main() {
  const agents = await syncAgentsAndRealCalls();
  if (agents.length === 0) {
    console.log("No agents found in the sandbox location. Create one in the HighLevel UI first, then re-run.");
    return;
  }

  const targetAgentId = process.env.SEED_AGENT_ID || agents[0].id;
  const target = agents.find((a) => a.id === targetAgentId);
  if (!target) {
    throw new Error(`SEED_AGENT_ID=${targetAgentId} was not found among the agents just synced.`);
  }

  const happyPathCount = Number(process.env.SEED_SYNTHETIC_COUNT ?? 4);
  if (!Number.isFinite(happyPathCount) || happyPathCount < 0) {
    throw new Error("SEED_SYNTHETIC_COUNT must be a non-negative number");
  }
  if (happyPathCount === 0 && process.env.SEED_SYNTHETIC_COUNT === "0") {
    console.log("SEED_SYNTHETIC_COUNT=0 — skipping synthetic backfill entirely (agent + real calls already synced).");
    console.log("Seed complete.");
    return;
  }

  const cleared = clearSyntheticCallLogs(target.id);
  if (cleared > 0) {
    console.log(`Cleared ${cleared} synthetic call log(s) from a previous seed run before regenerating.`);
  }

  console.log(
    `Generating synthetic backfill for "${target.agentName}": one transcript per issue category ` +
      `(${ISSUE_CATEGORIES.length}) + ${happyPathCount} happy-path...`
  );
  try {
    const inserted = await backfillSynthetic(target.id, target.agentPrompt, happyPathCount);
    console.log(`Inserted ${inserted} synthetic call log(s), tagged source: "synthetic".`);
    console.log("Seed complete. Analyze / test-gen / recommend can now be run via the API or dashboard.");
  } catch (err) {
    if (err instanceof QuotaExhaustedError) {
      console.error("\nLLM quota/rate limit hit — synthetic backfill stopped partway through.");
      console.error(err.message);
      console.error(
        "Agent sync already succeeded. Whatever transcripts were inserted before the limit hit are still usable; " +
          "fix LLM credits (Gemini/Anthropic) and re-run to fill in the rest."
      );
      process.exit(1);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
