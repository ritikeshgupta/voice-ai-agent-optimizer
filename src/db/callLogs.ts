import { db } from "./index";

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

interface CallLogRow {
  id: string;
  agent_id: string;
  transcript: string;
  summary: string | null;
  source: CallLogSource;
  duration_sec: number | null;
  created_at: string;
}

const insertStmt = db.prepare(`
  INSERT INTO call_logs (id, agent_id, transcript, summary, source, duration_sec, created_at)
  VALUES (@id, @agentId, @transcript, @summary, @source, @durationSec, @createdAt)
  ON CONFLICT(id) DO NOTHING
`);

export function insertCallLog(record: CallLogRecord): void {
  insertStmt.run({ ...record });
}

const listByAgentStmt = db.prepare(`
  SELECT * FROM call_logs WHERE agent_id = ? ORDER BY created_at DESC
`);

export function listCallLogsForAgent(agentId: string): CallLogRecord[] {
  return (listByAgentStmt.all(agentId) as unknown as CallLogRow[]).map(rowToRecord);
}

const getStmt = db.prepare(`SELECT * FROM call_logs WHERE id = ?`);

export function getCallLog(id: string): CallLogRecord | null {
  const row = getStmt.get(id) as CallLogRow | undefined;
  return row ? rowToRecord(row) : null;
}

const unanalyzedStmt = db.prepare(`
  SELECT cl.* FROM call_logs cl
  WHERE cl.agent_id = ?
    AND NOT EXISTS (SELECT 1 FROM issues i WHERE i.call_log_id = cl.id)
  ORDER BY cl.created_at DESC
`);

/** Call logs for this agent that have never been run through the analyze loop. */
export function listUnanalyzedCallLogs(agentId: string): CallLogRecord[] {
  return (unanalyzedStmt.all(agentId) as unknown as CallLogRow[]).map(rowToRecord);
}

const deleteSyntheticIssuesStmt = db.prepare(`
  DELETE FROM issues WHERE call_log_id IN (
    SELECT id FROM call_logs WHERE agent_id = ? AND source = 'synthetic'
  )
`);
const deleteSyntheticCallLogsStmt = db.prepare(`
  DELETE FROM call_logs WHERE agent_id = ? AND source = 'synthetic'
`);

/**
 * Clears previously-generated synthetic call logs (and their issues -- no ON DELETE CASCADE on
 * that FK, so issues must go first) for an agent. Real call logs are untouched. Re-seeding
 * without this would just pile new synthetic transcripts on top of old ones from a prior run.
 */
export function clearSyntheticCallLogs(agentId: string): number {
  deleteSyntheticIssuesStmt.run(agentId);
  const result = deleteSyntheticCallLogsStmt.run(agentId);
  return Number(result.changes);
}

function rowToRecord(row: CallLogRow): CallLogRecord {
  return {
    id: row.id,
    agentId: row.agent_id,
    transcript: row.transcript,
    summary: row.summary,
    source: row.source,
    durationSec: row.duration_sec,
    createdAt: row.created_at,
  };
}
