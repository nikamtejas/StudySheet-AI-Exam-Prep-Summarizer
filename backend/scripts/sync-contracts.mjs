#!/usr/bin/env node
// Copies backend/src/contracts/*.ts into frontend/src/contracts/*.ts.
//
// The backend copy is the source of truth (see docs/studysheet-build-prompt.md §6).
// This script is the only thing allowed to write to frontend/src/contracts/ —
// never hand-edit the generated copy.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = join(__dirname, '..', 'src', 'contracts');
const TARGET_DIR = join(__dirname, '..', '..', 'frontend', 'src', 'contracts');

const HEADER = (filename) =>
  `// GENERATED FILE — DO NOT EDIT.\n` +
  `// Source of truth: backend/src/contracts/${filename}\n` +
  `// Regenerate with: npm run sync:contracts (in backend/)\n\n`;

function main() {
  if (!existsSync(SOURCE_DIR)) {
    console.error(`Contracts source directory not found: ${SOURCE_DIR}`);
    process.exit(1);
  }
  mkdirSync(TARGET_DIR, { recursive: true });

  const sourceFiles = readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.ts'));
  const writtenFiles = new Set();

  for (const filename of sourceFiles) {
    const source = readFileSync(join(SOURCE_DIR, filename), 'utf8');
    const output = HEADER(filename) + source;
    writeFileSync(join(TARGET_DIR, filename), output, 'utf8');
    writtenFiles.add(filename);
  }

  // Remove stale generated files whose source no longer exists.
  if (existsSync(TARGET_DIR)) {
    for (const filename of readdirSync(TARGET_DIR)) {
      if (filename.endsWith('.ts') && !writtenFiles.has(filename)) {
        unlinkSync(join(TARGET_DIR, filename));
      }
    }
  }

  console.log(`Synced ${writtenFiles.size} contract file(s) to ${TARGET_DIR}`);
}

main();
