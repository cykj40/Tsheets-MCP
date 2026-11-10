/**
 * W1 coverage report — loads coverage-exclude.json (the only I/O for exclusions).
 */

import { promises as fs } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { EMPTY_EXCLUDE, parseExcludeConfig, type ExcludeConfig } from './exclude.js';

export const EXCLUDE_FILE_NAME = 'coverage-exclude.json';

// src/coverage or dist/coverage -> project root (same layout as token-manager.ts)
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export interface LoadedExclude {
  config: ExcludeConfig;
  /** File name that was read, or null when no file exists (nothing is excluded). */
  source: string | null;
}

export async function loadExcludeConfig(
  path: string = resolve(PROJECT_ROOT, EXCLUDE_FILE_NAME),
): Promise<LoadedExclude> {
  let text: string;
  try {
    text = await fs.readFile(path, 'utf-8');
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ENOENT') {
      return { config: EMPTY_EXCLUDE, source: null };
    }
    throw new Error(`${EXCLUDE_FILE_NAME}: cannot read (${e instanceof Error ? e.message : String(e)})`);
  }

  try {
    return { config: parseExcludeConfig(JSON.parse(text)), source: EXCLUDE_FILE_NAME };
  } catch (e) {
    // A broken config must fail loudly: silently ignoring it would list non-job time as gaps.
    throw new Error(`${EXCLUDE_FILE_NAME}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
