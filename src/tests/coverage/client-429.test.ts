import { TSheetsClient } from '../../api/tsheets-client.js';

// All network is mocked: global fetch is replaced, no real TSheets call is possible.
const fakeTokenManager = {
  getValidAccessToken: vi.fn().mockResolvedValue('test-token'),
  hasValidTokens: vi.fn().mockResolvedValue(true),
} as any;

const oauthConfig = { clientId: 'x', clientSecret: 'y', redirectUri: 'http://localhost/cb' };

const res = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as any;

describe('TSheetsClient 429 handling', () => {
  const sleep = vi.fn().mockResolvedValue(undefined);
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sleep.mockClear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const make = () =>
    new TSheetsClient(fakeTokenManager, oauthConfig, { sleep, baseDelayMs: 100, maxRetries: 3 });

  it('retries after a 429 and then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(res(429, { error: 'throttled' }))
      .mockResolvedValueOnce(res(200, { results: { timesheets: {} }, more: false }));

    const out = await make().getTimesheets({ start_date: '2026-03-01', end_date: '2026-03-02' });

    expect(out.more).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(100);
  });

  it('honors Retry-After and backs off exponentially otherwise', async () => {
    fetchMock
      .mockResolvedValueOnce(res(429, {}, { 'retry-after': '7' }))
      .mockResolvedValueOnce(res(429, {}))
      .mockResolvedValueOnce(res(200, { results: {} }));

    await make().getJobcodes({});

    expect(sleep.mock.calls.map(c => c[0])).toEqual([7000, 200]);
  });

  it('gives up after the retry cap and throws a clear error', async () => {
    fetchMock.mockResolvedValue(res(429, { error: 'throttled' }));

    await expect(make().getUsers({})).rejects.toThrow(/429.*still throttled after 3 retries/);
    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 try + 3 retries
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it('does not retry other errors', async () => {
    fetchMock.mockResolvedValue(res(500, { error: 'boom' }));

    await expect(make().getUsers({})).rejects.toThrow(/500/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('sends the page param', async () => {
    fetchMock.mockResolvedValue(res(200, { results: {} }));
    await make().getTimesheets({ page: 3, supplemental_data: 'yes' });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.get('supplemental_data')).toBe('yes');
  });
});
