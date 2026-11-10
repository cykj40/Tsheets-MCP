import {
  runCoverageReport,
  MAX_PAGES,
  ID_BATCH,
  type CoverageClient,
} from '../../coverage/run.js';
import { EMPTY_EXCLUDE } from '../../coverage/exclude.js';

type Jc = ReturnType<typeof jobcode>;

const jobcode = (id: number, name: string, parent_id = 0) => ({
  id,
  name,
  parent_id,
  type: 'regular',
  active: true,
  has_children: false,
});
const user = (id: number, first_name: string) => ({
  id,
  first_name,
  last_name: 'T',
  active: true,
});
const sheet = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  user_id: 100,
  jobcode_id: 11,
  start: '2026-03-02T07:00:00+00:00',
  end: '2026-03-02T08:00:00+00:00',
  duration: 3600,
  date: '2026-03-02',
  notes: '',
  last_modified: '2026-03-02T09:00:00+00:00',
  attached_files: [],
  ...over,
});
const byId = <T extends { id: number }>(rows: T[]) =>
  Object.fromEntries(rows.map(r => [String(r.id), r]));

/** A timesheets page. `supp` = jobcodes returned in supplemental_data. */
const page = (
  sheets: Record<string, unknown>[],
  more: boolean,
  supp: Jc[] = [jobcode(1, 'Job One'), jobcode(11, 'Labor', 1)],
) => ({
  results: { timesheets: byId(sheets as { id: number }[]) },
  supplemental_data: { users: { '100': user(100, 'Ana') }, jobcodes: byId(supp) },
  more,
});

/** Mock client. getJobcodes answers from `jobcodeTable` for the requested ids only. */
function mockClient(jobcodeTable: Jc[] = [jobcode(1, 'Job One'), jobcode(11, 'Labor', 1)], over: Record<string, any> = {}) {
  const client = {
    getTimesheets: vi.fn(),
    getJobcodes: vi.fn(async (p: { ids?: number[] }) => ({
      results: { jobcodes: byId(jobcodeTable.filter(j => (p.ids ?? []).includes(j.id))) },
      more: false,
    })),
    getUsers: vi.fn(async (p: { ids?: number[] }) => ({
      results: { users: byId((p.ids ?? []).map(id => user(id, `U${id}`))) },
      more: false,
    })),
    getFiles: vi.fn(async (p: { ids?: number[] }) => ({
      results: {
        files: byId(
          (p.ids ?? []).map(id => ({ id, uploaded_by_user_id: 100, file_name: `f${id}.jpg`, active: true })),
        ),
      },
      more: false,
    })),
    ...over,
  };
  return client as unknown as CoverageClient & Record<keyof CoverageClient, ReturnType<typeof vi.fn>>;
}

const RANGE = { start_date: '2026-03-01', end_date: '2026-03-31' };
// Always pass exclusions explicitly so a developer's local coverage-exclude.json cannot affect tests.
const NO_EXCLUDE = { config: EMPTY_EXCLUDE, source: null };
const run = (client: CoverageClient, logs: string[] = []) =>
  runCoverageReport(client, RANGE, { log: m => logs.push(m), exclude: NO_EXCLUDE });

describe('runCoverageReport: call order and scope', () => {
  it('fetches timesheets first and does NOT list jobcodes when supplemental data covers them', async () => {
    const client = mockClient();
    client.getTimesheets.mockResolvedValueOnce(page([sheet(1)], false));

    const r = await run(client);

    expect(client.getTimesheets).toHaveBeenCalledWith(
      expect.objectContaining({ supplemental_data: 'yes', start_date: RANGE.start_date, end_date: RANGE.end_date }),
    );
    expect(client.getJobcodes).not.toHaveBeenCalled();
    expect(client.getUsers).not.toHaveBeenCalled();
    expect(client.getFiles).not.toHaveBeenCalled();
    expect(r.complete).toBe(true);
    expect(r.report.jobs[0].jobName).toBe('Job One');
    expect(r.report.jobs[0].days[0].crew).toEqual([{ name: 'Ana T', hours: 1 }]);
  });

  it('never calls getJobcodes without an ids filter', async () => {
    const client = mockClient();
    client.getTimesheets.mockResolvedValueOnce(page([sheet(1)], false, [jobcode(11, 'Labor', 1)]));

    await run(client);

    for (const call of client.getJobcodes.mock.calls) {
      expect(call[0].ids?.length).toBeGreaterThan(0);
      expect(call[0].active).toBe('both');
    }
  });
});

describe('runCoverageReport: ancestor jobcodes', () => {
  it('fetches a parent that is NOT in the supplemental data, by id', async () => {
    const client = mockClient();
    client.getTimesheets.mockResolvedValueOnce(page([sheet(1)], false, [jobcode(11, 'Labor', 1)]));

    const r = await run(client);

    expect(client.getJobcodes).toHaveBeenCalledTimes(1);
    expect(client.getJobcodes.mock.calls[0][0]).toMatchObject({ ids: [1], active: 'both' });
    expect(r.complete).toBe(true);
    expect(r.report.jobs[0].jobName).toBe('Job One'); // rolled up through the fetched parent
  });

  it('walks up several levels, one round per level', async () => {
    const table = [jobcode(1, 'Job One'), jobcode(5, 'Phase', 1), jobcode(11, 'Labor', 5)];
    const client = mockClient(table);
    client.getTimesheets.mockResolvedValueOnce(page([sheet(1)], false, [jobcode(11, 'Labor', 5)]));

    const r = await run(client);

    expect(client.getJobcodes.mock.calls.map(c => c[0].ids)).toEqual([[5], [1]]);
    expect(r.complete).toBe(true);
    expect(r.report.jobs[0].jobName).toBe('Job One');
  });

  it('splits many missing ancestor ids across several requests', async () => {
    const n = ID_BATCH * 2 + 5; // 205 distinct parents
    const table: Jc[] = [];
    const sheets: Record<string, unknown>[] = [];
    const supp: Jc[] = [];
    for (let i = 1; i <= n; i++) {
      table.push(jobcode(1000 + i, `Job ${i}`));
      supp.push(jobcode(2000 + i, `Labor ${i}`, 1000 + i));
      sheets.push(sheet(i, { jobcode_id: 2000 + i }));
    }
    const client = mockClient(table);
    client.getTimesheets.mockResolvedValueOnce(page(sheets, false, supp));

    const r = await run(client);

    expect(client.getJobcodes.mock.calls.map(c => c[0].ids.length)).toEqual([ID_BATCH, ID_BATCH, 5]);
    expect(r.complete).toBe(true);
    expect(r.report.counts.scanned).toBe(n);
  });

  it('is INCOMPLETE when a parent is asked for but never returned (no infinite loop)', async () => {
    const client = mockClient([]); // parent 1 does not exist anywhere
    client.getTimesheets.mockResolvedValueOnce(page([sheet(1)], false, [jobcode(11, 'Labor', 1)]));

    const r = await run(client);

    expect(client.getJobcodes).toHaveBeenCalledTimes(1);
    expect(r.complete).toBe(false);
    expect(r.issues.join(' ')).toMatch(/not found/);
  });

  it('reports an ancestor fetch failure as INCOMPLETE', async () => {
    const client = mockClient([], { getJobcodes: vi.fn().mockRejectedValue(new Error('nope')) });
    client.getTimesheets.mockResolvedValueOnce(page([sheet(1)], false, [jobcode(11, 'Labor', 1)]));

    const r = await run(client);

    expect(r.complete).toBe(false);
    expect(r.issues.join(' ')).toMatch(/jobcodes: page 1 failed.*nope/);
  });
});

describe('runCoverageReport: users', () => {
  it('fetches only users missing from supplemental data, by id', async () => {
    const client = mockClient();
    client.getTimesheets.mockResolvedValueOnce(page([sheet(1, { user_id: 100 }), sheet(2, { user_id: 777 })], false));

    const r = await run(client);

    expect(client.getUsers).toHaveBeenCalledTimes(1);
    expect(client.getUsers.mock.calls[0][0]).toMatchObject({ ids: [777], active: 'both' });
    expect(r.report.jobs[0].days[0].crew.map(c => c.name)).toEqual(['Ana T', 'U777 T']);
  });
});

describe('runCoverageReport: pagination', () => {
  it('follows `more` across 3 pages and merges all timesheets', async () => {
    const client = mockClient();
    client.getTimesheets
      .mockResolvedValueOnce(page([sheet(1, { date: '2026-03-01' })], true))
      .mockResolvedValueOnce(page([sheet(2, { date: '2026-03-02' })], true))
      .mockResolvedValueOnce(page([sheet(3, { date: '2026-03-03' })], false));

    const r = await run(client);

    expect(client.getTimesheets).toHaveBeenCalledTimes(3);
    expect(client.getTimesheets.mock.calls.map(c => c[0].page)).toEqual([1, 2, 3]);
    expect(r.complete).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.report.counts.scanned).toBe(3);
  });

  it('flags a truncated page (more=true but empty) as INCOMPLETE', async () => {
    const client = mockClient();
    client.getTimesheets
      .mockResolvedValueOnce(page([sheet(1)], true))
      .mockResolvedValueOnce(page([], true));

    const r = await run(client);

    expect(r.complete).toBe(false);
    expect(r.issues.join(' ')).toMatch(/truncated/);
    expect(r.report.counts.scanned).toBe(1); // partial data is still labelled incomplete
  });

  it('flags a malformed/cut-off body as INCOMPLETE', async () => {
    const client = mockClient();
    client.getTimesheets.mockResolvedValueOnce({ more: false }); // no `results`

    const r = await run(client);

    expect(r.complete).toBe(false);
    expect(r.issues[0]).toMatch(/timesheets: page 1 was truncated or malformed/);
  });

  it('flags a failing page after earlier pages succeeded', async () => {
    const client = mockClient();
    client.getTimesheets
      .mockResolvedValueOnce(page([sheet(1)], true))
      .mockRejectedValueOnce(new Error('TSheets API error: 500 - boom'));

    const r = await run(client);

    expect(r.complete).toBe(false);
    expect(r.issues[0]).toMatch(/page 2 failed.*500/);
  });

  it('stops at the page cap and says so', async () => {
    const client = mockClient();
    let n = 0;
    client.getTimesheets.mockImplementation(async () => page([sheet(++n)], true));

    const r = await run(client);

    expect(client.getTimesheets).toHaveBeenCalledTimes(MAX_PAGES);
    expect(r.complete).toBe(false);
    expect(r.issues.join(' ')).toMatch(/stopped after/);
  });
});

describe('runCoverageReport: attachments', () => {
  it('fetches only the attached ids, split across several requests', async () => {
    const n = ID_BATCH + 5; // 105 attached files
    const sheets = Array.from({ length: n }, (_, i) =>
      sheet(i + 1, { attached_files: [5000 + i], date: `2026-03-${String((i % 28) + 1).padStart(2, '0')}` }),
    );
    const client = mockClient();
    client.getTimesheets.mockResolvedValueOnce(page(sheets, false));

    const r = await run(client);

    const sizes = client.getFiles.mock.calls.map(c => c[0].ids.length);
    expect(sizes).toEqual([ID_BATCH, 5]);
    // every call carries an ids filter: the whole files list is never requested
    for (const c of client.getFiles.mock.calls) expect(c[0].ids?.length).toBeGreaterThan(0);
    expect(r.complete).toBe(true);
    expect(r.report.counts.missing).toBe(0); // all have active files
  });

  it('does not call getFiles when nothing is attached', async () => {
    const client = mockClient();
    client.getTimesheets.mockResolvedValueOnce(page([sheet(1)], false));
    await run(client);
    expect(client.getFiles).not.toHaveBeenCalled();
  });

  it('reports (does not swallow) an attachment fetch failure', async () => {
    const client = mockClient(undefined, {
      getFiles: vi.fn().mockRejectedValue(new Error('TSheets API error: 500 - files down')),
    });
    client.getTimesheets.mockResolvedValueOnce(page([sheet(1, { attached_files: [900] })], false));

    const r = await run(client);

    expect(r.complete).toBe(false);
    expect(r.issues.join(' ')).toMatch(/files: page 1 failed.*files down/);
    expect(r.issues.join(' ')).toMatch(/could not be verified/);
  });

  it('counts only active files', async () => {
    const client = mockClient(undefined, {
      getFiles: vi.fn().mockResolvedValue({
        results: {
          files: {
            '900': { id: 900, uploaded_by_user_id: 100, file_name: 'a.jpg', active: true },
            '901': { id: 901, uploaded_by_user_id: 100, file_name: 'b.jpg', active: false },
          },
        },
        more: false,
      }),
    });
    client.getTimesheets.mockResolvedValueOnce(
      page(
        [
          sheet(1, { attached_files: [900], date: '2026-03-01' }),
          sheet(2, { attached_files: [901], date: '2026-03-02' }),
        ],
        false,
      ),
    );

    const r = await run(client);

    expect(r.complete).toBe(true);
    expect(r.report.counts).toMatchObject({ scanned: 2, covered: 1, missing: 1 });
  });
});

describe('runCoverageReport: progress and misc', () => {
  it('logs one line per request group, not per request', async () => {
    const client = mockClient();
    client.getTimesheets
      .mockResolvedValueOnce(page([sheet(1)], true, [jobcode(11, 'Labor', 1)]))
      .mockResolvedValueOnce(page([sheet(2, { attached_files: [900] })], false, [jobcode(11, 'Labor', 1)]));
    const logs: string[] = [];

    await run(client, logs);

    // timesheets (2 pages) + jobcodes round 1 + files = 3 lines
    expect(logs).toHaveLength(3);
    expect(logs[0]).toMatch(/^timesheets .*2 entries, 2 request\(s\)/);
    expect(logs[1]).toMatch(/^jobcodes round 1: 1 missing id/);
    expect(logs[2]).toMatch(/^files: 1 attached id/);
  });

  it('rejects a bad date range before any request', async () => {
    const client = mockClient();
    const opts = { log: () => {}, exclude: NO_EXCLUDE };
    await expect(
      runCoverageReport(client, { start_date: '2026-04-01', end_date: '2026-03-01' }, opts),
    ).rejects.toThrow(/on or before/);
    await expect(
      runCoverageReport(client, { start_date: 'nope', end_date: '2026-03-01' }, opts),
    ).rejects.toThrow(/YYYY-MM-DD/);
    expect(client.getTimesheets).not.toHaveBeenCalled();
  });
});
