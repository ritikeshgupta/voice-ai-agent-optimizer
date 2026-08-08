export interface AgentRecord {
  id: string;
  agentName: string;
  businessName: string | null;
  agentPrompt: string;
  actions: { id: string; actionType: string; name: string }[];
  updatedAt: string;
}

export type CallLogSource = "real" | "synthetic";

export interface CallLogRecord {
  id: string;
  agentId: string;
  transcript: string;
  summary: string | null;
  source: CallLogSource;
  durationSec: number | null;
  createdAt: string;
}

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

export interface CategoryAggregate {
  category: IssueCategory;
  count: number;
  callCount: number;
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

export type TestRunMode = "simulated" | "real_call";

export interface TestRunRecord {
  id: number;
  testCaseId: string;
  mode: TestRunMode;
  transcript: string;
  criteriaResults: CriterionResult[];
  passed: boolean;
  runAt: string;
}

export interface TestCaseRecord {
  id: string;
  agentId: string;
  title: string;
  scenarioType: "happy_path" | "edge_case";
  personaPrompt: string;
  successCriteria: SuccessCriterion[];
  sourceIssueIds: number[];
  createdAt: string;
  runs: TestRunRecord[];
}

export type RecommendationCategory =
  | "prompt"
  | "actions"
  | "knowledge_base"
  | "guardrails"
  | "model"
  | "temperature";

export interface RecommendationRecord {
  id: string;
  agentId: string;
  category: RecommendationCategory;
  appliesViaApi: boolean;
  beforeValue: string | null;
  afterValue: string;
  reasoning: string;
  evidence: string[];
  status: "suggested" | "applied" | "dismissed";
  createdAt: string;
}
