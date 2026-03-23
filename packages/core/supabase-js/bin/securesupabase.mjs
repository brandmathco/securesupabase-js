#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { syncEdgeFunctions } from '../scripts/lib/sync-edge-functions-lib.mjs';

function helpAndExit(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error(`securesupabase CLI

Usage:
  securesupabase init [--project-dir <path>] [--functions-dir <path>] [--source-file <path>]
  securesupabase sync [--project-dir <path>] [--functions-dir <path>] [--source-file <path>]

Examples:
  securesupabase init
  securesupabase init --project-dir "/path/to/app"
  securesupabase init --functions-dir "/path/to/app/supabase/functions"
`);
  process.exit(1);
}

function parseArgs(argv) {
  const [command = '', ...rest] = argv;
  const opts = {
    command,
    projectDir: '',
    functionsDir: '',
    sourceFile: '',
  };

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--project-dir') {
      opts.projectDir = rest[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (arg === '--functions-dir') {
      opts.functionsDir = rest[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (arg === '--source-file') {
      opts.sourceFile = rest[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      helpAndExit();
    }
  }
  return opts;
}

function resolveFunctionsDir({ projectDir, functionsDir }) {
  if (functionsDir) return path.resolve(functionsDir);
  if (projectDir) return path.resolve(projectDir, 'supabase/functions');
  return path.resolve(process.cwd(), 'supabase/functions');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.command) helpAndExit('missing command');
  if (!['init', 'sync'].includes(opts.command)) helpAndExit(`unsupported command: ${opts.command}`);

  const thisFile = fileURLToPath(import.meta.url);
  const packageDir = path.resolve(path.dirname(thisFile), '..');
  const sourceFile = opts.sourceFile ? path.resolve(opts.sourceFile) : path.resolve(packageDir, 'dist/index.mjs');
  const functionsDir = resolveFunctionsDir(opts);

  const result = await syncEdgeFunctions({ functionsDir, sourceFile });
  console.log(`securesupabase ${opts.command} complete`);
  console.log(`  source: ${result.source}`);
  console.log(`  vendor: ${result.vendor}`);
  console.log(`  bridge: ${result.bridge}`);
  console.log(`  deno.json: ${result.denoJson}`);
}

await main();
