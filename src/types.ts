// Shapes returned by HighLevel's Voice AI API, trimmed to the fields this app uses.
// Verified against .claude/skills/voice-ai-optimizer/reference/voice-ai-openapi.json --
// notably there is no `model` or `temperature` field anywhere in the real schema.

export interface GHLAgentAction {
  id: string;
  actionType:
    | "CALL_TRANSFER"
    | "DATA_EXTRACTION"
    | "IN_CALL_DATA_EXTRACTION"
    | "WORKFLOW_TRIGGER"
    | "SMS"
    | "APPOINTMENT_BOOKING"
    | "CUSTOM_ACTION"
    | "KNOWLEDGE_BASE";
  name: string;
  actionParameters: Record<string, unknown>;
}

export interface GHLAgent {
  id: string;
  locationId: string;
  agentName: string;
  businessName: string;
  welcomeMessage: string;
  agentPrompt: string;
  voiceId: string;
  language: string;
  patienceLevel: "low" | "medium" | "high";
  maxCallDuration: number;
  timezone: string;
  actions: GHLAgentAction[];
}

export interface GHLExecutedCallAction {
  actionId?: string;
  actionType: GHLAgentAction["actionType"];
  actionName: string;
  actionParameters?: Record<string, unknown>;
  executedAt?: string;
  triggerReceivedAt?: string;
}

export interface GHLCallLog {
  id: string;
  contactId?: string;
  agentId: string;
  isAgentDeleted: boolean;
  fromNumber?: string;
  createdAt: string;
  duration: number;
  trialCall: boolean;
  executedCallActions: GHLExecutedCallAction[];
  summary: string;
  transcript: string;
  extractedData?: Record<string, unknown>;
}

// --- App-internal domain types (mirror src/db/schema.sql) ---

export type IssueCategory =
  | "qualification"
  | "objection_handling"
  | "tone"
  | "booking_flow"
  | "follow_up"
  | "policy_violation";

export type IssueSeverity = "low" | "medium" | "high";

export interface Issue {
  id: number;
  callLogId: string;
  category: IssueCategory;
  severity: IssueSeverity;
  evidenceQuote: string | null;
  explanation: string;
  createdAt: string;
}

export type SuccessCriterion =
  | { type: "must_collect_field"; field: string }
  | { type: "must_follow_booking_flow" }
  | { type: "must_stay_on_brand" }
  | { type: "must_handle_interruption_or_objection"; objection: string }
  | { type: "must_not_claim"; claim: string }
  | { type: "must_offer_transfer_on"; trigger: string }
  | { type: "custom"; description: string };

export interface CriterionResult {
  criterion: SuccessCriterion;
  passed: boolean;
  reasoning: string;
  quote: string | null;
}

export type RecommendationCategory =
  | "prompt"
  | "actions"
  | "knowledge_base"
  | "guardrails"
  | "model"
  | "temperature";

export const API_BACKED_RECOMMENDATION_CATEGORIES: ReadonlySet<RecommendationCategory> = new Set([
  "prompt",
  "actions",
  "knowledge_base",
  "guardrails",
]);
