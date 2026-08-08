import { beforeAll, describe, expect, it } from "vitest";
import { upsertAgent } from "../src/db/agents";
import { insertCallLog, listUnanalyzedCallLogs } from "../src/db/callLogs";
import { insertIssue, getCategoryAggregates } from "../src/db/issues";
import type { GHLAgent } from "../src/types";

const AGENT: GHLAgent = {
  id: "agent-1",
  locationId: "loc-1",
  agentName: "Test Agent",
  businessName: "Test Business",
  welcomeMessage: "Hi there",
  agentPrompt: "You are a helpful appointment-booking agent.",
  voiceId: "voice-1",
  language: "en-US",
  patienceLevel: "medium",
  maxCallDuration: 600,
  timezone: "America/New_York",
  actions: [],
};

beforeAll(() => {
  upsertAgent(AGENT);
  insertCallLog({
    id: "call-1",
    agentId: AGENT.id,
    transcript: "AGENT: Hi\nCALLER: Hi",
    summary: "Clean booking",
    source: "real",
    durationSec: 120,
    createdAt: new Date().toISOString(),
  });
  insertCallLog({
    id: "call-2",
    agentId: AGENT.id,
    transcript: "AGENT: Hi\nCALLER: I have a complaint",
    summary: "Handled poorly",
    source: "synthetic",
    durationSec: 90,
    createdAt: new Date().toISOString(),
  });
});

describe("issue aggregation", () => {
  it("excludes call logs that have no issues recorded yet from listUnanalyzedCallLogs", () => {
    const before = listUnanalyzedCallLogs(AGENT.id);
    expect(before.map((c) => c.id).sort()).toEqual(["call-1", "call-2"]);

    insertIssue({
      callLogId: "call-2",
      category: "objection_handling",
      severity: "high",
      evidenceQuote: "I have a complaint",
      explanation: "The agent did not acknowledge the complaint.",
    });

    const after = listUnanalyzedCallLogs(AGENT.id);
    expect(after.map((c) => c.id)).toEqual(["call-1"]);
  });

  it("aggregates issue counts per category across distinct calls", () => {
    insertIssue({
      callLogId: "call-1",
      category: "objection_handling",
      severity: "low",
      evidenceQuote: null,
      explanation: "Minor hesitation, not fully addressed.",
    });

    const aggregates = getCategoryAggregates(AGENT.id);
    const objectionHandling = aggregates.find((a) => a.category === "objection_handling");
    expect(objectionHandling).toEqual({ category: "objection_handling", count: 2, callCount: 2 });
  });
});
