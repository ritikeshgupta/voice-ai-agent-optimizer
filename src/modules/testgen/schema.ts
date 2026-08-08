import { z } from "zod";
import { ISSUE_CATEGORIES } from "../analyze/taxonomy";

export const successCriterionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("must_collect_field"), field: z.string() }),
  z.object({ type: z.literal("must_follow_booking_flow") }),
  z.object({ type: z.literal("must_stay_on_brand") }),
  z.object({ type: z.literal("must_handle_interruption_or_objection"), objection: z.string() }),
  z.object({ type: z.literal("must_not_claim"), claim: z.string() }),
  z.object({ type: z.literal("must_offer_transfer_on"), trigger: z.string() }),
  z.object({ type: z.literal("custom"), description: z.string() }),
]);

export const generatedTestCaseSchema = z.object({
  title: z.string(),
  scenarioType: z.enum(["happy_path", "edge_case"]),
  personaPrompt: z
    .string()
    .describe(
      "System prompt for an LLM playing the caller in a simulated phone call: who they are, what they want, how they talk."
    ),
  successCriteria: z.array(successCriterionSchema).min(1).max(5),
  sourceCategories: z
    .array(z.enum(ISSUE_CATEGORIES))
    .describe("Which recurring-issue categories (if any) motivated this test case; empty for a generic happy path."),
});

export const testCaseBatchSchema = z.object({
  testCases: z.array(generatedTestCaseSchema).min(1),
});

export type GeneratedTestCase = z.infer<typeof generatedTestCaseSchema>;
