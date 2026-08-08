import { z } from "zod";

export const recommendationDraftSchema = z.object({
  category: z.enum(["prompt", "actions", "knowledge_base", "guardrails", "model", "temperature"]),
  afterValue: z
    .string()
    .describe(
      "For 'prompt'/'guardrails': the FULL replacement agent prompt text, not a diff or snippet. " +
        "For other categories: a clear plain-language description of the proposed change."
    ),
  reasoning: z.string().describe("Why this change helps, tied to specific evidence -- not generic advice."),
  evidenceSummary: z
    .string()
    .describe("Which recurring issue category or failed test case(s) motivated this recommendation."),
});

export const recommendationBatchSchema = z.object({
  recommendations: z.array(recommendationDraftSchema),
});

export type RecommendationDraft = z.infer<typeof recommendationDraftSchema>;
