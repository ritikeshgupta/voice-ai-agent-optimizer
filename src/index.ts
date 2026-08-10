import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

import fs from "node:fs";
import express, { type NextFunction, type Request, type Response } from "express";
import { db } from "./db"; // applies schema.sql on first import
import { apiRouter } from "./routes";
import { QuotaExhaustedError } from "./services/llm";
import { listStoredAgents } from "./db/agents";

/**
 * Hosts without a persistent disk (e.g. Render's free tier) can lose the SQLite file on any
 * cold start. Rather than require a paid disk or a Postgres migration for what's still an MVP
 * (see README's Team-of-One notes), self-heal by replaying a static, pre-generated snapshot
 * (`src/db/seed-data.sql`, committed to the repo) if the DB comes up with no cached agents.
 * This is deliberately NOT a live re-run of `npm run seed` -- no GHL/LLM calls at boot means
 * the dashboard repopulates instantly and deterministically instead of depending on API quota
 * during a demo. Regenerate the snapshot manually (see README) after a real seed run whenever
 * the baked-in dataset needs refreshing.
 */
function loadStaticSeedIfEmpty(): void {
  if (listStoredAgents().length > 0) return;
  const seedPath = path.join(__dirname, "db", "seed-data.sql");
  if (!fs.existsSync(seedPath)) {
    console.log("[autoseed] No agents cached and no seed-data.sql found -- dashboard will stay empty.");
    return;
  }
  console.log("[autoseed] No agents cached -- loading the baked-in demo snapshot...");
  try {
    db.exec(fs.readFileSync(seedPath, "utf-8"));
    console.log("[autoseed] Snapshot loaded.");
  } catch (err) {
    console.error("[autoseed] Failed to load snapshot -- dashboard will stay empty until a manual seed.", err);
  }
}

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use("/api", apiRouter);

// Completes the Marketplace app install handshake. GHL redirects here with
// ?code=... after the user approves the install; the resulting access token is
// discarded -- all real API calls in this app use GHL_PIT, not this OAuth token.
app.get("/oauth/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : null;
  if (!code) {
    res.status(400).send("Missing ?code from HighLevel install redirect.");
    return;
  }

  try {
    const tokenRes = await fetch(`${process.env.GHL_API_DOMAIN || "https://services.leadconnectorhq.com"}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GHL_OAUTH_CLIENT_ID || "",
        client_secret: process.env.GHL_OAUTH_CLIENT_SECRET || "",
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.GHL_OAUTH_REDIRECT_URI || "",
      }),
    });
    const body = await tokenRes.text();
    console.log(`[oauth] token exchange -> ${tokenRes.status}: ${body.slice(0, 200)}`);
  } catch (err) {
    console.error("[oauth] token exchange failed", err);
  }

  res.send("<html><body style=\"font-family: sans-serif; padding: 2rem;\">App installed. You can close this tab and go back to HighLevel.</body></html>");
});

const uiDist = path.join(__dirname, "ui", "dist");
app.use(express.static(uiDist));

app.get(/.*/, (req, res) => {
  if (req.path.startsWith("/api")) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.sendFile(path.join(uiDist, "index.html"));
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  if (err instanceof QuotaExhaustedError) {
    res.status(429).json({
      error: err.message,
      code: err.code,
      details: err.details ?? null,
    });
    return;
  }
  res.status(500).json({ error: err.message });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`Voice AI Agent Optimizer listening on port ${port}`);
  loadStaticSeedIfEmpty();
});
