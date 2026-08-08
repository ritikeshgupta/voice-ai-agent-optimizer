import { describe, expect, it } from "vitest";
import { parseTranscript } from "../src/modules/analyze/transcriptParser";

describe("parseTranscript", () => {
  it("splits labeled lines into speaker turns", () => {
    const turns = parseTranscript(
      "AGENT: Hi, thanks for calling.\nCALLER: I need to book a repair.\nAGENT: Sure, what's your address?"
    );
    expect(turns).toEqual([
      { speaker: "agent", text: "Hi, thanks for calling." },
      { speaker: "caller", text: "I need to book a repair." },
      { speaker: "agent", text: "Sure, what's your address?" },
    ]);
  });

  it("recognizes common label variants for each side", () => {
    const turns = parseTranscript("AI: Hello\nCustomer: Hi there");
    expect(turns).toEqual([
      { speaker: "agent", text: "Hello" },
      { speaker: "caller", text: "Hi there" },
    ]);
  });

  it("appends unlabeled continuation lines to the previous turn", () => {
    const turns = parseTranscript("AGENT: Let me check that for you.\nOne moment please.");
    expect(turns).toEqual([{ speaker: "agent", text: "Let me check that for you. One moment please." }]);
  });

  it("falls back to a single unknown-speaker turn when there is no label at all", () => {
    const turns = parseTranscript("just some raw text with no speaker tags");
    expect(turns).toEqual([{ speaker: "unknown", text: "just some raw text with no speaker tags" }]);
  });

  it("ignores blank lines", () => {
    const turns = parseTranscript("AGENT: Hi\n\n\nCALLER: Hello");
    expect(turns).toHaveLength(2);
  });
});
