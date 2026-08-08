export interface TranscriptTurn {
  speaker: "agent" | "caller" | "unknown";
  text: string;
}

const AGENT_LABELS = /^(agent|ai|bot|assistant|voice\s*ai)$/i;
const CALLER_LABELS = /^(caller|user|customer|contact|client|lead)$/i;
const LINE_PATTERN = /^([A-Za-z][A-Za-z0-9 _-]{0,24}):\s*(.*)$/;

/**
 * HighLevel's Call Log API returns `transcript` as a flat string, not turn-structured
 * JSON. This is a best-effort speaker-tag parser -- if the transcript doesn't follow
 * a "Label: text" convention, the whole thing comes back as a single unknown-speaker turn.
 */
export function parseTranscript(transcript: string): TranscriptTurn[] {
  const lines = transcript.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const turns: TranscriptTurn[] = [];

  for (const line of lines) {
    const match = line.match(LINE_PATTERN);
    if (match) {
      const [, label, text] = match;
      const speaker = classifySpeaker(label);
      if (speaker !== null && text) {
        turns.push({ speaker, text });
        continue;
      }
    }
    if (turns.length > 0) {
      turns[turns.length - 1].text += ` ${line}`;
    } else {
      turns.push({ speaker: "unknown", text: line });
    }
  }

  return turns;
}

function classifySpeaker(label: string): TranscriptTurn["speaker"] | null {
  if (AGENT_LABELS.test(label)) return "agent";
  if (CALLER_LABELS.test(label)) return "caller";
  return null;
}
