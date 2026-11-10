import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildCoverageReport,
  formatCoverageText,
  truncateNote,
  type CoverageInput,
  type CoverageResult,
} from '../../coverage/coverage.js';
import {
  compileExclude,
  parseExcludeConfig,
  EMPTY_EXCLUDE,
} from '../../coverage/exclude.js';
import { loadExcludeConfig } from '../../coverage/exclude-file.js';
import { runCoverageReport, type CoverageClient } from '../../coverage/run.js';

const jobcodes: CoverageInput['jobcodes'] = {
  '1': { id: 1, name: 'MMC Mammography', short_code: '25839', parent_id: 0 },
  '11': { id: 11, name: '1030 GENERAL LABOR', parent_id: 1 },
  '2': { id: 2, name: 'NYP Buckley', parent_id: 0 },
  '21': { id: 21, name: '1030 GENERAL LABOR', parent_id: 2 },
  '3': { id: 3, name: 'Lunch Break', parent_id: 0 },
  '4': { id: 4, name: 'Vacation', parent_id: 0 },
  '5': { id: 5, name: 'Office', parent_id: 0 },
  '6': { id: 6, name: 'Office Depot Renovation', parent_id: 0 },
  '7': { id: 7, name: 'Sickles Ave Build', parent_id: 0 },
  '8': { id: 8, name: 'Sick Time', parent_id: 0 },
};
const users: CoverageInput['users'] = {
  '100': { id: 100, first_name: 'Ana', last_name: 'Lopez' },
};
const ts = (over: Partial<CoverageInput['timesheets'][number]> & { id: number }) => ({
  user_id: 100,
  jobcode_id: 11,
  date: '2026-03-02',
  duration: 3600,
  notes: '',
  attached_files: [],
  ...over,
});
const build = (
  timesheets: CoverageInput['timesheets'],
  options = {},
  files: CoverageInput['files'] = {},
) => buildCoverageReport({ timesheets, jobcodes, users, files }, options);

const EXAMPLE_PATTERNS = ['lunch\\s*break', '\\bvacation\\b', '\\bholiday\\b', '\\bsick\\b', '^office$'];

describe('exclusions', () => {
  it('excludes by name, id and regex against the ROOT job, and counts them', () => {
    const exclude = compileExclude({ names: ['lunch break'], ids: [4], patterns: ['^sick'] });
    const r = build(
      [
        ts({ id: 1, jobcode_id: 3, duration: 1800 }), // name (case-insensitive)
        ts({ id: 2, jobcode_id: 4, duration: 7200, date: '2026-03-03' }), // id
        ts({ id: 3, jobcode_id: 8, duration: 3600, date: '2026-03-04' }), // pattern
        ts({ id: 4, jobcode_id: 11, date: '2026-03-05' }), // real job, missing
      ],
      { exclude },
    );
    expect(r.excluded).toEqual({ jobDays: 3, hours: 3.5 });
    expect(r.counts.scanned).toBe(1);
    expect(r.jobs.map(j => j.jobName)).toEqual(['MMC Mammography']);
  });

  it('matches the root job name, not the child (child "1030 GENERAL LABOR" is not excluded)', () => {
    const exclude = compileExclude({ names: [], ids: [], patterns: ['general labor'] });
    const r = build([ts({ id: 1, jobcode_id: 11 })], { exclude });
    expect(r.excluded.jobDays).toBe(0);
    expect(r.counts.scanned).toBe(1);
  });

  it('example patterns exclude non-job time but not look-alike real jobs', () => {
    const exclude = compileExclude({ names: [], ids: [], patterns: EXAMPLE_PATTERNS });
    const names = ['Lunch Break', 'Vacation', 'Sick Time', 'Office'];
    const keep = ['Office Depot Renovation', 'Sickles Ave Build', 'MMC Mammography'];
    for (const n of names) expect(exclude({ id: 0, name: n })).toBe(true);
    for (const n of keep) expect(exclude({ id: 0, name: n })).toBe(false);
    expect(exclude({ id: 0, name: 'Paid Holiday' })).toBe(true);
  });

  it('excluded job-days are not listed or counted as scanned', () => {
    const exclude = compileExclude({ names: ['Lunch Break'], ids: [], patterns: [] });
    const r = build([ts({ id: 1, jobcode_id: 3 })], { exclude });
    expect(r.jobs).toEqual([]);
    expect(r.counts.scanned).toBe(0);
  });

  it('a bad regex throws instead of being ignored', () => {
    expect(() => compileExclude({ names: [], ids: [], patterns: ['('] })).toThrow(/invalid exclusion pattern/);
  });

  it('rejects a malformed config', () => {
    expect(() => parseExcludeConfig({ ids: ['x'] })).toThrow(/invalid exclusion config/);
    expect(parseExcludeConfig({})).toEqual(EMPTY_EXCLUDE);
  });

  it('prints the excluded line in the text report', () => {
    const exclude = compileExclude({ names: ['Lunch Break'], ids: [], patterns: [] });
    const report = build([ts({ id: 1, jobcode_id: 3, duration: 5400 }), ts({ id: 2, date: '2026-03-03' })], { exclude });
    const text = formatCoverageText({
      complete: true,
      issues: [],
      startDate: '2026-03-01',
      endDate: '2026-03-07',
      match: null,
      minChars: 40,
      excludeFile: 'coverage-exclude.json',
      report,
    });
    expect(text).toContain('excluded: 1 job-days, 1.5 hours');
  });
});

describe('exclusion file loading', () => {
  it('returns no exclusions when the file does not exist', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'cov-'));
    const r = await loadExcludeConfig(join(dir, 'coverage-exclude.json'));
    expect(r).toEqual({ config: EMPTY_EXCLUDE, source: null });
  });

  it('reads a valid file', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'cov-'));
    const file = join(dir, 'coverage-exclude.json');
    await fs.writeFile(file, JSON.stringify({ _comment: 'x', patterns: ['vacation'] }));
    const r = await loadExcludeConfig(file);
    expect(r.source).toBe('coverage-exclude.json');
    expect(r.config.patterns).toEqual(['vacation']);
  });

  it('fails loudly on invalid JSON', async () => {
    const dir = await fs.mkdtemp(join(tmpdir(), 'cov-'));
    const file = join(dir, 'coverage-exclude.json');
    await fs.writeFile(file, '{ not json');
    await expect(loadExcludeConfig(file)).rejects.toThrow(/coverage-exclude\.json/);
  });

  it('the committed example file is valid and compiles', async () => {
    const text = await fs.readFile(join(process.cwd(), 'coverage-exclude.example.json'), 'utf-8');
    const config = parseExcludeConfig(JSON.parse(text));
    expect(config.patterns).toEqual(EXAMPLE_PATTERNS);
    expect(() => compileExclude(config)).not.toThrow();
  });
});

describe('thin note text', () => {
  it('truncateNote collapses whitespace and caps at 80 chars', () => {
    expect(truncateNote('  a\n\nb   c ')).toBe('a b c');
    const long = 'x'.repeat(200);
    const out = truncateNote(long);
    expect(out).toHaveLength(80);
    expect(out.endsWith('…')).toBe(true);
    expect(truncateNote('y'.repeat(80))).toHaveLength(80);
  });

  it('shows the note text for thin job-days only', () => {
    const report = build([
      ts({ id: 1, notes: 'poured slab', date: '2026-03-02' }), // thin
      ts({ id: 2, notes: '', date: '2026-03-03' }), // missing
    ]);
    const text = formatCoverageText({
      complete: true,
      issues: [],
      startDate: 'a',
      endDate: 'b',
      match: null,
      minChars: 40,
      excludeFile: 'x',
      report,
    });
    expect(text).toContain('THIN');
    expect(text).toContain('note: "poured slab"');
    const missingLine = text.split('\n').find(l => l.includes('MISSING'))!;
    expect(missingLine).not.toContain('note: "');
  });

  it('joins multiple notes of a job-day', () => {
    const report = build([
      ts({ id: 1, notes: 'a b' }),
      ts({ id: 2, jobcode_id: 11, notes: 'c d' }),
    ]);
    expect(report.jobs[0].days[0].noteText).toBe('a b | c d');
  });
});

describe('photos only (no note)', () => {
  const files = { '500': { active: true }, '501': { active: true } };

  it('lists files-and-no-note job-days separately, with a count, outside missing/thin', () => {
    const report = build(
      [
        ts({ id: 1, date: '2026-03-02', attached_files: [500] }), // photos only
        ts({ id: 2, date: '2026-03-03', attached_files: [501], notes: 'A proper long note about the work that was done today' }), // covered w/ note
        ts({ id: 3, date: '2026-03-04' }), // missing
      ],
      {},
      files,
    );
    expect(report.counts).toEqual({ scanned: 3, covered: 2, thin: 0, missing: 1, photosOnly: 1 });
    expect(report.jobs.flatMap(j => j.days.map(d => d.date))).toEqual(['2026-03-04']);
    expect(report.photosOnly).toHaveLength(1);
    expect(report.photosOnly[0].days.map(d => d.date)).toEqual(['2026-03-02']);
    expect(report.photosOnly[0].days[0].status).toBe('covered');
  });

  it('has its own section in the text report', () => {
    const report = build([ts({ id: 1, attached_files: [500] })], {}, files);
    const text = formatCoverageText({
      complete: true,
      issues: [],
      startDate: 'a',
      endDate: 'b',
      match: null,
      minChars: 40,
      excludeFile: 'x',
      report,
    });
    expect(text).toContain('Photos only (no note): 1 job-days');
    expect(text).toContain('No missing or thin job-days.');
    const idx = text.indexOf('Photos only (no note)');
    expect(text.slice(idx)).toContain('MMC Mammography');
  });

  it('is empty when no photo-only days exist', () => {
    const report = build([ts({ id: 1 })]);
    expect(report.photosOnly).toEqual([]);
    expect(report.counts.photosOnly).toBe(0);
  });
});

describe('--match (job name filter after rollup)', () => {
  const sheets = [
    ts({ id: 1, jobcode_id: 11 }), // MMC (child rolled up)
    ts({ id: 2, jobcode_id: 21 }), // NYP
    ts({ id: 3, jobcode_id: 11, date: '2026-03-03', notes: 'Framed and hung drywall in rooms 4 through 6 today' }),
  ];

  it('filters on the ROOT job name and counts only the filtered set', () => {
    const r = build(sheets, { match: /mmc/i });
    expect(r.counts).toMatchObject({ scanned: 2, covered: 1, missing: 1 });
    expect(r.jobs.map(j => j.jobName)).toEqual(['MMC Mammography']);
  });

  it('does not match on the child name', () => {
    const r = build(sheets, { match: /general labor/i });
    expect(r.counts.scanned).toBe(0);
  });

  it('applies the filter before exclusions', () => {
    const exclude = compileExclude({ names: ['Lunch Break'], ids: [], patterns: [] });
    const r = build([ts({ id: 1, jobcode_id: 3 }), ts({ id: 2, jobcode_id: 11 })], { match: /mmc/i, exclude });
    expect(r.excluded.jobDays).toBe(0); // Lunch Break is outside the filtered set, not "excluded"
    expect(r.counts.scanned).toBe(1);
  });

  it('shows the filter in the text report', () => {
    const report = build(sheets, { match: /mmc/i });
    const result: CoverageResult = {
      complete: true,
      issues: [],
      startDate: 'a',
      endDate: 'b',
      match: '/mmc/i',
      minChars: 40,
      excludeFile: 'x',
      report,
    };
    expect(formatCoverageText(result)).toContain('Filter: job name matches /mmc/i');
  });
});

describe('runCoverageReport wiring (mocked client)', () => {
  const page = () => ({
    results: {
      timesheets: {
        '1': { id: 1, user_id: 100, jobcode_id: 11, start: '', end: '', duration: 3600, date: '2026-03-02', notes: '', last_modified: 'x', attached_files: [] },
        '2': { id: 2, user_id: 100, jobcode_id: 21, start: '', end: '', duration: 3600, date: '2026-03-02', notes: '', last_modified: 'x', attached_files: [] },
        '3': { id: 3, user_id: 100, jobcode_id: 3, start: '', end: '', duration: 1800, date: '2026-03-02', notes: '', last_modified: 'x', attached_files: [] },
      },
    },
    supplemental_data: {
      users: { '100': { id: 100, first_name: 'Ana', last_name: 'Lopez', active: true } },
      jobcodes: Object.fromEntries(
        Object.values(jobcodes).map(j => [String(j.id), { ...j, type: 'regular', active: true, has_children: false }]),
      ),
    },
    more: false,
  });
  const client = () =>
    ({
      getTimesheets: vi.fn().mockResolvedValue(page()),
      getJobcodes: vi.fn(),
      getUsers: vi.fn(),
      getFiles: vi.fn(),
    }) as unknown as CoverageClient;
  const RANGE = { start_date: '2026-03-01', end_date: '2026-03-31' };

  it('applies the loaded exclusions and the match filter end to end', async () => {
    const r = await runCoverageReport(client(), RANGE, {
      log: () => {},
      exclude: { config: { names: ['Lunch Break'], ids: [], patterns: [] }, source: 'coverage-exclude.json' },
      match: /mmc|lunch/i,
    });
    expect(r.complete).toBe(true);
    expect(r.match).toBe('/mmc|lunch/i');
    expect(r.excludeFile).toBe('coverage-exclude.json');
    expect(r.report.excluded).toEqual({ jobDays: 1, hours: 0.5 });
    expect(r.report.counts.scanned).toBe(1);
    expect(r.report.jobs[0].jobName).toBe('MMC Mammography');
  });

  it('uses the default thin threshold (40) and passes a custom --min-chars through', async () => {
    const noExclude = { config: { names: [], ids: [], patterns: [] }, source: null };
    const withNote = () => {
      const p = page();
      (p.results.timesheets['1'] as { notes: string }).notes = 'x'.repeat(25); // MMC: 25 chars
      return { getTimesheets: vi.fn().mockResolvedValue(p), getJobcodes: vi.fn(), getUsers: vi.fn(), getFiles: vi.fn() } as unknown as CoverageClient;
    };
    const opts = { log: () => {}, exclude: noExclude, match: /mmc/i };

    const def = await runCoverageReport(withNote(), RANGE, opts);
    expect(def.minChars).toBe(40);
    expect(def.report.counts.thin).toBe(1);

    const low = await runCoverageReport(withNote(), RANGE, { ...opts, minChars: 20 });
    expect(low.minChars).toBe(20);
    expect(low.report.counts).toMatchObject({ thin: 0, covered: 1 });
  });
});
