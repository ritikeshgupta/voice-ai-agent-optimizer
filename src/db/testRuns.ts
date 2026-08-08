import { db } from "./index";
import type { CriterionResult } from "../types";

export type TestRunMode = "simulated" | "real_call";

export interface TestRunRecord {
  id: number;
  testCaseId: string;
  mode: TestRunMode;
  transcript: string;
  criteriaResults: CriterionResult[];
  passed: boolean;
  runAt: string;
}

interface TestRunRow {
  id: number;
  test_case_id: string;
  mode: TestRunMode;
  transcript: string;
  criteria_results_json: string;
  passed: 0 | 1;
  run_at: string;
}

const insertStmt = db.prepare(`
  INSERT INTO test_runs (test_case_id, mode, transcript, criteria_results_json, passed)
  VALUES (@testCaseId, @mode, @transcript, @criteriaResultsJson, @passed)
`);

export function insertTestRun(run: {
  testCaseId: string;
  mode: TestRunMode;
  transcript: string;
  criteriaResults: CriterionResult[];
  passed: boolean;
}): void {
  insertStmt.run({
    testCaseId: run.testCaseId,
    mode: run.mode,
    transcript: run.transcript,
    criteriaResultsJson: JSON.stringify(run.criteriaResults),
    passed: run.passed ? 1 : 0,
  });
}

const latestForCaseStmt = db.prepare(`
  SELECT * FROM test_runs WHERE test_case_id = ? ORDER BY run_at DESC LIMIT 1
`);

export function getLatestTestRun(testCaseId: string): TestRunRecord | null {
  const row = latestForCaseStmt.get(testCaseId) as TestRunRow | undefined;
  return row ? rowToRecord(row) : null;
}

const listForCaseStmt = db.prepare(`
  SELECT * FROM test_runs WHERE test_case_id = ? ORDER BY run_at DESC
`);

export function listTestRunsForCase(testCaseId: string): TestRunRecord[] {
  return (listForCaseStmt.all(testCaseId) as unknown as TestRunRow[]).map(rowToRecord);
}

const failedForAgentStmt = db.prepare(`
  SELECT tr.* FROM test_runs tr
  JOIN test_cases tc ON tc.id = tr.test_case_id
  WHERE tc.agent_id = ? AND tr.passed = 0
  ORDER BY tr.run_at DESC
`);

/** Failed runs feed the recommend loop -- these are the concrete failures to fix. */
export function listFailedTestRunsForAgent(agentId: string): TestRunRecord[] {
  return (failedForAgentStmt.all(agentId) as unknown as TestRunRow[]).map(rowToRecord);
}

function rowToRecord(row: TestRunRow): TestRunRecord {
  return {
    id: row.id,
    testCaseId: row.test_case_id,
    mode: row.mode,
    transcript: row.transcript,
    criteriaResults: JSON.parse(row.criteria_results_json),
    passed: row.passed === 1,
    runAt: row.run_at,
  };
}
