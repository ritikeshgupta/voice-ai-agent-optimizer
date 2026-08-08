import { Router } from "express";
import { asyncHandler } from "./asyncHandler";
import { ghlClient } from "../services/ghlClient";
import { getAgent, listStoredAgents, upsertAgent } from "../db/agents";

export const agentsRouter = Router();

agentsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(listStoredAgents());
  })
);

/** Pulls the location's agents from the real Voice AI Agents API into the local cache. */
agentsRouter.post(
  "/sync",
  asyncHandler(async (_req, res) => {
    const agents = await ghlClient.listAgents();
    for (const agent of agents) upsertAgent(agent);
    res.json(listStoredAgents());
  })
);

agentsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const agent = getAgent(req.params.id);
    if (!agent) {
      res.status(404).json({ error: "Agent not cached locally -- POST /api/agents/sync first" });
      return;
    }
    res.json(agent);
  })
);
