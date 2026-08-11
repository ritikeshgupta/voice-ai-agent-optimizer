import { Router } from "express";
import { asyncHandler } from "./asyncHandler";
import { applyRecommendation, generateRecommendations } from "../modules/recommend";
import { listRecommendationsForAgent, setRecommendationStatus } from "../db/recommendations";

/** Mounted at /api/agents/:agentId/recommendations */
export const recommendationsRouter = Router({ mergeParams: true });

recommendationsRouter.post(
  "/generate",
  asyncHandler(async (req, res) => {
    const generated = await generateRecommendations(req.params.agentId);
    res.json({ generated });
  })
);

recommendationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(listRecommendationsForAgent(req.params.agentId));
  })
);

/** Mounted at /api/recommendations -- recommendation ids are globally unique. */
export const recommendationActionsRouter = Router();

recommendationActionsRouter.post(
  "/:id/apply",
  asyncHandler(async (req, res) => {
    await applyRecommendation(req.params.id);
    res.json({ status: "applied" });
  })
);

recommendationActionsRouter.post(
  "/:id/dismiss",
  asyncHandler(async (req, res) => {
    setRecommendationStatus(req.params.id, "dismissed");
    res.json({ status: "dismissed" });
  })
);
