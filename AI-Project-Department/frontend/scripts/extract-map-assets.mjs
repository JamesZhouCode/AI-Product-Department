#!/usr/bin/env node
// Cross-platform orchestrator for cutting offline basemap archives.
// Replaces extract-map-assets.sh so Windows (cmd/pnpm) no longer needs bash/WSL.
//
// What it does (once, on a networked build machine; the runtime map only reads
// files under public/map):
//   1. public/map/china-overview.pmtiles   nationwide overview, z0-z10
//   2. public/map/shanghai-detail.pmtiles  Shanghai detail, z9-z15
//   3. verifies both archives
//
// Usage:
//   pnpm extract:map              # full run
//   pnpm extract:map -- --dry-run # print the plan without downloading
//
// Environment:
//   PROTOMAPS_BUILD_DATE=YYYYMMDD  pin a build date. Protomaps keeps only the
//                                  last few days of builds; if the download 404s,
//                                  pick any available date from https://build.protomaps.com/
//   PMTILES_BIN=/path/to/pmtiles   prefer the pmtiles CLI (ranged downloads, much faster).
//                                  Falls back to the bundled Node extractor otherwise.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(rootDir);

const args = Object.fromEntries(process.argv.slice(2).map((item) => {
  const [key, ...rest] = item.replace(/^--/, '').split('=');
  return [key, rest.join('=') || true];
}));

// Protomaps only keeps the most recent builds; refresh this default when it expires.
const BUILD_DATE = process.env.PROTOMAPS_BUILD_DATE || '20260920';
const SOURCE = `https://build.protomaps.com/${BUILD_DATE}.pmtiles`;
const PMTILES_BIN = process.env.PMTILES_BIN || 'pmtiles';

const CHINA_BBOX = '73,18,135,54';
const SHANGHAI_BBOX = '120.82,30.63,122.15,31.90';
const CHINA_OUTPUT = 'public/map/china-overview.pmtiles';
const SHANGHAI_OUTPUT = 'public/map/shanghai-detail.pmtiles';
const SHANGHAI_LOW = 'public/map/.shanghai-detail-low.pmtiles';
const SHANGHAI_HIGH = 'public/map/.shanghai-detail-high.pmtiles';

function hasPmtilesCli() {
  // pmtiles CLI has no --version flag (version is a subcommand); --help exits 0 on any working install.
  const probe = spawnSync(PMTILES_BIN, ['--help'], { stdio: 'ignore', shell: true });
  return !probe.error && probe.status === 0;
}

function run(label, command, commandArgs, { shell = false } = {}) {
  console.log(`\n> ${label}`);
  let finalArgs = commandArgs;
  if (shell) {
    // Relative paths only, no spaces anywhere, so plain joining is cmd-safe.
    const parts = [command, ...commandArgs];
    if (command.includes(' ') && !command.startsWith('"')) parts[0] = `"${command}"`;
    finalArgs = [];
    command = parts.join(' ');
  }
  const result = spawnSync(command, finalArgs, { stdio: 'inherit', shell });
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? result.error?.code ?? 'unknown'}`);
}

const plan = { rootDir, source: SOURCE, mode: args['dry-run'] ? 'dry-run' : 'full' };
if (hasPmtilesCli()) {
  plan.extractor = `pmtiles CLI (${PMTILES_BIN})`;
  plan.steps = [
    `pmtiles extract ${SOURCE} -> ${CHINA_OUTPUT} (bbox=${CHINA_BBOX}, z0-z10)`,
    `pmtiles extract ${SOURCE} -> ${SHANGHAI_OUTPUT} (bbox=${SHANGHAI_BBOX}, z9-z15)`,
    'node scripts/verify-map-assets.mjs',
  ];
} else {
  plan.extractor = 'bundled Node extractor (scripts/extract-pmtiles.mjs)';
  plan.steps = [
    `extract ${SOURCE} -> ${CHINA_OUTPUT} (bbox=${CHINA_BBOX}, z0-z10)`,
    `extract ${SOURCE} -> ${SHANGHAI_LOW} (bbox=${SHANGHAI_BBOX}, z9-z14)`,
    `extract ${SOURCE} -> ${SHANGHAI_HIGH} (bbox=${SHANGHAI_BBOX}, z15)`,
    `merge ${SHANGHAI_LOW} + ${SHANGHAI_HIGH} -> ${SHANGHAI_OUTPUT}`,
    'node scripts/verify-map-assets.mjs',
  ];
}
console.log(JSON.stringify(plan, null, 2));

if (args['dry-run']) {
  console.log('\nDry run only; nothing was downloaded. Remove --dry-run to extract.');
  process.exit(0);
}

fs.mkdirSync('public/map', { recursive: true });

if (hasPmtilesCli()) {
  run('Extracting nationwide overview (z0-z10) with pmtiles CLI...', PMTILES_BIN,
    ['extract', SOURCE, CHINA_OUTPUT, `--bbox=${CHINA_BBOX}`, '--maxzoom=10', '--download-threads=4'], { shell: true });
  run('Extracting Shanghai detail (z9-z15) with pmtiles CLI...', PMTILES_BIN,
    ['extract', SOURCE, SHANGHAI_OUTPUT, `--bbox=${SHANGHAI_BBOX}`, '--minzoom=9', '--maxzoom=15', '--download-threads=4'], { shell: true });
  run('Verifying archives...', process.execPath, ['scripts/verify-map-assets.mjs']);
  console.log(`\nDone. Verify archives with: ${PMTILES_BIN} verify public/map/*.pmtiles`);
} else {
  console.log('pmtiles CLI not found; using the bundled Node PMTiles extractor.');
  run('Extracting nationwide overview (z0-z10)...', process.execPath,
    ['scripts/extract-pmtiles.mjs', `--source=${SOURCE}`, `--output=${CHINA_OUTPUT}`, `--bbox=${CHINA_BBOX}`, '--minzoom=0', '--maxzoom=10']);
  run('Extracting Shanghai detail, low zooms (z9-z14)...', process.execPath,
    ['scripts/extract-pmtiles.mjs', `--source=${SOURCE}`, `--output=${SHANGHAI_LOW}`, `--bbox=${SHANGHAI_BBOX}`, '--minzoom=9', '--maxzoom=14']);
  run('Extracting Shanghai detail, high zooms (z15)...', process.execPath,
    ['scripts/extract-pmtiles.mjs', `--source=${SOURCE}`, `--output=${SHANGHAI_HIGH}`, `--bbox=${SHANGHAI_BBOX}`, '--minzoom=15', '--maxzoom=15']);
  run('Merging Shanghai detail (z9-z15)...', process.execPath,
    ['scripts/merge-pmtiles.mjs', `--inputs=${SHANGHAI_LOW},${SHANGHAI_HIGH}`, `--output=${SHANGHAI_OUTPUT}`, `--bbox=${SHANGHAI_BBOX}`, '--minzoom=9', '--maxzoom=15']);
  for (const temp of [SHANGHAI_LOW, SHANGHAI_HIGH]) fs.rmSync(temp, { force: true });
  run('Verifying archives...', process.execPath, ['scripts/verify-map-assets.mjs']);
  console.log('\nDone. Verify PMTiles magic with: head -c 2 public/map/*.pmtiles');
}
