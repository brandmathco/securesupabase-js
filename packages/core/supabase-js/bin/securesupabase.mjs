#!/usr/bin/env node

import { stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { syncEdgeFunctions } from '../scripts/lib/sync-edge-functions-lib.mjs';

function helpAndExit(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error(`securesupabase CLI

Usage:
  securesupabase init [--project-dir <path>] [--functions-dir <path>] [--source-file <path>] [--no-minify] [--link|--no-link]
  securesupabase sync [--project-dir <path>] [--functions-dir <path>] [--source-file <path>] [--no-minify]
  securesupabase functions deploy <name...> [--project-dir <path>] [--supabase-dir <path>]
  securesupabase functions deploy --all [--project-dir <path>] [--supabase-dir <path>]
  securesupabase supabase <args...> [--project-dir <path>] [--supabase-dir <path>]

Examples:
  securesupabase init
  securesupabase init --project-dir "/path/to/app"
  securesupabase init --functions-dir "/path/to/app/supabase/functions"
  securesupabase init --link
  securesupabase init --no-link
  securesupabase functions deploy db-proxy auth-proxy e2ee-public-key
  securesupabase supabase db push --project-dir "/path/to/app"
`);
  process.exit(message ? 1 : 0);
}

function parseArgs(argv) {
  if (argv.length === 0) return { command: '' };
  if (argv[0] === '--help' || argv[0] === '-h') {
    helpAndExit();
  }

  const [command = ''] = argv;
  const hasFunctionsSubcommand = command === 'functions';
  const subcommand = hasFunctionsSubcommand ? (argv[1] ?? '') : '';
  const rest = hasFunctionsSubcommand ? argv.slice(2) : argv.slice(1);
  const opts = {
    command,
    subcommand,
    projectDir: '',
    supabaseDir: '',
    functionsDir: '',
    sourceFile: '',
    minify: true,
    allFunctions: false,
    functionNames: [],
    supabaseArgs: [],
    linkMode: 'auto',
  };

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--project-dir') {
      opts.projectDir = rest[i + 1] ?? '';
      i += 1;
      continue;
    }
    if (arg === '--supabase-dir') {
      opts.supabaseDir = rest[i + 1] ?? '';
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
    if ((arg === '--help' || arg === '-h') && command !== 'supabase') {
      helpAndExit();
    }
    if (arg === '--no-minify') {
      opts.minify = false;
      continue;
    }
    if (arg === '--link') {
      opts.linkMode = 'always';
      continue;
    }
    if (arg === '--no-link') {
      opts.linkMode = 'never';
      continue;
    }
    if (arg === '--all') {
      opts.allFunctions = true;
      continue;
    }
    if (!arg.startsWith('-') && command === 'functions' && subcommand === 'deploy') {
      opts.functionNames.push(arg);
      continue;
    }
    if (command === 'supabase') {
      opts.supabaseArgs.push(arg);
      continue;
    }
    helpAndExit(`unsupported argument: ${arg}`);
  }
  return opts;
}

async function existsAsFile(filePath) {
  try {
    const s = await stat(filePath);
    return s.isFile();
  } catch {
    return false;
  }
}

async function existsAsDirectory(dirPath) {
  try {
    const s = await stat(dirPath);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function resolveFunctionsDir({ projectDir, functionsDir }) {
  if (functionsDir) return path.resolve(functionsDir);

  if (projectDir) {
    const projectPath = path.resolve(projectDir);
    const directFunctions = path.resolve(projectPath, 'functions');
    if (await existsAsDirectory(directFunctions)) return directFunctions;
    return path.resolve(projectPath, 'supabase/functions');
  }

  const cwd = process.cwd();
  const directFunctions = path.resolve(cwd, 'functions');
  if (await existsAsDirectory(directFunctions)) return directFunctions;
  return path.resolve(cwd, 'supabase/functions');
}

async function resolveSupabaseDir({ projectDir, supabaseDir, functionsDir }) {
  const candidates = [];
  const seen = new Set();
  const pushCandidate = (dirPath) => {
    const resolved = path.resolve(dirPath);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    candidates.push(resolved);
  };

  if (supabaseDir) {
    pushCandidate(supabaseDir);
  }

  if (projectDir) {
    const projectPath = path.resolve(projectDir);
    pushCandidate(projectPath);
    pushCandidate(path.resolve(projectPath, 'supabase'));
  }

  if (functionsDir) {
    const functionsPath = path.resolve(functionsDir);
    const parentDir = path.resolve(functionsPath, '..');
    pushCandidate(parentDir);
    pushCandidate(path.resolve(parentDir, 'supabase'));
  }

  const cwd = process.cwd();
  pushCandidate(cwd);
  pushCandidate(path.resolve(cwd, 'supabase'));

  for (const candidate of candidates) {
    if (await existsAsFile(path.resolve(candidate, 'config.toml'))) return candidate;
  }

  if (supabaseDir) return path.resolve(supabaseDir);
  if (projectDir) return path.resolve(projectDir, 'supabase');
  if (functionsDir) return path.resolve(functionsDir, '..');
  return path.resolve(cwd, 'supabase');
}

async function runSupabaseCli({ cwd, args, label }) {
  await new Promise((resolve, reject) => {
    const child = spawn('supabase', args, {
      cwd,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed with exit code ${code ?? 'unknown'}`));
    });
  });
}

async function runSupabaseDeploy(supabaseDir, functionName) {
  await runSupabaseCli({
    cwd: supabaseDir,
    args: ['functions', 'deploy', functionName],
    label: `supabase functions deploy ${functionName}`,
  });
}

async function runFunctionsDeploy(opts) {
  if (opts.subcommand !== 'deploy') {
    helpAndExit(`unsupported functions command: ${opts.subcommand || '(missing)'}`);
  }

  const functionNames = opts.allFunctions
    ? ['db-proxy', 'auth-proxy', 'e2ee-public-key']
    : opts.functionNames;

  if (functionNames.length === 0) {
    helpAndExit('functions deploy requires at least one function name or --all');
  }

  const supabaseDir = await resolveSupabaseDir(opts);
  if (!(await existsAsFile(path.resolve(supabaseDir, 'config.toml')))) {
    helpAndExit(`could not find Supabase project config.toml in: ${supabaseDir}`);
  }

  console.log(`securesupabase functions deploy`);
  console.log(`  supabase dir: ${supabaseDir}`);
  console.log(`  functions: ${functionNames.join(', ')}`);

  for (const functionName of functionNames) {
    console.log(`\nDeploying ${functionName}...`);
    await runSupabaseDeploy(supabaseDir, functionName);
  }

  console.log('\nsecuresupabase functions deploy complete');
}

async function runSupabaseCommand(opts) {
  if (opts.supabaseArgs.length === 0) {
    helpAndExit('supabase command requires arguments, e.g. "securesupabase supabase db push"');
  }

  const cwd = opts.projectDir || opts.supabaseDir ? await resolveSupabaseDir(opts) : process.cwd();
  console.log('securesupabase supabase passthrough');
  console.log(`  cwd: ${cwd}`);
  console.log(`  command: supabase ${opts.supabaseArgs.join(' ')}`);

  await runSupabaseCli({
    cwd,
    args: opts.supabaseArgs,
    label: `supabase ${opts.supabaseArgs.join(' ')}`,
  });
}

async function promptShouldLinkProject() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = (await rl.question('Link a Supabase project now (updates config.toml)? [Y/n] ')).trim().toLowerCase();
    if (!answer) return true;
    return !['n', 'no'].includes(answer);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ABORT_ERR') {
      console.log('\nLink prompt cancelled.');
      return false;
    }
    throw error;
  } finally {
    rl.close();
  }
}

async function promptShouldInitSupabaseConfig(initDir) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = (
      await rl.question(`No Supabase config.toml found. Initialize Supabase in "${initDir}" now? [Y/n] `)
    )
      .trim()
      .toLowerCase();
    if (!answer) return true;
    return !['n', 'no'].includes(answer);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ABORT_ERR') {
      console.log('\nSupabase init prompt cancelled.');
      return false;
    }
    throw error;
  } finally {
    rl.close();
  }
}

async function shouldRunInitLink(opts) {
  if (opts.linkMode === 'never') return false;
  if (opts.linkMode === 'always') return true;

  const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!isInteractive) {
    console.log('Skipping project link prompt (non-interactive terminal).');
    console.log('Run `securesupabase init --link` or `securesupabase supabase link` to link later.');
    return false;
  }

  return promptShouldLinkProject();
}

function inferSupabaseInitDir({ supabaseDir, projectDir, functionsDir }) {
  if (supabaseDir) return path.resolve(supabaseDir);
  if (functionsDir) {
    const resolvedFunctionsDir = path.resolve(functionsDir);
    const functionsBase = path.basename(resolvedFunctionsDir);
    const parentDir = path.dirname(resolvedFunctionsDir);
    const parentBase = path.basename(parentDir);

    // If functions are already in ".../supabase/functions", initialize at project root
    // so Supabase writes ".../supabase/config.toml" (not ".../supabase/supabase/config.toml").
    if (functionsBase === 'functions' && parentBase === 'supabase') {
      return path.dirname(parentDir);
    }

    return parentDir;
  }
  if (projectDir) return path.resolve(projectDir);
  return process.cwd();
}

async function runInitLinkFlow(opts) {
  const shouldLink = await shouldRunInitLink(opts);
  if (!shouldLink) return;

  let supabaseDir = await resolveSupabaseDir(opts);
  if (!(await existsAsFile(path.resolve(supabaseDir, 'config.toml')))) {
    const initDir = inferSupabaseInitDir(opts);
    const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
    if (!isInteractive) {
      console.log('\nSkipping `supabase link`: no existing Supabase `config.toml` found.');
      console.log(`  looked in: ${supabaseDir}`);
      console.log(`Run \`supabase init --workdir "${initDir}"\` and then rerun \`securesupabase init --link\`.`);
      return;
    }

    const shouldInit = await promptShouldInitSupabaseConfig(initDir);
    if (!shouldInit) return;

    console.log(`\nRunning \`supabase init\` in: ${initDir}`);
    await runSupabaseCli({
      cwd: initDir,
      args: ['init'],
      label: 'supabase init',
    });

    supabaseDir = await resolveSupabaseDir({ ...opts, projectDir: initDir });
    if (!(await existsAsFile(path.resolve(supabaseDir, 'config.toml')))) {
      console.log('\nSkipping `supabase link`: config.toml still not found after `supabase init`.');
      console.log(`  looked in: ${supabaseDir}`);
      return;
    }
  }

  console.log(`  using config: ${path.resolve(supabaseDir, 'config.toml')}`);
  console.log('\nStarting `supabase link` so you can choose a project...');
  await runSupabaseCli({
    cwd: supabaseDir,
    args: ['link'],
    label: 'supabase link',
  });
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.command) helpAndExit('missing command');

  if (opts.command === 'functions') {
    await runFunctionsDeploy(opts);
    return;
  }

  if (opts.command === 'supabase') {
    await runSupabaseCommand(opts);
    return;
  }

  if (!['init', 'sync'].includes(opts.command)) helpAndExit(`unsupported command: ${opts.command}`);

  const thisFile = fileURLToPath(import.meta.url);
  const packageDir = path.resolve(path.dirname(thisFile), '..');
  const sourceFile = opts.sourceFile ? path.resolve(opts.sourceFile) : path.resolve(packageDir, 'dist/index.mjs');
  const functionsDir = await resolveFunctionsDir(opts);

  const templatesDir = path.resolve(packageDir, 'templates', 'secure-edge');
  const result = await syncEdgeFunctions({ functionsDir, sourceFile, minify: opts.minify, templatesDir });
  console.log(`securesupabase ${opts.command} complete`);
  console.log(`  source: ${result.source}`);
  console.log(`  vendor: ${result.vendor}`);
  console.log(`  bridge: ${result.bridge}`);
  console.log(`  deno.json: ${result.denoJson}`);
  console.log(`  minified: ${result.minified ? 'yes' : 'no'}`);
  if (!result.minified && result.minifyReason) {
    console.log(`  minify note: ${result.minifyReason}`);
  }
  console.log(`  secure edge scaffolded: ${result.scaffolded ? 'yes' : 'no'}`);
  if (!result.scaffolded && result.scaffoldReason) {
    console.log(`  scaffold note: ${result.scaffoldReason}`);
  }

  if (opts.command === 'init') {
    await runInitLinkFlow({ ...opts, functionsDir });
  }
}

await main();
