import { Router } from "express";
import { agentsRouter } from "./agents";
import { callLogsRouter } from "./callLogs";
import { recommendationActionsRouter, recommendationsRouter } from "./recommendations";
import { testCaseActionsRouter, testCasesRouter } from "./testCases";

export const apiRouter = Router();

apiRouter.use("/agents", agentsRouter);
apiRouter.use("/agents/:agentId/call-logs", callLogsRouter);
apiRouter.use("/agents/:agentId/test-cases", testCasesRouter);
apiRouter.use("/agents/:agentId/recommendations", recommendationsRouter);
apiRouter.use("/test-cases", testCaseActionsRouter);
apiRouter.use("/recommendations", recommendationActionsRouter);
