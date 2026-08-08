import { generateTurn, type ChatMessage } from "../../services/llm";

const MAX_TURNS = 8;
const END_TOKEN = "[END_CALL]";
const TURN_MAX_TOKENS = 250;

export interface SimulatedTurn {
  speaker: "agent" | "caller";
  text: string;
}

function buildAgentSystemPrompt(agentPrompt: string, actionsSummary: string): string {
  return `You are a business's Voice AI phone agent, answering an inbound call. Follow this
configured script/prompt exactly as a real deployment would -- including any policies,
guardrails, or transfer conditions written into it:

"""
${agentPrompt}
"""

Actions you can take (describe them in speech when relevant, don't emit function-call syntax):
${actionsSummary}

Speak naturally, one short turn at a time, as on a real phone call. No stage directions.`;
}

function buildCallerSystemPrompt(personaPrompt: string): string {
  return `You are role-playing as a caller phoning a business, for the purpose of testing their
Voice AI phone agent. Persona and goal:

${personaPrompt}

Stay fully in character. Speak naturally, one short turn at a time, as on a real phone call. When
the call has reached a natural conclusion (you got what you needed, gave up, or the agent ended
it), end your final line with the exact token ${END_TOKEN}. No stage directions.`;
}

/**
 * LLM-vs-LLM simulated call: one model plays the caller (per the test case's persona), a second
 * plays the agent (per its real configured prompt). This is the "simulated" test_run mode --
 * text-level, not a live voice call. See SKILL.md for why that boundary was chosen.
 */
export async function simulateConversation(opts: {
  agentPrompt: string;
  actionsSummary: string;
  personaPrompt: string;
  maxTurns?: number;
}): Promise<{ transcript: string; turns: SimulatedTurn[] }> {
  const maxTurns = opts.maxTurns ?? MAX_TURNS;
  const agentSystem = buildAgentSystemPrompt(opts.agentPrompt, opts.actionsSummary);
  const callerSystem = buildCallerSystemPrompt(opts.personaPrompt);

  const agentMessages: ChatMessage[] = [
    { role: "user", content: "The phone just connected. Greet the caller and begin." },
  ];
  const callerMessages: ChatMessage[] = [];
  const turns: SimulatedTurn[] = [];

  let agentLine = await generateTurn({
    system: agentSystem,
    messages: agentMessages,
    maxTokens: TURN_MAX_TOKENS,
  });
  agentMessages.push({ role: "assistant", content: agentLine });
  turns.push({ speaker: "agent", text: agentLine });

  for (let i = 0; i < maxTurns; i++) {
    callerMessages.push({ role: "user", content: agentLine });
    const rawCallerLine = await generateTurn({
      system: callerSystem,
      messages: callerMessages,
      maxTokens: TURN_MAX_TOKENS,
    });
    callerMessages.push({ role: "assistant", content: rawCallerLine });

    const shouldEnd = rawCallerLine.includes(END_TOKEN);
    const callerLine = rawCallerLine.replace(END_TOKEN, "").trim();
    turns.push({ speaker: "caller", text: callerLine });
    if (shouldEnd || !callerLine) break;

    agentMessages.push({ role: "user", content: callerLine });
    agentLine = await generateTurn({
      system: agentSystem,
      messages: agentMessages,
      maxTokens: TURN_MAX_TOKENS,
    });
    agentMessages.push({ role: "assistant", content: agentLine });
    turns.push({ speaker: "agent", text: agentLine });
  }

  const transcript = turns.map((t) => `${t.speaker.toUpperCase()}: ${t.text}`).join("\n");
  return { transcript, turns };
}
