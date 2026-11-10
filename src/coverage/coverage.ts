/**
 * W1 coverage report — PURE module (no I/O, no clock, no network).
 *
 * A "job-day" is (parent job, date). Each child jobcode is rolled up to its
 * root ancestor (the job). Status:
 *   covered = has files, or has enough note text
 *   thin    = notes present but < THIN_NOTE_CHARS total, and no files
 *   missing = no note and no files
 * "Photos only" = files and no note. It is a subset of covered, listed
 * separately and kept out of missing/thin.
 *
 * Order of filtering: --match (job name) first, then exclusions. Excluded
 * job-days are counted (job-days + hours) but never listed.
 *
 * This module deliberately does not look at job type (proposal vs T&M).
 */

import type { JobMatcher } from './exclude.js';

/** Default `thin` threshold: total normalized note characters in a job-day below this = thin. */
export const THIN_NOTE_CHARS = 40;
export const NOTE_PREVIEW_CHARS = 80;

/**
 * Normalize a note before counting: collapse repeated dots/pipes, then strip
 * leading/trailing punctuation and whitespace. "." and ". | ." become "".
 * (The pipe is listed explicitly because Unicode classes it as a symbol, not punctuation.)
 */
export function normalizeNote(note: string): string {
  return note
    .replace(/\.{2,}/g, '.')
    .replace(/\|{2,}/g, '|')
    .replace(/^[\p{P}\s|]+|[\p{P}\s|]+$/gu, '');
}

export type CoverageStatus = 'covered' | 'thin' | 'missing';

export interface CoverageTimesheet {
  id: number;
  user_id: number;
  jobcode_id: number;
  date: string; // YYYY-MM-DD
  duration: number; // seconds
  notes?: string | null;
  attached_files?: number[] | null;
}

export interface CoverageJobcode {
  id: number;
  name: string;
  short_code?: string | null;
  parent_id?: number | null;
}

export interface CoverageUser {
  id: number;
  first_name: string;
  last_name: string;
}

export interface CoverageInput {
  timesheets: CoverageTimesheet[];
  jobcodes: Record<string, CoverageJobcode>;
  users: Record<string, CoverageUser>;
  /**
   * Known attachment records by id. An attached id counts as a file only if
   * its record is active. `null` = records could not be verified: every
   * attached id is then counted as a file (callers must flag this as an issue).
   */
  files: Record<string, { active: boolean }> | null;
}

export interface BuildOptions {
  /** Job-days whose ROOT job matches are excluded (counted, not listed). */
  exclude?: JobMatcher;
  /** Only job-days whose root job NAME matches are considered at all. */
  match?: RegExp;
  /** `thin` threshold in normalized note characters (default THIN_NOTE_CHARS). */
  minChars?: number;
}

export interface CrewMember {
  name: string;
  hours: number;
}

export interface JobDay {
  jobId: number;
  jobName: string;
  jobShortCode: string | null;
  date: string;
  crew: CrewMember[];
  totalHours: number;
  hasNote: boolean;
  noteChars: number;
  /** All non-empty NORMALIZED notes of the job-day joined with " | " (full text; trim for display). */
  noteText: string;
  hasFiles: boolean;
  status: CoverageStatus;
}

export interface JobGroup {
  jobId: number;
  jobName: string;
  jobShortCode: string | null;
  days: JobDay[]; // newest first
}

export interface CoverageReport {
  /** scanned = job-days evaluated (after --match, excluding excluded ones). photosOnly is part of covered. */
  counts: { scanned: number; covered: number; thin: number; missing: number; photosOnly: number };
  jobs: JobGroup[]; // missing/thin only, newest first
  /** Job-days with files and no note. Not in `jobs`. */
  photosOnly: JobGroup[];
  excluded: { jobDays: number; hours: number };
  /** flagged = hours in thin+missing job-days; scanned = hours in all scanned job-days (same set as counts.scanned). */
  hours: { flagged: number; scanned: number };
  /** Problems found while building (e.g. timesheets on unknown jobcodes). */
  warnings: string[];
}

export interface CoverageResult {
  /** false => the data is partial or unverified; never treat the report as complete. */
  complete: boolean;
  issues: string[];
  startDate: string;
  endDate: string;
  /** The --match filter that was applied, e.g. "/MMC/i", or null. */
  match: string | null;
  /** The `thin` threshold that was used. */
  minChars: number;
  /** Exclusion file that was read, or null if none exists (nothing excluded). */
  excludeFile: string | null;
  report: CoverageReport;
}

const roundHours = (seconds: number) => Math.round((seconds / 3600) * 100) / 100;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Sun" for "2026-11-08". Uses UTC so the machine's timezone cannot shift the day. */
export function weekdayOf(date: string): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(t) ? '???' : WEEKDAYS[new Date(t).getUTCDay()];
}

/** One line, collapsed whitespace, at most `max` characters (ellipsis included). */
export function truncateNote(text: string, max: number = NOTE_PREVIEW_CHARS): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}

/** Walk parent_id to the root. Returns the root jobcode id, or null if the chain is broken. */
function findRootId(
  jobcodeId: number,
  jobcodes: Record<string, CoverageJobcode>,
): number | null {
  const seen = new Set<number>();
  let current = jobcodes[String(jobcodeId)];
  if (!current) return null;
  while (current.parent_id && current.parent_id !== 0) {
    if (seen.has(current.id)) return null; // cycle
    seen.add(current.id);
    const parent: CoverageJobcode | undefined = jobcodes[String(current.parent_id)];
    if (!parent) return null; // broken chain
    current = parent;
  }
  return current.id;
}

export function classify(
  noteChars: number,
  hasFiles: boolean,
  minChars: number = THIN_NOTE_CHARS,
): CoverageStatus {
  if (hasFiles) return 'covered';
  if (noteChars === 0) return 'missing';
  if (noteChars < minChars) return 'thin';
  return 'covered';
}

/** Group job-days by job; days newest first; jobs by their newest day, then name. */
function groupByJob(days: JobDay[]): JobGroup[] {
  const groups = new Map<number, JobGroup>();
  for (const day of days) {
    let g = groups.get(day.jobId);
    if (!g) {
      g = { jobId: day.jobId, jobName: day.jobName, jobShortCode: day.jobShortCode, days: [] };
      groups.set(day.jobId, g);
    }
    g.days.push(day);
  }
  const jobs = [...groups.values()];
  for (const g of jobs) g.days.sort((x, y) => y.date.localeCompare(x.date));
  jobs.sort(
    (x, y) => y.days[0].date.localeCompare(x.days[0].date) || x.jobName.localeCompare(y.jobName),
  );
  return jobs;
}

export function buildCoverageReport(
  input: CoverageInput,
  options: BuildOptions = {},
): CoverageReport {
  const warnings: string[] = [];
  const unknownJobcodes = new Set<number>();
  const unknownUsers = new Set<number>();
  const minChars = options.minChars ?? THIN_NOTE_CHARS;

  interface Acc {
    jobId: number;
    jobName: string;
    jobShortCode: string | null;
    date: string;
    secondsByUser: Map<number, number>;
    totalSeconds: number;
    noteChars: number;
    notes: string[];
    hasFiles: boolean;
  }
  const acc = new Map<string, Acc>();

  for (const ts of input.timesheets) {
    let rootId = findRootId(ts.jobcode_id, input.jobcodes);
    let jobName: string;
    let jobShortCode: string | null = null;
    if (rootId === null) {
      // Unknown or broken hierarchy: keep the time visible under a clearly-labelled bucket.
      unknownJobcodes.add(ts.jobcode_id);
      rootId = ts.jobcode_id;
      jobName = `UNKNOWN JOBCODE ${ts.jobcode_id}`;
    } else {
      const root = input.jobcodes[String(rootId)];
      jobName = root.name;
      jobShortCode = root.short_code ? root.short_code : null;
    }

    const key = `${rootId}|${ts.date}`;
    let a = acc.get(key);
    if (!a) {
      a = {
        jobId: rootId,
        jobName,
        jobShortCode,
        date: ts.date,
        secondsByUser: new Map(),
        totalSeconds: 0,
        noteChars: 0,
        notes: [],
        hasFiles: false,
      };
      acc.set(key, a);
    }

    const seconds = ts.duration || 0;
    a.totalSeconds += seconds;
    a.secondsByUser.set(ts.user_id, (a.secondsByUser.get(ts.user_id) ?? 0) + seconds);

    const note = normalizeNote(ts.notes ?? '');
    if (note.length > 0) {
      a.noteChars += note.length;
      a.notes.push(note);
    }

    for (const fileId of ts.attached_files ?? []) {
      if (input.files === null) {
        a.hasFiles = true;
      } else if (input.files[String(fileId)]?.active) {
        a.hasFiles = true;
      }
    }
  }

  if (unknownJobcodes.size > 0) {
    warnings.push(
      `Timesheets reference jobcode(s) not found, so they could not be rolled up to a job: ${[...unknownJobcodes].sort((x, y) => x - y).join(', ')}`,
    );
  }

  const counts = { scanned: 0, covered: 0, thin: 0, missing: 0, photosOnly: 0 };
  const excluded = { jobDays: 0, seconds: 0 };
  let scannedSeconds = 0;
  let flaggedSeconds = 0;
  const flagged: JobDay[] = [];
  const photosOnly: JobDay[] = [];

  for (const a of acc.values()) {
    if (options.match && !options.match.test(a.jobName)) continue; // outside the filtered set
    if (options.exclude?.({ id: a.jobId, name: a.jobName })) {
      excluded.jobDays++;
      excluded.seconds += a.totalSeconds;
      continue;
    }

    const status = classify(a.noteChars, a.hasFiles, minChars);
    counts.scanned++;
    counts[status]++;
    scannedSeconds += a.totalSeconds;
    if (status !== 'covered') flaggedSeconds += a.totalSeconds;
    const isPhotosOnly = a.hasFiles && a.noteChars === 0;
    if (isPhotosOnly) counts.photosOnly++;
    if (status === 'covered' && !isPhotosOnly) continue;

    const crew: CrewMember[] = [...a.secondsByUser.entries()]
      .map(([userId, seconds]) => {
        const u = input.users[String(userId)];
        if (!u) unknownUsers.add(userId);
        const name = u ? `${u.first_name} ${u.last_name}`.trim() : `User ${userId}`;
        return { name, hours: roundHours(seconds) };
      })
      .sort((x, y) => x.name.localeCompare(y.name));

    const day: JobDay = {
      jobId: a.jobId,
      jobName: a.jobName,
      jobShortCode: a.jobShortCode,
      date: a.date,
      crew,
      totalHours: roundHours(a.totalSeconds),
      hasNote: a.noteChars > 0,
      noteChars: a.noteChars,
      noteText: a.notes.join(' | '),
      hasFiles: a.hasFiles,
      status,
    };
    (isPhotosOnly ? photosOnly : flagged).push(day);
  }

  if (unknownUsers.size > 0) {
    warnings.push(
      `User name not found for id(s): ${[...unknownUsers].sort((x, y) => x - y).join(', ')}`,
    );
  }

  return {
    counts,
    jobs: groupByJob(flagged),
    photosOnly: groupByJob(photosOnly),
    excluded: { jobDays: excluded.jobDays, hours: roundHours(excluded.seconds) },
    hours: { flagged: roundHours(flaggedSeconds), scanned: roundHours(scannedSeconds) },
    warnings,
  };
}

function renderGroups(groups: JobGroup[], lines: string[], showNoteText: boolean): void {
  for (const job of groups) {
    lines.push(job.jobShortCode ? `${job.jobName} (${job.jobShortCode})` : job.jobName);
    for (const d of job.days) {
      const crew = d.crew.map(c => `${c.name} ${c.hours}h`).join(', ');
      const detail = d.hasNote ? `${d.noteChars} note chars` : 'no note';
      let line = `  ${weekdayOf(d.date)} ${d.date}  ${d.status.toUpperCase().padEnd(7)}  ${d.totalHours}h  ${detail}${d.hasFiles ? ', files' : ', no files'}  [${crew}]`;
      if (showNoteText && d.status === 'thin') line += `  note: "${truncateNote(d.noteText)}"`;
      lines.push(line);
    }
    lines.push('');
  }
}

/** Plain-text rendering (used by the CLI). Incomplete results get a loud banner. */
export function formatCoverageText(result: CoverageResult): string {
  const { report } = result;
  const lines: string[] = [];

  if (!result.complete) {
    lines.push('!!! INCOMPLETE RESULT - DO NOT TREAT AS A FULL COVERAGE REPORT !!!');
    for (const issue of result.issues) lines.push(`  ! ${issue}`);
    lines.push('');
  }

  lines.push(`Coverage report ${result.startDate} to ${result.endDate}`);
  lines.push(
    `Thin threshold: fewer than ${result.minChars} note characters per job-day (punctuation-only text counts as 0)`,
  );
  if (result.match) lines.push(`Filter: job name matches ${result.match} (counts are for the filtered set)`);
  lines.push(
    `Job-days scanned: ${report.counts.scanned} | covered: ${report.counts.covered} | thin: ${report.counts.thin} | missing: ${report.counts.missing} | photos-only: ${report.counts.photosOnly} (included in covered)`,
  );
  lines.push(
    `Hours flagged: ${report.hours.flagged} of ${report.hours.scanned} total (thin+missing vs all scanned)`,
  );
  lines.push(
    `excluded: ${report.excluded.jobDays} job-days, ${report.excluded.hours} hours` +
      (result.excludeFile ? '' : ' (no coverage-exclude.json found, nothing excluded)'),
  );
  if (!result.complete) {
    lines.push('(counts above reflect only the data that could be fetched)');
  }
  for (const w of report.warnings) lines.push(`WARNING: ${w}`);
  lines.push('');

  if (report.jobs.length === 0) {
    lines.push(result.complete ? 'No missing or thin job-days.' : 'No missing or thin job-days found in the data that was fetched.');
    lines.push('');
  }
  renderGroups(report.jobs, lines, true);

  lines.push(`Photos only (no note): ${report.counts.photosOnly} job-days`);
  if (report.photosOnly.length > 0) {
    lines.push('');
    renderGroups(report.photosOnly, lines, false);
  } else {
    lines.push('');
  }

  if (!result.complete) {
    lines.push('!!! INCOMPLETE RESULT - see issues at the top !!!');
  }
  return lines.join('\n');
}
