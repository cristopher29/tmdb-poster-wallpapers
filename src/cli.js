#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { loadEnv } from "./env.js";
import { generateWallpaper } from "./generator.js";

loadEnv();

const COMMANDS = new Set(["generate", "batch"]);

const optionSchema = {
  config: { type: "string" },
  output: { type: "string" },
  outputDir: { type: "string" },
  cache: { type: "string" },
  cacheDir: { type: "string" },
  noCache: { type: "boolean" },
  "no-cache": { type: "boolean" },
  genre: { type: "string" },
  media: { type: "string" },
  layout: { type: "string" },
  width: { type: "string" },
  height: { type: "string" },
  posterWidth: { type: "string" },
  gapX: { type: "string" },
  gapY: { type: "string" },
  marginX: { type: "string" },
  marginY: { type: "string" },
  radius: { type: "string" },
  rotation: { type: "string" },
  background: { type: "string" },
  gradientAngle: { type: "string" },
  startColor: { type: "string" },
  startAlpha: { type: "string" },
  endColor: { type: "string" },
  endAlpha: { type: "string" },
  gradientStartColor: { type: "string" },
  gradientStartAlpha: { type: "string" },
  gradientEndColor: { type: "string" },
  gradientEndAlpha: { type: "string" },
  language: { type: "string" },
  originalLanguage: { type: "string" },
  posterLanguage: { type: "string" },
  includeImageLanguage: { type: "string" },
  sortBy: { type: "string" },
  releaseDateGte: { type: "string" },
  releaseDateLte: { type: "string" },
  firstAirDateGte: { type: "string" },
  firstAirDateLte: { type: "string" },
  pages: { type: "string" },
  minPosters: { type: "string" },
  maxPosters: { type: "string" },
  imageSize: { type: "string" },
  watchProvider: { type: "string" },
  watchRegion: { type: "string" },
  watchMonetizationTypes: { type: "string" },
  useImageEndpoint: { type: "boolean" },
  includeAdult: { type: "boolean" },
  failFast: { type: "boolean" },
  help: { type: "boolean", short: "h" }
};

async function main() {
  const args = parseArgs({
    options: optionSchema,
    allowPositionals: true
  });

  const command = args.positionals[0] ?? "generate";
  if (args.values.help || !COMMANDS.has(command)) {
    printHelp();
    process.exit(command && !COMMANDS.has(command) ? 1 : 0);
  }

  if (command === "batch") {
    await runBatch(args.values.config ?? "config/weekly.json", { failFast: Boolean(args.values.failFast) });
    return;
  }

  const metadata = await generateWallpaper(args.values);
  console.log(`Generated ${metadata.outputPath}`);
}

async function runBatch(configPath, { failFast = false } = {}) {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const defaults = config.defaults ?? {};
  const jobs = config.jobs ?? [];

  if (jobs.length === 0) {
    throw new Error(`No jobs found in ${configPath}.`);
  }

  const failures = [];
  for (const job of jobs) {
    try {
      const metadata = await generateWallpaper({
        ...defaults,
        ...job
      });
      console.log(`Generated ${metadata.outputPath}`);
    } catch (error) {
      const label = job.output ?? [job.media ?? defaults.media, job.genre ?? defaults.genre, job.watchProvider].filter(Boolean).join("/");
      failures.push({ label, error });
      console.error(`Failed ${label}: ${error.message}`);

      if (failFast) {
        throw error;
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`${failures.length} wallpaper job(s) failed.`);
  }
}

function printHelp() {
  console.log(`Usage:
  npm run generate -- --genre drama --media tv --originalLanguage ko --layout masonry
  npm run generate:weekly

Main options:
  --genre action|animation|comedy|drama|horror|romance|science-fiction|thriller|mystery|28
  --media movie|tv|mixed
  --layout equal|masonry
  --gapX 22 --gapY 22
  --posterWidth 185
  --radius 12 --rotation 45
  --startColor #000000 --startAlpha 0.5 --endColor #e50914 --endAlpha 0.2 --gradientAngle 0
  --originalLanguage ko
  --watchProvider 8 --watchRegion ES
  --maxPosters 50
  --cacheDir .cache --no-cache
  --sortBy popularity.desc
  --useImageEndpoint --posterLanguage es --includeImageLanguage es,null

Note:
  --rotation rotates the whole poster layer, not each poster.
`);
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exit(1);
});
