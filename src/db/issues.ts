import { db } from "./index";
import type { Issue, IssueCategory, IssueSeverity } from "../types";

interface IssueRow {
  id: number;
  call_log_id: string;
  category: IssueCategory;
  severity: IssueSeverity;
  evidence_quote: string | null;
  explanation: string;
  created_at: string;
}

const insertStmt = db.prepare(`
  INSERT INTO issues (call_log_id, category, severity, evidence_quote, explanation)
  VALUES (@callLogId, @category, @severity, @evidenceQuote, @explanation)
`);

export function insertIssue(issue: {
  callLogId: string;
  category: IssueCategory;
  severity: IssueSeverity;
  evidenceQuote: string | null;
  explanation: string;
}): void {
  insertStmt.run(issue);
}

const listForAgentStmt = db.prepare(`
  SELECT i.* FROM issues i
  JOIN call_logs cl ON cl.id = i.call_log_id
  WHERE cl.agent_id = ?
  ORDER BY i.created_at DESC
`);

export function listIssuesForAgent(agentId: string): Issue[] {
  return (listForAgentStmt.all(agentId) as unknown as IssueRow[]).map(rowToIssue);
}

export interface CategoryAggregate {
  category: IssueCategory;
  count: number;
  callCount: number;
}

const aggregateStmt = db.prepare(`
  SELECT i.category AS category,
         COUNT(*) AS count,
         COUNT(DISTINCT i.call_log_id) AS callCount
  FROM issues i
  JOIN call_logs cl ON cl.id = i.call_log_id
  WHERE cl.agent_id = ?
  GROUP BY i.category
  ORDER BY count DESC
`);

/** Recurring-issue view: how often each category shows up, and across how many distinct calls. */
export function getCategoryAggregates(agentId: string): CategoryAggregate[] {
  return aggregateStmt.all(agentId) as unknown as CategoryAggregate[];
}

const recentByCategoryStmt = db.prepare(`
  SELECT i.id FROM issues i
  JOIN call_logs cl ON cl.id = i.call_log_id
  WHERE cl.agent_id = ? AND i.category = ?
  ORDER BY i.created_at DESC
  LIMIT ?
`);

/** Representative issue ids for a category, used to trace a generated test case back to evidence. */
export function listRecentIssueIdsByCategory(agentId: string, category: IssueCategory, limit = 3): number[] {
  return (recentByCategoryStmt.all(agentId, category, limit) as unknown as { id: number }[]).map((r) => r.id);
}

function rowToIssue(row: IssueRow): Issue {
  return {
    id: row.id,
    callLogId: row.call_log_id,
    category: row.category,
    severity: row.severity,
    evidenceQuote: row.evidence_quote,
    explanation: row.explanation,
    createdAt: row.created_at,
  };
}
