import { z } from "zod";

export const ISSUE_CATEGORIES = [
  "qualification",
  "objection_handling",
  "tone",
  "booking_flow",
  "follow_up",
  "policy_violation",
] as const;

export type IssueCategoryLiteral = (typeof ISSUE_CATEGORIES)[number];

export const CATEGORY_DESCRIPTIONS: Record<IssueCategoryLiteral, string> = {
  qualification: "Missed or skipped a required qualification question (contact info, need, budget, timing).",
  objection_handling:
    "Responded poorly to a caller objection, pushback, or hesitation instead of addressing it -- including " +
    "ignoring an explicit request to escalate/transfer to a human, or failing to honor a stated company policy " +
    "the caller invoked, even if the agent has no way to actually fulfill it.",
  tone: "Off-brand, impolite, robotic, or otherwise inappropriate tone for the business.",
  booking_flow: "Failed to follow the intended appointment/booking flow, or booked incorrectly.",
  follow_up: "Weak or missing follow-up commitment (no confirmation, no next step stated).",
  policy_violation:
    "Made an unsupported claim, promised something out of policy, gave incorrect information -- OR correctly " +
    "followed its own deferral policy but missed an opportunity to resolve the caller's need directly because " +
    "of a real configuration gap (e.g. no knowledge base or tool attached to answer a routine question). The " +
    "agent doing exactly what its prompt says is still worth flagging here if the prompt itself is the gap.",
};

export const issueFindingSchema = z.object({
  category: z.enum(ISSUE_CATEGORIES),
  severity: z.enum(["low", "medium", "high"]),
  evidenceQuote: z
    .string()
    .nullable()
    .describe("A short verbatim quote from the transcript supporting this finding, or null if not quotable."),
  explanation: z.string().describe("One or two sentences explaining the issue against the agent's stated goal."),
});

export const analysisResultSchema = z.object({
  issues: z.array(issueFindingSchema),
});

export type AnalysisResult = z.infer<typeof analysisResultSchema>;
