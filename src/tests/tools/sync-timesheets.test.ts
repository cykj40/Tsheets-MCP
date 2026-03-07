const syncRecentDataMock = vi.fn();
const syncAllHistoryMock = vi.fn();
const syncDateRangeMock = vi.fn();

vi.mock('../../db/sync.js', () => ({
  syncRecentData: syncRecentDataMock,
  syncAllHistory: syncAllHistoryMock,
  syncDateRange: syncDateRangeMock,
}));

import { syncTimesheets } from '../../tools/sync-timesheets.js';

describe('syncTimesheets tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    syncRecentDataMock.mockResolvedValue({
      startDate: '2025-12-07',
      endDate: '2026-03-07',
      entriesSynced: 10,
      attachmentsSynced: 0,
      jobcodesSynced: 1,
    });
    syncAllHistoryMock.mockResolvedValue({
      startDate: '2023-01-01',
      endDate: '2026-03-07',
      entriesSynced: 100,
      attachmentsSynced: 0,
      jobcodesSynced: 1,
    });
    syncDateRangeMock.mockResolvedValue({
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      entriesSynced: 5,
      attachmentsSynced: 0,
      jobcodesSynced: 1,
    });
  });

  it('calls syncRecentData for mode recent', async () => {
    const result = await syncTimesheets({ mode: 'recent' });
    expect(syncRecentDataMock).toHaveBeenCalled();
    expect(result).toBe('Synced 10 entries. Date range: 2025-12-07 to 2026-03-07');
  });

  it('calls syncAllHistory for mode history', async () => {
    const result = await syncTimesheets({ mode: 'history' });
    expect(syncAllHistoryMock).toHaveBeenCalled();
    expect(result).toBe('Synced 100 entries. Date range: 2023-01-01 to 2026-03-07');
  });

  it('calls syncDateRange for mode range', async () => {
    const result = await syncTimesheets({ mode: 'range', startDate: '2026-02-01', endDate: '2026-02-28' });
    expect(syncDateRangeMock).toHaveBeenCalledWith('2026-02-01', '2026-02-28');
    expect(result).toBe('Synced 5 entries. Date range: 2026-02-01 to 2026-02-28');
  });

  it('throws a descriptive error for range without dates', async () => {
    await expect(syncTimesheets({ mode: 'range' })).rejects.toThrow('startDate and endDate are required when mode is "range"');
  });
});
