import type { GHLAgentAction } from "../types";

const ACTION_LABELS: Record<GHLAgentAction["actionType"], string> = {
  CALL_TRANSFER: "transfer the call",
  DATA_EXTRACTION: "extract a contact field from what the caller says",
  IN_CALL_DATA_EXTRACTION: "extract a contact field mid-call",
  WORKFLOW_TRIGGER: "trigger a workflow",
  SMS: "send a follow-up SMS",
  APPOINTMENT_BOOKING: "book an appointment on the calendar",
  CUSTOM_ACTION: "call an external API",
  KNOWLEDGE_BASE: "look up an answer in the knowledge base",
};

/** Short human-readable summary of an agent's configured actions, for prompting a second LLM. */
export function summarizeActions(actions: GHLAgentAction[]): string {
  if (actions.length === 0) return "none configured";
  return actions.map((a) => `${a.name} (${ACTION_LABELS[a.actionType]})`).join("; ");
}
