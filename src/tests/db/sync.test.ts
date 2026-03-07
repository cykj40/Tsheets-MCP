import { getAttachmentsForEntry, getEntriesByDateRange } from '../../db/query.js';
import { getTestDb } from '../setup.js';

const mockState = vi.hoisted(() => ({
  initializeMock: vi.fn(),
  getAllJobcodesMock: vi.fn(),
  getProjectReportMock: vi.fn(),
}));

vi.mock('../../auth/token-manager.js', () => ({
  TokenManager: class {
    constructor(_tokenPath: string) {}
  },
}));

vi.mock('../../api/tsheets-client.js', () => ({
  TSheetsClient: class {
    constructor(_tokenManager: unknown, _config: unknown) {}
    async initialize() {
      return mockState.initializeMock();
    }
  },
}));

vi.mock('../../api/tsheets.js', () => ({
  TSheetsApi: class {
    constructor(_client: unknown) {}
    async getAllJobcodes() {
      return mockState.getAllJobcodesMock();
    }
  },
}));

vi.mock('../../tools/get-project-report.js', () => ({
  getProjectReport: mockState.getProjectReportMock,
}));

describe('db sync functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TSHEETS_CLIENT_ID = 'client';
    process.env.TSHEETS_CLIENT_SECRET = 'secret';
    process.env.TSHEETS_REDIRECT_URI = 'http://localhost/callback';
    process.env.TOKEN_FILE_PATH = 'fake-token.json';
    mockState.initializeMock.mockResolvedValue(undefined);
    mockState.getAllJobcodesMock.mockResolvedValue([
      {
        id: 25831,
        name: 'NYP Buckley 4 Telemetry Rooms/Corridor Construction',
        short_code: '25831',
        parent_id: undefined,
        active: true,
        has_children: false,
        type: 'regular',
      },
    ]);
  });

  describe('syncDateRange', () => {
    it('calls the TSheets API with correct date params and inserts all returned entries', async () => {
      mockState.getProjectReportMock.mockResolvedValue({
        jobName: 'All Projects',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        totalEntries: 2,
        totalHours: 8.75,
        timeActivities: [
          {
            id: 'entry-1',
            date: '2026-02-03',
            employeeName: 'Marc Egan',
            jobName: 'NYP Buckley 4 Telemetry 25831',
            jobcodeId: 25831,
            hours: 6,
            minutes: 0,
            description: 'Worked on wall patch',
            billableStatus: 'NotBillable',
            hourlyRate: 0,
            createdAt: '2026-02-03T13:00:00Z',
            attachments: [],
          },
          {
            id: 'entry-2',
            date: '2026-02-04',
            employeeName: 'Cole Egan',
            jobName: 'NYP Buckley 4 Telemetry 25831',
            jobcodeId: 25831,
            hours: 2,
            minutes: 45,
            description: 'Patched wall',
            billableStatus: 'NotBillable',
            hourlyRate: 0,
            createdAt: '2026-02-04T13:00:00Z',
            attachments: [
              { id: 'photo-1', fileName: 'IMG_001.png', fileUrl: '', fileSize: 123 },
            ],
          },
        ],
        attachments: [{ id: 'photo-1', fileName: 'IMG_001.png', fileUrl: '', fileSize: 123 }],
      });

      const { syncDateRange } = await import('../../db/sync.js');
      const result = await syncDateRange('2026-02-01', '2026-02-28');

      expect(mockState.getProjectReportMock).toHaveBeenCalledWith(
        { startDate: '2026-02-01', endDate: '2026-02-28', jobcodeId: undefined },
        expect.any(Object)
      );
      expect(result.entriesSynced).toBe(2);
      expect(getEntriesByDateRange('2026-02-01', '2026-02-28')).toHaveLength(2);
      expect(getAttachmentsForEntry('entry-2')).toHaveLength(1);
    });

    it('upserts correctly without creating duplicates on second sync', async () => {
      mockState.getProjectReportMock.mockResolvedValue({
        jobName: 'All Projects',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        totalEntries: 1,
        totalHours: 8,
        timeActivities: [
          {
            id: 'entry-1',
            date: '2026-02-03',
            employeeName: 'Marc Egan',
            jobName: 'NYP Buckley 4 Telemetry 25831',
            jobcodeId: 25831,
            hours: 8,
            minutes: 0,
            description: 'First version',
            billableStatus: 'NotBillable',
            hourlyRate: 0,
            createdAt: null,
            attachments: [],
          },
        ],
        attachments: [],
      });

      const { syncDateRange } = await import('../../db/sync.js');
      await syncDateRange('2026-02-01', '2026-02-28');

      mockState.getProjectReportMock.mockResolvedValue({
        jobName: 'All Projects',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        totalEntries: 1,
        totalHours: 8,
        timeActivities: [
          {
            id: 'entry-1',
            date: '2026-02-03',
            employeeName: 'Marc Egan',
            jobName: 'NYP Buckley 4 Telemetry 25831',
            jobcodeId: 25831,
            hours: 8,
            minutes: 0,
            description: 'Updated version',
            billableStatus: 'NotBillable',
            hourlyRate: 0,
            createdAt: null,
            attachments: [],
          },
        ],
        attachments: [],
      });

      await syncDateRange('2026-02-01', '2026-02-28');

      const entries = getEntriesByDateRange('2026-02-01', '2026-02-28');
      expect(entries).toHaveLength(1);
      expect(entries[0].description).toBe('Updated version');
    });

    it('writes a record to sync_log on success', async () => {
      mockState.getProjectReportMock.mockResolvedValue({
        jobName: 'All Projects',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        totalEntries: 0,
        totalHours: 0,
        timeActivities: [],
        attachments: [],
      });

      const { syncDateRange } = await import('../../db/sync.js');
      await syncDateRange('2026-02-01', '2026-02-28');

      const row = getTestDb().prepare('SELECT status, end_date FROM sync_log LIMIT 1').get() as { status: string; end_date: string };
      expect(row).toEqual({ status: 'success', end_date: '2026-02-28' });
    });

    it('writes an error to sync_log on API failure', async () => {
      mockState.getProjectReportMock.mockRejectedValue(new Error('TSheets down'));

      const { syncDateRange } = await import('../../db/sync.js');
      await expect(syncDateRange('2026-02-01', '2026-02-28')).rejects.toThrow('TSheets down');

      const row = getTestDb().prepare('SELECT status, error FROM sync_log LIMIT 1').get() as { status: string; error: string };
      expect(row.status).toBe('error');
      expect(row.error).toContain('TSheets down');
    });

    it('returns the correct count of entries synced', async () => {
      mockState.getProjectReportMock.mockResolvedValue({
        jobName: 'All Projects',
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        totalEntries: 3,
        totalHours: 10,
        timeActivities: [
          {
            id: 'entry-1',
            date: '2026-02-03',
            employeeName: 'Marc Egan',
            jobName: 'Job 1',
            jobcodeId: 25831,
            hours: 1,
            minutes: 0,
            description: 'A',
            billableStatus: 'NotBillable',
            hourlyRate: 0,
            createdAt: null,
            attachments: [],
          },
          {
            id: 'entry-2',
            date: '2026-02-04',
            employeeName: 'Cole Egan',
            jobName: 'Job 1',
            jobcodeId: 25831,
            hours: 2,
            minutes: 0,
            description: 'B',
            billableStatus: 'NotBillable',
            hourlyRate: 0,
            createdAt: null,
            attachments: [],
          },
          {
            id: 'entry-3',
            date: '2026-02-05',
            employeeName: 'Amy Beta',
            jobName: 'Job 1',
            jobcodeId: 25831,
            hours: 7,
            minutes: 0,
            description: 'C',
            billableStatus: 'NotBillable',
            hourlyRate: 0,
            createdAt: null,
            attachments: [],
          },
        ],
        attachments: [],
      });

      const { syncDateRange } = await import('../../db/sync.js');
      const result = await syncDateRange('2026-02-01', '2026-02-28');
      expect(result.entriesSynced).toBe(3);
    });
  });

  describe('syncRecentData', () => {
    it('uses the last 90 days based on system time', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-07T12:00:00Z'));
      mockState.getProjectReportMock.mockResolvedValue({
        jobName: 'All Projects',
        startDate: '2025-12-07',
        endDate: '2026-03-07',
        totalEntries: 0,
        totalHours: 0,
        timeActivities: [],
        attachments: [],
      });

      const { syncRecentData } = await import('../../db/sync.js');
      await syncRecentData();

      expect(mockState.getProjectReportMock).toHaveBeenCalledWith(
        { startDate: '2025-12-07', endDate: '2026-03-07', jobcodeId: undefined },
        expect.any(Object)
      );
      vi.useRealTimers();
    });
  });

  describe('syncAllHistory', () => {
    it('breaks the range into 90-day chunks and calls the API once per chunk', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-07-01T12:00:00Z'));
      mockState.getProjectReportMock.mockResolvedValue({
        jobName: 'All Projects',
        startDate: '2023-01-01',
        endDate: '2023-03-31',
        totalEntries: 0,
        totalHours: 0,
        timeActivities: [],
        attachments: [],
      });

      const { syncAllHistory } = await import('../../db/sync.js');
      await syncAllHistory();

      expect(mockState.getProjectReportMock).toHaveBeenCalledTimes(3);
      expect(mockState.getProjectReportMock.mock.calls[0][0]).toEqual({
        startDate: '2023-01-01',
        endDate: '2023-03-31',
        jobcodeId: undefined,
      });
      expect(mockState.getProjectReportMock.mock.calls[2][0]).toEqual({
        startDate: '2023-06-30',
        endDate: '2023-07-01',
        jobcodeId: undefined,
      });
      vi.useRealTimers();
    });

    it('syncs all chunks even when one returns zero results', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-05-15T00:00:00Z'));
      mockState.getProjectReportMock
        .mockResolvedValueOnce({
          jobName: 'All Projects',
          startDate: '2023-01-01',
          endDate: '2023-03-31',
          totalEntries: 1,
          totalHours: 1,
          timeActivities: [
            {
              id: 'entry-1',
              date: '2023-01-01',
              employeeName: 'Marc Egan',
              jobName: 'Job 1',
              jobcodeId: 25831,
              hours: 1,
              minutes: 0,
              description: 'A',
              billableStatus: 'NotBillable',
              hourlyRate: 0,
              createdAt: null,
              attachments: [],
            },
          ],
          attachments: [],
        })
        .mockResolvedValueOnce({
          jobName: 'All Projects',
          startDate: '2023-04-01',
          endDate: '2023-05-15',
          totalEntries: 0,
          totalHours: 0,
          timeActivities: [],
          attachments: [],
        });

      const { syncAllHistory } = await import('../../db/sync.js');
      const result = await syncAllHistory();

      expect(mockState.getProjectReportMock).toHaveBeenCalledTimes(2);
      expect(result.entriesSynced).toBe(1);
      vi.useRealTimers();
    });
  });
});
