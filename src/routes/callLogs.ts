import { Router } from "express";
import { asyncHandler } from "./asyncHandler";
import { ghlClient } from "../services/ghlClient";
import { insertCallLog, listCallLogsForAgent } from "../db/callLogs";
import { analyzeUnprocessedCallLogs, getRecurringIssues } from "../modules/analyze";
import { listIssuesForAgent } from "../db/issues";

export const callLogsRouter = Router({ mergeParams: true });

/** Pulls real calls from the Call Logs API and caches them locally, tagged source: "real". */
callLogsRouter.post(
  "/sync",
  asyncHandler(async (req, res) => {
    const agentId = req.params.agentId;
    const { callLogs } = await ghlClient.listCallLogs({ agentId });
    for (const call of callLogs) {
      insertCallLog({
        id: call.id,
        agentId: call.agentId,
        transcript: call.transcript,
        summary: call.summary ?? null,
        source: "real",
        durationSec: call.duration,
        createdAt: call.createdAt,
      });
    }
    res.json({ pulled: callLogs.length });
  })
);

callLogsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(listCallLogsForAgent(req.params.agentId));
  })
);

/** Runs the Analyze Past Performance loop against every not-yet-analyzed call log. */
callLogsRouter.post(
  "/analyze",
  asyncHandler(async (req, res) => {
    res.json(await analyzeUnprocessedCallLogs(req.params.agentId));
  })
);

callLogsRouter.get(
  "/issues",
  asyncHandler(async (req, res) => {
    res.json({
      aggregates: getRecurringIssues(req.params.agentId),
      issues: listIssuesForAgent(req.params.agentId),
    });
  })
);
