#!/usr/bin/env node
// Enforces docs/studysheet-milestones.md M7: "First-load JS on landing <
// 120KB gzipped, enforced by a bundle-size check in CI". Run after `next
// build` (npm run build already does this via the "postbuild" hook) — reads
// the manifest Next.js itself produces rather than re-deriving which chunks
// a route loads, so this can never drift out of sync with Next's own
// bundling decisions.
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const NEXT_DIR = path.join(import.meta.dirname, '..', '.next');
const MANIFEST_PATH = path.join(NEXT_DIR, 'app-build-manifest.json');
const LANDING_ROUTE = '/(app)/page';
const BUDGET_BYTES = 120 * 1024;

if (!existsSync(MANIFEST_PATH)) {
  console.error(`Bundle-size check: ${MANIFEST_PATH} not found — run \`npm run build\` first.`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const files = manifest.pages[LANDING_ROUTE];

if (!files) {
  console.error(`Bundle-size check: no manifest entry for ${LANDING_ROUTE}.`);
  process.exit(1);
}

let totalGzipBytes = 0;
for (const file of files) {
  if (!file.endsWith('.js')) continue; // CSS doesn't count against "First Load JS"
  const filePath = path.join(NEXT_DIR, file);
  const raw = readFileSync(filePath);
  totalGzipBytes += gzipSync(raw).length;
}

const totalKb = (totalGzipBytes / 1024).toFixed(1);
const budgetKb = (BUDGET_BYTES / 1024).toFixed(0);

if (totalGzipBytes > BUDGET_BYTES) {
  console.error(`Bundle-size check FAILED: landing page is ${totalKb}KB gzipped (budget: ${budgetKb}KB).`);
  process.exit(1);
}

console.log(`Bundle-size check passed: landing page is ${totalKb}KB gzipped (budget: ${budgetKb}KB).`);
