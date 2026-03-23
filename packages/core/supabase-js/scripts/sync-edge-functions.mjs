#!/usr/bin/env node

import { stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { syncEdgeFunctions } from './lib/sync-edge-functions-lib.mjs';

function parseArgs(argv) {
  const out = {
    functionsDir: '',
    sourceFile: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--functions-dir') {
      out.functionsDir = argv[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (arg === '--source-file') {
      out.sourceFile = argv[i + 1] ?? '';
      i += 1;
    }
  }
  return out;
}

function helpAndExit(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error(`Usage:
  npm run sync:edge-functions -- --functions-dir "/absolute/path/to/supabase/functions"

Optional:
  --source-file "/absolute/path/to/custom/index.mjs"

This command copies securesupabase-js dist index to:
  <functions-dir>/_shared/vendor/securesupabase/index.mjs
and writes:
  <functions-dir>/_shared/securesupabase.ts
`);
  process.exit(1);
}

async function ensureFileExists(filePath, label) {
  try {
    const s = await stat(filePath);
    if (!s.isFile()) {
      helpAndExit(`${label} is not a file: ${filePath}`);
    }
  } catch {
    helpAndExit(`${label} not found: ${filePath}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.functionsDir) {
    helpAndExit('--functions-dir is required');
  }

  const thisFile = fileURLToPath(import.meta.url);
  const packageDir = path.resolve(path.dirname(thisFile), '..');

  const sourceFile = args.sourceFile
    ? path.resolve(args.sourceFile)
    : path.resolve(packageDir, 'dist/index.mjs');

  const functionsDir = path.resolve(args.functionsDir);
  await ensureFileExists(sourceFile, 'source file');
  const out = await syncEdgeFunctions({ functionsDir, sourceFile });

  console.log('Synced secure Supabase SDK for edge functions:');
  console.log(`  source: ${out.source}`);
  console.log(`  vendor: ${out.vendor}`);
  console.log(`  bridge: ${out.bridge}`);
  console.log(`  deno.json: ${out.denoJson}`);
}

await main();
