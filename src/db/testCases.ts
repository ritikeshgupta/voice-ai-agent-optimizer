import { db } from "./index";
import type { SuccessCriterion } from "../types";

export type ScenarioType = "happy_path" | "edge_case";

export interface TestCaseRecord {
  id: string;
  agentId: string;
  title: string;
  scenarioType: ScenarioType;
  personaPrompt: string;
  successCriteria: SuccessCriterion[];
  sourceIssueIds: number[];
  createdAt: string;
}

interface TestCaseRow {
  id: string;
  agent_id: string;
  title: string;
  scenario_type: ScenarioType;
  persona_prompt: string;
  success_criteria_json: string;
  source_issue_ids_json: string;
  created_at: string;
}

const insertStmt = db.prepare(`
  INSERT INTO test_cases (id, agent_id, title, scenario_type, persona_prompt, success_criteria_json, source_issue_ids_json)
  VALUES (@id, @agentId, @title, @scenarioType, @personaPrompt, @successCriteriaJson, @sourceIssueIdsJson)
`);

export function insertTestCase(tc: {
  id: string;
  agentId: string;
  title: string;
  scenarioType: ScenarioType;
  personaPrompt: string;
  successCriteria: SuccessCriterion[];
  sourceIssueIds: number[];
}): void {
  insertStmt.run({
    id: tc.id,
    agentId: tc.agentId,
    title: tc.title,
    scenarioType: tc.scenarioType,
    personaPrompt: tc.personaPrompt,
    successCriteriaJson: JSON.stringify(tc.successCriteria),
    sourceIssueIdsJson: JSON.stringify(tc.sourceIssueIds),
  });
}

const listForAgentStmt = db.prepare(`
  SELECT * FROM test_cases WHERE agent_id = ? ORDER BY created_at DESC
`);

export function listTestCasesForAgent(agentId: string): TestCaseRecord[] {
  return (listForAgentStmt.all(agentId) as unknown as TestCaseRow[]).map(rowToRecord);
}

const getStmt = db.prepare(`SELECT * FROM test_cases WHERE id = ?`);

export function getTestCase(id: string): TestCaseRecord | null {
  const row = getStmt.get(id) as TestCaseRow | undefined;
  return row ? rowToRecord(row) : null;
}

function rowToRecord(row: TestCaseRow): TestCaseRecord {
  return {
    id: row.id,
    agentId: row.agent_id,
    title: row.title,
    scenarioType: row.scenario_type,
    personaPrompt: row.persona_prompt,
    successCriteria: JSON.parse(row.success_criteria_json),
    sourceIssueIds: JSON.parse(row.source_issue_ids_json),
    createdAt: row.created_at,
  };
}
