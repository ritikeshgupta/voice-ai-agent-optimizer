import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ghlClient } from "../../services/ghlClient";
import { upsertAgent } from "../../db/agents";
import { clearSyntheticCallLogs, insertCallLog } from "../../db/callLogs";
import { generateStructured, QuotaExhaustedError } from "../../services/llm";
import { CATEGORY_DESCRIPTIONS, ISSUE_CATEGORIES } from "../analyze/taxonomy";
import type { IssueCategoryLiteral } from "../analyze/taxonomy";
import type { GHLAgent } from "../../types";

export { QuotaExhaustedError };

/**
 * Grounded, specific scenario descriptions for categories where the generic taxonomy
 * description alone tends to produce vague, interchangeable transcripts. See scripts/seed.ts's
 * original comment for the full rationale -- kept here since this is now the shared
 * implementation used by both the CLI seed script and the auto-reseed-on-boot path.
 */
const SCENARIO_OVERRIDES: Partial<Record<IssueCategoryLiteral, string>> = {
  policy_violation: `The caller asks "how much do your plans cost?" -- a real, specific answer
sits in the account's knowledge base (plans start at $99/month for up to 500 calls), but this
agent has no knowledge-base action configured, so it cannot reach that content. Its own prompt
requires it to defer anything not explicitly given to it rather than guess. Show the agent
responding with "a team member will reach out" instead of answering, even though the real answer
exists just one action away. This should read as a missed opportunity caused by a real capability
gap -- the agent isn't making anything up, it genuinely has no access to the answer. Do NOT use a
business-hours question for this scenario -- the agent's prompt already has business hours
directly available and correctly answers that one specifically; the gap here is pricing.`,
  objection_handling: `The caller says something like "I was told I could ask to speak to a
specialist for urgent issues" (referencing the account's real escalation policy) and asks to be
transferred right now because their issue is urgent. This agent has no call-transfer action
configured and no escalation instructions in its own prompt, so instead of honoring that policy
it just continues the standard script -- asking for contact info and promising a callback -- even
though the caller directly invoked a real, stated policy that this agent has no way to fulfill.`,
};

/**
 * Guaranteed happy-path evidence that the agent isn't uniformly incapable -- it correctly
 * answers business hours (baked directly into its prompt) while still gapping on pricing/
 * escalation, which is what actually makes the policy_violation/knowledge_base story land as a
 * specific, targeted gap instead of "this agent can't answer anything."
 */
async function generateHoursSuccessTranscript(
  agentPrompt: string
): Promise<{ scenario: string; transcript: string; durationSec: number }> {
  return generateStructured({
    system: `You generate one realistic but synthetic Voice AI phone call transcript for seeding
a QA demo. Format it as alternating "AGENT: ..." and "CALLER: ..." lines. This call must be a
clean success: the caller asks specifically about business hours, and the agent answers directly
and correctly using the business-hours information already in its own prompt (Monday-Friday,
9:00 AM - 6:00 PM IST) -- no deferral, no "a team member will reach out." The agent should still
follow the rest of its script (greeting, gathering contact info) around that answer.`,
    prompt: `AGENT'S CONFIGURED PROMPT:\n"""\n${agentPrompt}\n"""\n\nGenerate one call transcript where the caller asks about business hours and the agent answers correctly from its own prompt.`,
    schema: singleTranscriptSchema,
    maxTokens: 2000,
  });
}

const singleTranscriptSchema = z.object({
  scenario: z.string(),
  transcript: z.string(),
  durationSec: z.number().int().min(30).max(600),
});

const transcriptBatchSchema = z.object({
  calls: z.array(singleTranscriptSchema),
});

async function syncAgentsAndRealCalls(log: (msg: string) => void): Promise<GHLAgent[]> {
  log("Syncing agents from the HighLevel sandbox...");
  const agents = await ghlClient.listAgents();
  agents.forEach(upsertAgent);
  log(`Cached ${agents.length} agent(s).`);

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
    log(`  "${agent.agentName}": pulled ${callLogs.length} real call log(s) via the Call Logs API.`);
  }
  return agents;
}

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

async function backfillSynthetic(
  agentId: string,
  agentPrompt: string,
  happyPathCount: number,
  log: (msg: string) => void
): Promise<number> {
  const now = Date.now();
  let slot = 0;
  let inserted = 0;

  for (const category of ISSUE_CATEGORIES) {
    log(`  Generating a transcript targeting: ${category}...`);
    const call = await generateCategoryTranscript(agentPrompt, category);
    insertCallLog({
      id: `synthetic-${randomUUID()}`,
      agentId,
      transcript: call.transcript,
      summary: `[targets: ${category}] ${call.scenario}`,
      source: "synthetic",
      durationSec: call.durationSec,
      createdAt: new Date(now - ++slot * 6 * 60 * 60 * 1000).toISOString(),
    });
    inserted++;
  }

  log("  Generating a guaranteed happy-path transcript: caller asks business hours, agent answers correctly...");
  const hoursCall = await generateHoursSuccessTranscript(agentPrompt);
  insertCallLog({
    id: `synthetic-${randomUUID()}`,
    agentId,
    transcript: hoursCall.transcript,
    summary: `[happy path: business hours] ${hoursCall.scenario}`,
    source: "synthetic",
    durationSec: hoursCall.durationSec,
    createdAt: new Date(now - ++slot * 6 * 60 * 60 * 1000).toISOString(),
  });
  inserted++;

  if (happyPathCount > 0) {
    log(`  Generating ${happyPathCount} happy-path transcript(s)...`);
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

export interface SeedOptions {
  agentId?: string;
  happyPathCount?: number;
  /** Skip the entire synthetic backfill (including the per-category transcripts), not just the happy-path extras. */
  skipSynthetic?: boolean;
  log?: (msg: string) => void;
}

export interface SeedResult {
  agentsSynced: number;
  syntheticInserted: number;
  skipped?: string;
}

/**
 * Shared seed implementation: sync real agent(s)/calls from the sandbox, then backfill exactly
 * one synthetic transcript per issue category plus a configurable number of happy-path calls.
 * Used by both `npm run seed` (CLI) and the auto-reseed-on-boot path in src/index.ts, since a
 * host without a persistent disk (e.g. Render's free tier) can lose the SQLite file on any
 * cold start -- see README's Team-of-One notes.
 */
export async function runSeed(options: SeedOptions = {}): Promise<SeedResult> {
  const log = options.log ?? (() => {});
  const agents = await syncAgentsAndRealCalls(log);
  if (agents.length === 0) {
    return { agentsSynced: 0, syntheticInserted: 0, skipped: "No agents found in the sandbox location." };
  }

  const targetAgentId = options.agentId || agents[0].id;
  const target = agents.find((a) => a.id === targetAgentId);
  if (!target) {
    throw new Error(`Agent id ${targetAgentId} was not found among the agents just synced.`);
  }

  if (options.skipSynthetic) {
    return { agentsSynced: agents.length, syntheticInserted: 0 };
  }

  const happyPathCount = options.happyPathCount ?? 4;
  if (!Number.isFinite(happyPathCount) || happyPathCount < 0) {
    throw new Error("happyPathCount must be a non-negative number");
  }

  const cleared = clearSyntheticCallLogs(target.id);
  if (cleared > 0) {
    log(`Cleared ${cleared} synthetic call log(s) from a previous seed run before regenerating.`);
  }

  log(
    `Generating synthetic backfill for "${target.agentName}": one transcript per issue category ` +
      `(${ISSUE_CATEGORIES.length}) + ${happyPathCount} happy-path...`
  );
  const syntheticInserted = await backfillSynthetic(target.id, target.agentPrompt, happyPathCount, log);
  return { agentsSynced: agents.length, syntheticInserted };
}
