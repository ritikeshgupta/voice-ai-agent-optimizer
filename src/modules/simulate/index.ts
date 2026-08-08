import { getAgent } from "../../db/agents";
import { getTestCase } from "../../db/testCases";
import { insertTestRun, type TestRunMode } from "../../db/testRuns";
import { summarizeActions } from "../../util/agentActions";
import { simulateConversation } from "./converse";
import { judgeTranscript } from "./judge";

async function scoreAndStore(testCaseId: string, mode: TestRunMode, transcript: string) {
  const testCase = getTestCase(testCaseId);
  if (!testCase) {
    throw new Error(`Test case ${testCaseId} not found`);
  }
  const criteriaResults = await judgeTranscript(transcript, testCase.successCriteria);
  const passed = criteriaResults.every((r) => r.passed);
  insertTestRun({ testCaseId, mode, transcript, criteriaResults, passed });
  return { passed, criteriaResults, transcript };
}

/** Automated path: an LLM plays the caller against a second LLM playing the real agent prompt. */
export async function runSimulatedTest(testCaseId: string) {
  const testCase = getTestCase(testCaseId);
  if (!testCase) {
    throw new Error(`Test case ${testCaseId} not found`);
  }
  const agent = getAgent(testCase.agentId);
  if (!agent) {
    throw new Error(`Agent ${testCase.agentId} not cached locally`);
  }

  const { transcript } = await simulateConversation({
    agentPrompt: agent.agentPrompt,
    actionsSummary: summarizeActions(agent.actions),
    personaPrompt: testCase.personaPrompt,
  });

  return scoreAndStore(testCaseId, "simulated", transcript);
}

/**
 * Real-call path: caller places (or triggers) an actual trial call through the sandbox using the
 * test case's persona as a script, the resulting transcript is pulled via the Call Logs API, and
 * scored through the exact same judge as the simulated path -- one scoring code path, two sources
 * of transcript.
 */
export async function recordRealCallTest(testCaseId: string, transcript: string) {
  return scoreAndStore(testCaseId, "real_call", transcript);
}
