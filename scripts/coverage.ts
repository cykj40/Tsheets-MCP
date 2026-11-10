#!/usr/bin/env tsx
/**
 * W1 coverage report CLI.
 *
 * Usage: npm run coverage -- --start YYYY-MM-DD --end YYYY-MM-DD [--match <regex>] [--min-chars N]
 *
 * --match filters by (root) job name after rollup, case-insensitive, e.g. --match MMC
 * --min-chars N is the `thin` threshold in note characters per job-day (default 40).
 * Calls the same logic as the `coverage_report` MCP tool (src/coverage/run.ts).
 *
 * Exit code: 0 = complete, 1 = incomplete or error, 2 = bad usage/config.
 * It sets process.exitCode and returns instead of calling process.exit(): on Windows,
 * process.exit() right after async network work can tear down libuv handles that are
 * still closing and abort with "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)".
 */

import dotenv from 'dotenv';
import { TokenManager } from '../src/auth/token-manager.js';
import { TSheetsClient } from '../src/api/tsheets-client.js';
import { runCoverageReport } from '../src/coverage/run.js';
import { formatCoverageText, THIN_NOTE_CHARS } from '../src/coverage/coverage.js';

dotenv.config();

const USAGE =
  'Usage: npm run coverage -- --start YYYY-MM-DD --end YYYY-MM-DD [--match <regex>] [--min-chars N]';

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const start = argValue(args, '--start');
  const end = argValue(args, '--end');
  const matchArg = argValue(args, '--match');
  const minCharsArg = argValue(args, '--min-chars');
  if (
    !start ||
    !end ||
    (args.includes('--match') && !matchArg) ||
    (args.includes('--min-chars') && !minCharsArg)
  ) {
    console.error(USAGE);
    process.exitCode = 2;
    return;
  }

  let minChars = THIN_NOTE_CHARS;
  if (minCharsArg !== undefined) {
    if (!/^\d+$/.test(minCharsArg) || Number(minCharsArg) < 1) {
      console.error(`--min-chars must be a whole number >= 1 (got "${minCharsArg}")`);
      process.exitCode = 2;
      return;
    }
    minChars = Number(minCharsArg);
  }

  let match: RegExp | undefined;
  if (matchArg) {
    try {
      match = new RegExp(matchArg, 'i');
    } catch (e) {
      console.error(`Invalid --match regex "${matchArg}": ${e instanceof Error ? e.message : String(e)}`);
      process.exitCode = 2;
      return;
    }
  }

  const missing = [
    'TSHEETS_CLIENT_ID',
    'TSHEETS_CLIENT_SECRET',
    'TSHEETS_REDIRECT_URI',
    'TOKEN_FILE_PATH',
  ].filter(name => !process.env[name]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exitCode = 2;
    return;
  }

  const tokenManager = new TokenManager(process.env.TOKEN_FILE_PATH!);
  const client = new TSheetsClient(tokenManager, {
    clientId: process.env.TSHEETS_CLIENT_ID!,
    clientSecret: process.env.TSHEETS_CLIENT_SECRET!,
    redirectUri: process.env.TSHEETS_REDIRECT_URI!,
  });
  await client.initialize();

  const result = await runCoverageReport(client, { start_date: start, end_date: end }, { match, minChars });
  console.log(formatCoverageText(result));
  process.exitCode = result.complete ? 0 : 1;
}

main().catch(error => {
  console.error(`coverage failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
