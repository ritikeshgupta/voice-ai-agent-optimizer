import { db } from "./index";
import type { RecommendationCategory } from "../types";

export type RecommendationStatus = "suggested" | "applied" | "dismissed";

export interface RecommendationRecord {
  id: string;
  agentId: string;
  category: RecommendationCategory;
  appliesViaApi: boolean;
  beforeValue: string | null;
  afterValue: string;
  reasoning: string;
  evidence: string[];
  status: RecommendationStatus;
  createdAt: string;
}

interface RecommendationRow {
  id: string;
  agent_id: string;
  category: RecommendationCategory;
  applies_via_api: 0 | 1;
  before_value: string | null;
  after_value: string;
  reasoning: string;
  evidence_json: string;
  status: RecommendationStatus;
  created_at: string;
}

const insertStmt = db.prepare(`
  INSERT INTO recommendations (id, agent_id, category, applies_via_api, before_value, after_value, reasoning, evidence_json, status)
  VALUES (@id, @agentId, @category, @appliesViaApi, @beforeValue, @afterValue, @reasoning, @evidenceJson, 'suggested')
`);

export function insertRecommendation(rec: {
  id: string;
  agentId: string;
  category: RecommendationCategory;
  appliesViaApi: boolean;
  beforeValue: string | null;
  afterValue: string;
  reasoning: string;
  evidence: string[];
}): void {
  insertStmt.run({
    id: rec.id,
    agentId: rec.agentId,
    category: rec.category,
    appliesViaApi: rec.appliesViaApi ? 1 : 0,
    beforeValue: rec.beforeValue,
    afterValue: rec.afterValue,
    reasoning: rec.reasoning,
    evidenceJson: JSON.stringify(rec.evidence),
  });
}

const listForAgentStmt = db.prepare(`
  SELECT * FROM recommendations WHERE agent_id = ? AND status != 'dismissed' ORDER BY created_at DESC
`);

export function listRecommendationsForAgent(agentId: string): RecommendationRecord[] {
  return (listForAgentStmt.all(agentId) as unknown as RecommendationRow[]).map(rowToRecord);
}

const getStmt = db.prepare(`SELECT * FROM recommendations WHERE id = ?`);

export function getRecommendation(id: string): RecommendationRecord | null {
  const row = getStmt.get(id) as RecommendationRow | undefined;
  return row ? rowToRecord(row) : null;
}

const updateStatusStmt = db.prepare(`UPDATE recommendations SET status = ? WHERE id = ?`);

export function setRecommendationStatus(id: string, status: RecommendationStatus): void {
  updateStatusStmt.run(status, id);
}

function rowToRecord(row: RecommendationRow): RecommendationRecord {
  return {
    id: row.id,
    agentId: row.agent_id,
    category: row.category,
    appliesViaApi: row.applies_via_api === 1,
    beforeValue: row.before_value,
    afterValue: row.after_value,
    reasoning: row.reasoning,
    evidence: JSON.parse(row.evidence_json),
    status: row.status,
    createdAt: row.created_at,
  };
}
