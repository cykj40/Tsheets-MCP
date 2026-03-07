const mockState = vi.hoisted(() => ({
  getEntriesByJobcodeMock: vi.fn(),
  syncProjectHistoryMock: vi.fn(),
}));

vi.mock('../../db/query.js', () => ({
  getEntriesByJobcode: mockState.getEntriesByJobcodeMock,
}));

vi.mock('../../db/sync.js', () => ({
  syncProjectHistory: mockState.syncProjectHistoryMock,
}));

import { getProjectDetails } from '../../tools/get-project-details.js';
import { mockEntry, mockEntryNoNotes, mockEntryWithPhotos } from '../fixtures/entries.js';

describe('getProjectDetails', () => {
  const tsheetsApi = {
    searchJobcodes: vi.fn(),
    getProjectWithDetails: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    tsheetsApi.getProjectWithDetails.mockResolvedValue({
      jobcode: {
        id: 25831,
        name: 'NYP Buckley 4 Telemetry Rooms/Corridor Construction',
        short_code: '25831',
        type: 'regular',
        active: true,
      },
      project: {
        id: 10,
        name: 'Buckley 4 Telemetry Rooms/Corridor Construction',
        active: true,
      },
      notes: [],
      files: {},
      noteAuthors: {},
    });
  });

  it('uses SQLite results on cache hit and does not call the API sync path', async () => {
    mockState.getEntriesByJobcodeMock.mockReturnValue([
      {
        ...mockEntry,
        hours: 8.5,
        attachmentCount: 0,
        lastSynced: '2026-03-07T00:00:00Z',
        createdAt: null,
      },
      {
        ...mockEntryWithPhotos,
        hours: 2.75,
        attachmentCount: 2,
        lastSynced: '2026-03-07T00:00:00Z',
        createdAt: null,
      },
      {
        ...mockEntryNoNotes,
        attachmentCount: 0,
        lastSynced: '2026-03-07T00:00:00Z',
        createdAt: null,
      },
    ]);

    const result = await getProjectDetails(tsheetsApi, { jobcodeId: 25831 });

    expect(mockState.syncProjectHistoryMock).not.toHaveBeenCalled();
    expect(result.timesheets?.source).toBe('cache');
    expect(result.timesheets?.header).toBe('NYP — NYP Buckley 4 Telemetry Rooms/Corridor Construction (25831)');
    expect(result.timesheets?.formatted).toContain('02/03 — Cole Egan | 2.75 hrs');
    expect(result.timesheets?.formatted).toContain('[2 📷]');
    expect(result.timesheets?.formatted).not.toContain('\n  .');
    expect(result.timesheets?.cost_codes).toHaveLength(1);
    expect(result.timesheets?.cost_codes[0].cost_code).toBe('1040 SUPERVISION');
  });

  it('syncs from the API on cache miss and still formats entries correctly', async () => {
    mockState.getEntriesByJobcodeMock
      .mockReturnValueOnce([])
      .mockReturnValueOnce([
        {
          ...mockEntry,
          hours: 6,
          attachmentCount: 0,
          lastSynced: '2026-03-07T00:00:00Z',
          createdAt: null,
        },
      ]);
    mockState.syncProjectHistoryMock.mockResolvedValue({
      startDate: '2023-01-01',
      endDate: '2026-03-07',
      entriesSynced: 1,
      attachmentsSynced: 0,
      jobcodesSynced: 1,
    });

    const result = await getProjectDetails(tsheetsApi, { jobcodeId: 25831 });

    expect(mockState.syncProjectHistoryMock).toHaveBeenCalledWith(25831);
    expect(result.timesheets?.source).toBe('api');
    expect(result.timesheets?.formatted).toContain('02/03 — Marc Egan | 6 hrs');
  });
});
