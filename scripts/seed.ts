import dotenv from "dotenv";
dotenv.config();

import "../src/db";
import { runSeed, QuotaExhaustedError } from "../src/modules/seed";

async function main() {
  const agentId = process.env.SEED_AGENT_ID;
  const happyPathCountRaw = process.env.SEED_SYNTHETIC_COUNT;
  const happyPathCount = happyPathCountRaw === undefined ? undefined : Number(happyPathCountRaw);
  const skipSynthetic = happyPathCountRaw === "0";

  if (skipSynthetic) {
    console.log("SEED_SYNTHETIC_COUNT=0 — skipping synthetic backfill entirely (agent + real calls only).");
  }

  const result = await runSeed({ agentId, happyPathCount, skipSynthetic, log: (msg) => console.log(msg) });

  if (result.skipped) {
    console.log(`${result.skipped} Create one in the HighLevel UI first, then re-run.`);
    return;
  }

  if (skipSynthetic) {
    console.log("Seed complete.");
    return;
  }

  console.log(`Inserted ${result.syntheticInserted} synthetic call log(s), tagged source: "synthetic".`);
  console.log("Seed complete. Analyze / test-gen / recommend can now be run via the API or dashboard.");
}

main().catch((err) => {
  if (err instanceof QuotaExhaustedError) {
    console.error("\nLLM quota/rate limit hit — synthetic backfill stopped partway through.");
    console.error(err.message);
    console.error(
      "Agent sync already succeeded. Whatever transcripts were inserted before the limit hit are still usable; " +
        "fix LLM credits (Gemini/Anthropic) and re-run to fill in the rest."
    );
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
