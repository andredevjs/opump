/**
 * Scheduled indexer function — runs every 1 minute (production only).
 * Delegates to shared indexer-core logic.
 */

import type { Config } from "@netlify/functions";
import { runIndexer } from "./_shared/indexer-core.mts";

export default async () => {
  await runIndexer(2);
};

export const config: Config = {
  schedule: "* * * * *",
};
