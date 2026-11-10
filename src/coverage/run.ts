/**
 * W1 coverage report — fetch + assemble. Shared by the MCP tool and the CLI.
 *
 * Call order (only what the date range needs; never list all jobcodes/files):
 *   1. timesheets for the range, paginated, supplemental_data=yes
 *      (brings back the users and jobcodes they reference)
 *   2. missing ANCESTOR jobcodes, by ids in batches, walking up parent_id
 *   3. users still missing, by ids in batches
 *   4. files for the ids in attached_files only, by ids in batches
 *
 * Every fetch problem (error after retries, truncated/malformed page, page cap,
 * ancestor/files/users failure) is recorded in `issues` and flips `complete`
 * to false. A partial result is never returned as if it were complete.
 */

import { TSheetsResponseSchema } from '../types/tsheets.js';
import type { Timesheet, User, Jobcode, File } from '../types/tsheets.js';
import {
  buildCoverageReport,
  THIN_NOTE_CHARS,
  type CoverageResult,
  type CoverageInput,
} from './coverage.js';
import { compileExclude } from './exclude.js';
import { loadExcludeConfig, type LoadedExclude } from './exclude-file.js';

/** The subset of TSheetsClient this path needs (lets tests pass a mock). */
export interface CoverageClient {
  getTimesheets(params: {
    start_date?: string;
    end_date?: string;
    page?: number;
    supplemental_data?: 'yes' | 'no';
  }): Promise<any>;
  getJobcodes(params: { ids?: number[]; active?: 'yes' | 'no' | 'both'; page?: number }): Promise<any>;
  getUsers(params: { ids?: number[]; active?: 'yes' | 'no' | 'both'; page?: number }): Promise<any>;
  getFiles(params: { ids?: number[]; page?: number }): Promise<any>;
}

export interface CoverageArgs {
  start_date: string;
  end_date: string;
}

export interface CoverageRunOptions {
  /** One call per request group. Defaults to stderr (stdout belongs to MCP). */
  log?: (message: string) => void;
  /** Exclusions. Default: read coverage-exclude.json from the project root (missing file = none). */
  exclude?: LoadedExclude;
  /** Only job-days whose ROOT job name matches (applied after rollup). */
  match?: RegExp;
  /** `thin` threshold in note characters (default THIN_NOTE_CHARS = 40). */
  minChars?: number;
}

/** Safety cap so a server that always says `more: true` cannot loop forever. */
export const MAX_PAGES = 200;
/** Ids per request. The docs give no limit; 100 keeps the URL short. */
export const ID_BATCH = 100;
/** Max rounds of "fetch missing parents" (hierarchy depth guard). */
export const MAX_ANCESTOR_ROUNDS = 20;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateDateRange(args: CoverageArgs): void {
  for (const [k, v] of Object.entries(args)) {
    if (!DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) {
      throw new Error(`${k} must be a valid YYYY-MM-DD date (got "${v}")`);
    }
  }
  if (args.start_date > args.end_date) {
    throw new Error('start_date must be on or before end_date');
  }
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface PagedResult<T> {
  items: Record<string, T>;
  supplemental: Record<string, any>[];
  requests: number;
  ok: boolean;
}

/**
 * Pull pages until `more` is false. On any failure, records an issue and
 * returns ok=false with whatever was read so far.
 */
async function fetchAllPages<T>(
  label: string,
  fetchPage: (page: number) => Promise<any>,
  pick: (results: Record<string, any>) => Record<string, T> | undefined,
  issues: string[],
): Promise<PagedResult<T>> {
  const items: Record<string, T> = {};
  const supplemental: Record<string, any>[] = [];
  let requests = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    let raw: any;
    requests++;
    try {
      raw = await fetchPage(page);
    } catch (e) {
      issues.push(`${label}: page ${page} failed (${errMsg(e)}). Results are incomplete.`);
      return { items, supplemental, requests, ok: false };
    }

    const parsed = TSheetsResponseSchema.safeParse(raw);
    if (!parsed.success) {
      issues.push(
        `${label}: page ${page} was truncated or malformed (${parsed.error.issues[0]?.path.join('.') || 'body'}: ${parsed.error.issues[0]?.message}). Results are incomplete.`,
      );
      return { items, supplemental, requests, ok: false };
    }

    const pageItems = pick(parsed.data.results as Record<string, any>) ?? {};
    const count = Object.keys(pageItems).length;
    Object.assign(items, pageItems);
    if (parsed.data.supplemental_data) supplemental.push(parsed.data.supplemental_data);

    if (!parsed.data.more) return { items, supplemental, requests, ok: true };

    if (count === 0) {
      issues.push(
        `${label}: page ${page} said more=true but returned no records (truncated). Results are incomplete.`,
      );
      return { items, supplemental, requests, ok: false };
    }
  }

  issues.push(`${label}: stopped after ${MAX_PAGES} pages with more=true still set. Results are incomplete.`);
  return { items, supplemental, requests, ok: false };
}

/** Fetch records by id, ID_BATCH ids per request group, each group fully paginated. */
async function fetchByIds<T>(
  label: string,
  ids: number[],
  fetchPage: (batch: number[], page: number) => Promise<any>,
  pick: (results: Record<string, any>) => Record<string, T> | undefined,
  issues: string[],
): Promise<{ items: Record<string, T>; requests: number; batches: number; ok: boolean }> {
  const items: Record<string, T> = {};
  let requests = 0;
  let batches = 0;
  for (let i = 0; i < ids.length; i += ID_BATCH) {
    const batch = ids.slice(i, i + ID_BATCH);
    batches++;
    const r = await fetchAllPages<T>(label, page => fetchPage(batch, page), pick, issues);
    requests += r.requests;
    Object.assign(items, r.items);
    if (!r.ok) return { items, requests, batches, ok: false };
  }
  return { items, requests, batches, ok: true };
}

/** Jobcode ids on the way from `startId` to the root that are not in `known`. */
function firstMissingOnChain(
  startId: number,
  known: Record<string, Jobcode>,
  unresolvable: Set<number>,
): number | null {
  const seen = new Set<number>();
  let id: number | undefined = startId;
  while (id) {
    if (seen.has(id) || unresolvable.has(id)) return null; // cycle or already given up on
    seen.add(id);
    const jc: Jobcode | undefined = known[String(id)];
    if (!jc) return id;
    id = jc.parent_id || undefined;
  }
  return null;
}

export async function runCoverageReport(
  client: CoverageClient,
  args: CoverageArgs,
  options: CoverageRunOptions = {},
): Promise<CoverageResult> {
  validateDateRange(args);
  const log = options.log ?? ((m: string) => console.error(`[coverage] ${m}`));
  const issues: string[] = [];

  // Load/validate exclusions BEFORE any request, so a broken config fails fast.
  const exclusions = options.exclude ?? (await loadExcludeConfig());
  const exclude = compileExclude(exclusions.config);

  // 1. Timesheets for the range (paginated). supplemental_data brings users + jobcodes along.
  const ts = await fetchAllPages<Timesheet>(
    'timesheets',
    page =>
      client.getTimesheets({
        start_date: args.start_date,
        end_date: args.end_date,
        page,
        supplemental_data: 'yes',
      }),
    r => r.timesheets,
    issues,
  );
  const timesheets = Object.values(ts.items);
  log(
    `timesheets ${args.start_date}..${args.end_date}: ${timesheets.length} entries, ${ts.requests} request(s)${ts.ok ? '' : ' (FAILED)'}`,
  );

  const jobcodes: Record<string, Jobcode> = {};
  const users: Record<string, User> = {};
  for (const s of ts.supplemental) {
    Object.assign(jobcodes, s.jobcodes ?? {});
    Object.assign(users, s.users ?? {});
  }

  // 2. Only the ANCESTOR jobcodes we are missing, by ids, walking up until none are missing.
  const unresolvable = new Set<number>();
  const usedJobcodeIds = [...new Set(timesheets.map(t => t.jobcode_id))];
  let resolved = false;
  for (let round = 1; round <= MAX_ANCESTOR_ROUNDS; round++) {
    const missing = new Set<number>();
    for (const id of usedJobcodeIds) {
      const m = firstMissingOnChain(id, jobcodes, unresolvable);
      if (m !== null) missing.add(m);
    }
    if (missing.size === 0) {
      resolved = true;
      break;
    }
    const ids = [...missing].sort((a, b) => a - b);
    // active:'both' so inactive jobs/cost codes are not silently dropped by the default filter.
    const jc = await fetchByIds<Jobcode>(
      'jobcodes',
      ids,
      (batch, page) => client.getJobcodes({ ids: batch, active: 'both', page }),
      r => r.jobcodes,
      issues,
    );
    Object.assign(jobcodes, jc.items);
    log(
      `jobcodes round ${round}: ${ids.length} missing id(s) in ${jc.batches} batch(es), ${jc.requests} request(s)${jc.ok ? '' : ' (FAILED)'}`,
    );
    if (!jc.ok) {
      resolved = true; // failure already recorded in issues; stop walking
      break;
    }
    for (const id of ids) if (!jobcodes[String(id)]) unresolvable.add(id); // asked, not returned
  }
  if (!resolved) {
    issues.push(
      `jobcodes: parent chain still unresolved after ${MAX_ANCESTOR_ROUNDS} rounds. Rollup may be wrong.`,
    );
  }

  // 3. Users still missing after supplemental_data, by ids.
  const missingUserIds = [...new Set(timesheets.map(t => t.user_id))]
    .filter(id => !users[String(id)])
    .sort((a, b) => a - b);
  if (missingUserIds.length > 0) {
    const u = await fetchByIds<User>(
      'users',
      missingUserIds,
      (batch, page) => client.getUsers({ ids: batch, active: 'both', page }),
      r => r.users,
      issues,
    );
    Object.assign(users, u.items);
    log(
      `users: ${missingUserIds.length} missing id(s) in ${u.batches} batch(es), ${u.requests} request(s)${u.ok ? '' : ' (FAILED)'}`,
    );
  }

  // 4. Attachments: only the ids in attached_files, to confirm they are real, active files.
  const fileIds = [...new Set(timesheets.flatMap(t => t.attached_files ?? []))].sort((a, b) => a - b);
  let files: Record<string, File> | null = {};
  if (fileIds.length > 0) {
    const f = await fetchByIds<File>(
      'files',
      fileIds,
      (batch, page) => client.getFiles({ ids: batch, page }),
      r => r.files,
      issues,
    );
    log(
      `files: ${fileIds.length} attached id(s) in ${f.batches} batch(es), ${f.requests} request(s)${f.ok ? '' : ' (FAILED)'}`,
    );
    if (f.ok) {
      files = f.items;
    } else {
      files = null;
      issues.push(
        'files: attachment records could not be verified; attached file ids are counted as files WITHOUT confirming they are active.',
      );
    }
  }

  const input: CoverageInput = {
    timesheets: timesheets.map(t => ({
      id: t.id,
      user_id: t.user_id,
      jobcode_id: t.jobcode_id,
      date: t.date,
      duration: t.duration,
      notes: t.notes,
      attached_files: t.attached_files,
    })),
    jobcodes,
    users,
    files,
  };

  const minChars = options.minChars ?? THIN_NOTE_CHARS;
  const report = buildCoverageReport(input, { exclude, match: options.match, minChars });
  // Unknown jobcodes mean the rollup is wrong for some time: that is an incompleteness too.
  for (const w of report.warnings) {
    if (w.startsWith('Timesheets reference jobcode')) issues.push(w);
  }

  return {
    complete: issues.length === 0,
    issues,
    startDate: args.start_date,
    endDate: args.end_date,
    match: options.match ? String(options.match) : null,
    minChars,
    excludeFile: exclusions.source,
    report,
  };
}
