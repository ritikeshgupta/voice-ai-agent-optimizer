import { Router } from "express";
import { asyncHandler } from "./asyncHandler";
import { generateTestCases } from "../modules/testgen";
import { recordRealCallTest, runSimulatedTest } from "../modules/simulate";
import { listTestCasesForAgent } from "../db/testCases";
import { listTestRunsForCase } from "../db/testRuns";
import { listIssuesForAgent } from "../db/issues";

/** Mounted at /api/agents/:agentId/test-cases */
export const testCasesRouter = Router({ mergeParams: true });

testCasesRouter.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const count = typeof req.body?.count === "number" ? req.body.count : 8;
    const generated = await generateTestCases(req.params.agentId, count);
    res.json({ generated });
  })
);

testCasesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const cases = listTestCasesForAgent(req.params.agentId);
    const categoryById = new Map(listIssuesForAgent(req.params.agentId).map((i) => [i.id, i.category]));
    res.json(
      cases.map((tc) => ({
        ...tc,
        runs: listTestRunsForCase(tc.id),
        sourceCategories: [...new Set(tc.sourceIssueIds.map((id) => categoryById.get(id)).filter(Boolean))],
      }))
    );
  })
);

/** Mounted at /api/test-cases -- test case ids are globally unique, no agent scoping needed. */
export const testCaseActionsRouter = Router();

testCaseActionsRouter.post(
  "/:testCaseId/run",
  asyncHandler(async (req, res) => {
    res.json(await runSimulatedTest(req.params.testCaseId));
  })
);

testCaseActionsRouter.post(
  "/:testCaseId/record-real-call",
  asyncHandler(async (req, res) => {
    const transcript = req.body?.transcript;
    if (typeof transcript !== "string" || !transcript.trim()) {
      res.status(400).json({ error: "transcript (string) is required in the request body" });
      return;
    }
    res.json(await recordRealCallTest(req.params.testCaseId, transcript));
  })
);
