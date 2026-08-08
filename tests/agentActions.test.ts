import { describe, expect, it } from "vitest";
import { summarizeActions } from "../src/util/agentActions";
import type { GHLAgentAction } from "../src/types";

describe("summarizeActions", () => {
  it("returns a placeholder when there are no actions", () => {
    expect(summarizeActions([])).toBe("none configured");
  });

  it("renders each action's name with a human-readable description of its type", () => {
    const actions: GHLAgentAction[] = [
      { id: "1", actionType: "APPOINTMENT_BOOKING", name: "Book Repair Visit", actionParameters: {} },
      { id: "2", actionType: "CALL_TRANSFER", name: "Escalate to Manager", actionParameters: {} },
    ];
    const summary = summarizeActions(actions);
    expect(summary).toContain("Book Repair Visit (book an appointment on the calendar)");
    expect(summary).toContain("Escalate to Manager (transfer the call)");
  });
});
