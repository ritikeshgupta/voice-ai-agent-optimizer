import { z } from "zod";
import { generateStructured } from "../../services/llm";
import type { CriterionResult, SuccessCriterion } from "../../types";

const judgeResultSchema = z.object({
  results: z
    .array(
      z.object({
        passed: z.boolean(),
        reasoning: z.string(),
        quote: z.string().nullable(),
      })
    )
    .describe("One result per criterion, in the same order the criteria were listed."),
});

const SYSTEM_PROMPT = `You are a strict QA judge scoring a phone call transcript against a fixed
list of success criteria for a Voice AI agent test case. Score each criterion independently and
literally -- a failure on one criterion must not bias your score on another. Quote the transcript
directly when you can; if a criterion doesn't apply because the relevant moment never came up in
the call, mark it failed and say so in your reasoning (a criterion that never gets tested is not
a pass).`;

function describeCriterion(c: SuccessCriterion): string {
  switch (c.type) {
    case "must_collect_field":
      return `Must collect the caller's ${c.field}.`;
    case "must_follow_booking_flow":
      return "Must follow the intended appointment booking flow to completion.";
    case "must_stay_on_brand":
      return "Must stay on-brand, professional, and polite throughout.";
    case "must_handle_interruption_or_objection":
      return `Must handle this objection/interruption well: ${c.objection}`;
    case "must_not_claim":
      return `Must NOT claim or promise: ${c.claim}`;
    case "must_offer_transfer_on":
      return `Must offer a human transfer when: ${c.trigger}`;
    case "custom":
      return c.description;
  }
}

export async function judgeTranscript(
  transcript: string,
  criteria: SuccessCriterion[]
): Promise<CriterionResult[]> {
  const criteriaList = criteria.map((c, i) => `${i + 1}. ${describeCriterion(c)}`).join("\n");

  const result = await generateStructured({
    system: SYSTEM_PROMPT,
    prompt: `TRANSCRIPT:\n"""\n${transcript}\n"""\n\nCRITERIA TO SCORE, IN ORDER:\n${criteriaList}`,
    schema: judgeResultSchema,
    maxTokens: 4096,
  });

  return criteria.map((criterion, i) => ({
    criterion,
    passed: result.results[i]?.passed ?? false,
    reasoning: result.results[i]?.reasoning ?? "Judge did not return a result for this criterion.",
    quote: result.results[i]?.quote ?? null,
  }));
}
