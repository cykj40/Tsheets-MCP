import {
  buildCoverageReport,
  formatCoverageText,
  classify,
  normalizeNote,
  weekdayOf,
  THIN_NOTE_CHARS,
  type CoverageInput,
  type CoverageResult,
} from '../../coverage/coverage.js';

const jobcodes: CoverageInput['jobcodes'] = {
  '1': { id: 1, name: 'NYP Buckley', short_code: '25831', parent_id: 0 },
  '11': { id: 11, name: '1030 GENERAL LABOR', parent_id: 1 },
  '12': { id: 12, name: '1040 MATERIALS', parent_id: 1 },
  '2': { id: 2, name: 'MMC Mammography', short_code: '25839', parent_id: 0 },
  '21': { id: 21, name: '1030 GENERAL LABOR', parent_id: 2 },
};
const users: CoverageInput['users'] = {
  '100': { id: 100, first_name: 'Ana', last_name: 'Lopez' },
  '101': { id: 101, first_name: 'Ben', last_name: 'Cho' },
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

const build = (timesheets: CoverageInput['timesheets'], files: CoverageInput['files'] = {}) =>
  buildCoverageReport({ timesheets, jobcodes, users, files });

describe('coverage: classify', () => {
  it('maps note chars and files to a status', () => {
    expect(THIN_NOTE_CHARS).toBe(40);
    expect(classify(0, false)).toBe('missing');
    expect(classify(39, false)).toBe('thin');
    expect(classify(40, false)).toBe('covered');
    expect(classify(0, true)).toBe('covered');
    expect(classify(5, true)).toBe('covered');
  });

  it('honors a custom threshold', () => {
    expect(classify(19, false, 20)).toBe('thin');
    expect(classify(20, false, 20)).toBe('covered');
    expect(classify(39, false, 10)).toBe('covered');
  });
});

describe('coverage: note normalization', () => {
  it('counts punctuation-only notes as 0', () => {
    expect(normalizeNote('.')).toBe('');
    expect(normalizeNote('. | .')).toBe('');
    expect(normalizeNote('...')).toBe('');
    expect(normalizeNote(' - , ; ')).toBe('');
    expect(normalizeNote('||')).toBe('');
  });

  it('strips leading/trailing punctuation and collapses repeated dots/pipes', () => {
    expect(normalizeNote('..poured slab..')).toBe('poured slab');
    expect(normalizeNote('"framed rooms."')).toBe('framed rooms');
    expect(normalizeNote('a .. b || c')).toBe('a . b | c');
    expect(normalizeNote('  Rooms 4-6 (done)  ')).toBe('Rooms 4-6 (done');
  });

  it('a "." or ". | ." note is MISSING, not thin', () => {
    const r = build([ts({ id: 1, notes: '.' }), ts({ id: 2, jobcode_id: 12, notes: '. | .' })]);
    const d = r.jobs[0].days[0];
    expect(d.status).toBe('missing');
    expect(d.hasNote).toBe(false);
    expect(d.noteChars).toBe(0);
  });

  it('counts normalized characters toward the threshold', () => {
    // 39 chars + trailing punctuation that must not count
    const note = `${'x'.repeat(39)}...`;
    expect(build([ts({ id: 1, notes: note })]).jobs[0].days[0].status).toBe('thin');
    expect(build([ts({ id: 1, notes: `${'x'.repeat(40)}...` })]).jobs).toEqual([]);
  });
});

describe('coverage: --min-chars threshold', () => {
  const sheets = [ts({ id: 1, notes: 'x'.repeat(25) })];

  it('defaults to 40: 25 chars is thin', () => {
    expect(build(sheets).jobs[0].days[0].status).toBe('thin');
  });

  it('a lower threshold makes the same note covered', () => {
    const r = buildCoverageReport({ timesheets: sheets, jobcodes, users, files: {} }, { minChars: 20 });
    expect(r.jobs).toEqual([]);
    expect(r.counts.covered).toBe(1);
  });

  it('a higher threshold makes a longer note thin', () => {
    const long = [ts({ id: 1, notes: 'x'.repeat(60) })];
    const r = buildCoverageReport({ timesheets: long, jobcodes, users, files: {} }, { minChars: 80 });
    expect(r.jobs[0].days[0].status).toBe('thin');
  });

  it('prints the threshold in the report header', () => {
    const text = formatCoverageText({
      complete: true,
      issues: [],
      startDate: 'a',
      endDate: 'b',
      match: null,
      minChars: 55,
      excludeFile: 'x',
      report: build(sheets),
    });
    expect(text).toContain('Thin threshold: fewer than 55 note characters per job-day');
  });
});

describe('coverage: rollup', () => {
  it('rolls child jobcodes up to the parent job into ONE job-day', () => {
    const r = build([
      ts({ id: 1, jobcode_id: 11, duration: 3600 }),
      ts({ id: 2, jobcode_id: 12, duration: 1800 }),
    ]);
    expect(r.counts.scanned).toBe(1);
    expect(r.jobs).toHaveLength(1);
    expect(r.jobs[0].jobName).toBe('NYP Buckley');
    expect(r.jobs[0].jobShortCode).toBe('25831');
    expect(r.jobs[0].days[0].totalHours).toBe(1.5);
  });

  it('keeps different parents and different dates as separate job-days', () => {
    const r = build([
      ts({ id: 1, jobcode_id: 11, date: '2026-03-02' }),
      ts({ id: 2, jobcode_id: 21, date: '2026-03-02' }),
      ts({ id: 3, jobcode_id: 11, date: '2026-03-03' }),
    ]);
    expect(r.counts.scanned).toBe(3);
    expect(r.counts.missing).toBe(3);
  });

  it('treats a top-level jobcode as its own job', () => {
    const r = build([ts({ id: 1, jobcode_id: 1 })]);
    expect(r.jobs[0].jobName).toBe('NYP Buckley');
  });

  it('buckets unknown jobcodes visibly and warns', () => {
    const r = build([ts({ id: 1, jobcode_id: 999 })]);
    expect(r.jobs[0].jobName).toBe('UNKNOWN JOBCODE 999');
    expect(r.warnings.join(' ')).toContain('999');
  });
});

describe('coverage: crew', () => {
  it('lists each user once with their own hours, summing the total', () => {
    const r = build([
      ts({ id: 1, user_id: 101, duration: 7200 }),
      ts({ id: 2, user_id: 100, duration: 3600 }),
      ts({ id: 3, user_id: 100, jobcode_id: 12, duration: 1800 }),
    ]);
    const day = r.jobs[0].days[0];
    expect(day.crew).toEqual([
      { name: 'Ana Lopez', hours: 1.5 },
      { name: 'Ben Cho', hours: 2 },
    ]);
    expect(day.totalHours).toBe(3.5);
  });
});

describe('coverage: status', () => {
  it('missing: no note and no files', () => {
    const r = build([ts({ id: 1, notes: '   ' })]);
    const d = r.jobs[0].days[0];
    expect(d.status).toBe('missing');
    expect(d.hasNote).toBe(false);
    expect(d.noteChars).toBe(0);
    expect(d.hasFiles).toBe(false);
  });

  it('thin: short notes in total (summed across the job-day), no files', () => {
    const r = build([
      ts({ id: 1, notes: 'poured slab' }), // 11
      ts({ id: 2, jobcode_id: 12, notes: 'ok' }), // 2
    ]);
    const d = r.jobs[0].days[0];
    expect(d.status).toBe('thin');
    expect(d.hasNote).toBe(true);
    expect(d.noteChars).toBe(13);
  });

  it('covered by long enough notes (not reported)', () => {
    const r = build([ts({ id: 1, notes: 'Framed and hung drywall in rooms 4 through 6 today' })]);
    expect(r.counts).toMatchObject({ scanned: 1, covered: 1, thin: 0, missing: 0, photosOnly: 0 });
    expect(r.jobs).toEqual([]);
  });

  it('covered by an active file even with no note (stays out of missing/thin)', () => {
    const r = build([ts({ id: 1, attached_files: [500] })], { '500': { active: true } });
    expect(r.counts.covered).toBe(1);
    expect(r.jobs).toEqual([]);
  });

  it('an inactive or unknown attachment does not count as a file', () => {
    const r = build(
      [ts({ id: 1, attached_files: [500] }), ts({ id: 2, date: '2026-03-03', attached_files: [501] })],
      { '500': { active: false } },
    );
    expect(r.counts.missing).toBe(2);
  });

  it('unverified files (null) count attached ids as files', () => {
    const r = build([ts({ id: 1, attached_files: [500] })], null);
    expect(r.counts.covered).toBe(1);
  });
});

describe('coverage: output shape', () => {
  it('reports only missing/thin, grouped by job, newest first, with counts', () => {
    const r = build([
      ts({ id: 1, jobcode_id: 11, date: '2026-03-01' }), // missing
      ts({ id: 2, jobcode_id: 11, date: '2026-03-05', notes: 'short' }), // thin
      ts({ id: 3, jobcode_id: 11, date: '2026-03-03', notes: 'A long enough descriptive note about the work done here' }), // covered
      ts({ id: 4, jobcode_id: 21, date: '2026-03-09' }), // missing, other job, newest
    ]);
    expect(r.counts).toEqual({ scanned: 4, covered: 1, thin: 1, missing: 2, photosOnly: 0 });
    expect(r.jobs.map(j => j.jobName)).toEqual(['MMC Mammography', 'NYP Buckley']);
    expect(r.jobs[1].days.map(d => d.date)).toEqual(['2026-03-05', '2026-03-01']);
  });
});

describe('coverage: text output', () => {
  const base = build([ts({ id: 1 })]);
  const result = (over: Partial<CoverageResult>): CoverageResult => ({
    complete: true,
    issues: [],
    startDate: '2026-03-01',
    endDate: '2026-03-07',
    match: null,
    minChars: 40,
    excludeFile: 'coverage-exclude.json',
    report: base,
    ...over,
  });

  it('prints plain text for a complete result', () => {
    const text = formatCoverageText(result({}));
    expect(text).toContain('Job-days scanned: 1');
    expect(text).toContain('NYP Buckley (25831)');
    expect(text).toContain('MISSING');
    expect(text).not.toContain('INCOMPLETE');
  });

  it('shows the weekday on each job-day line', () => {
    const report = build([
      ts({ id: 1, date: '2026-11-08' }), // Sunday
      ts({ id: 2, date: '2026-03-02' }), // Monday
    ]);
    const text = formatCoverageText(result({ report }));
    expect(text).toContain('  Sun 2026-11-08  MISSING');
    expect(text).toContain('  Mon 2026-03-02  MISSING');
  });

  it('weekdayOf is timezone-independent and handles bad input', () => {
    expect(weekdayOf('2026-11-08')).toBe('Sun');
    expect(weekdayOf('2026-11-14')).toBe('Sat');
    expect(weekdayOf('2024-02-29')).toBe('Thu');
    expect(weekdayOf('nope')).toBe('???');
  });

  it('prints hours flagged (thin+missing) of all scanned hours', () => {
    const report = build([
      ts({ id: 1, date: '2026-03-02', duration: 3600 }), // missing, 1h
      ts({ id: 2, date: '2026-03-03', duration: 7200, notes: 'poured slab' }), // thin, 2h
      ts({ id: 3, date: '2026-03-04', duration: 10800, notes: 'Framed and hung drywall in rooms 4 through 6 today' }), // covered, 3h
    ]);
    expect(report.hours).toEqual({ flagged: 3, scanned: 6 });
    const text = formatCoverageText(result({ report }));
    expect(text).toContain('Hours flagged: 3 of 6 total (thin+missing vs all scanned)');
  });

  it('hours exclude excluded and filtered-out job-days, and do not flag photos-only', () => {
    const report = buildCoverageReport(
      {
        timesheets: [
          ts({ id: 1, jobcode_id: 11, duration: 3600 }), // NYP Buckley: excluded
          ts({ id: 2, jobcode_id: 21, duration: 7200, date: '2026-03-03', attached_files: [500] }), // MMC: photos only, covered
          ts({ id: 3, jobcode_id: 11, duration: 36000, date: '2026-03-04' }), // NYP Buckley: excluded
        ],
        jobcodes,
        users,
        files: { '500': { active: true } },
      },
      { exclude: job => job.name === 'NYP Buckley' },
    );
    expect(report.excluded).toEqual({ jobDays: 2, hours: 11 });
    expect(report.hours).toEqual({ flagged: 0, scanned: 2 });
    expect(report.counts.photosOnly).toBe(1);
  });

  it('is loud when incomplete', () => {
    const text = formatCoverageText(result({ complete: false, issues: ['timesheets: page 2 failed'] }));
    expect(text.startsWith('!!! INCOMPLETE RESULT')).toBe(true);
    expect(text).toContain('page 2 failed');
  });
});
