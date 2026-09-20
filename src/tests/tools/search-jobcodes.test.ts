import { searchJobcodes } from '../../tools/search-jobcodes.js';

describe('searchJobcodes tool', () => {
  const tsheetsApi = {
    getAllJobcodes: vi.fn(),
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    tsheetsApi.getAllJobcodes.mockResolvedValue([
      {
        id: 1,
        name: 'Acme Clinic Renovation',
        short_code: '10001',
        type: 'regular',
        active: true,
        has_children: false,
      },
      {
        id: 2,
        name: 'Acme Lab Expansion',
        short_code: '10002',
        type: 'regular',
        active: true,
        has_children: false,
      },
    ]);
  });

  it('returns matching jobcodes for a partial name', async () => {
    const result = await searchJobcodes(tsheetsApi, { search: 'Clinic' });
    expect(result.success).toBe(true);
    expect(result.jobcodes).toHaveLength(1);
    expect(result.jobcodes[0].name).toContain('Clinic');
  });

  it('returns a match for numeric ID search', async () => {
    const result = await searchJobcodes(tsheetsApi, { search: '10002' });
    expect(result.jobcodes).toHaveLength(1);
    expect(result.jobcodes[0].id).toBe(2);
  });

  it('returns empty array when no match exists', async () => {
    const result = await searchJobcodes(tsheetsApi, { search: 'Nope' });
    expect(result.jobcodes).toEqual([]);
  });

  it('handles API errors gracefully', async () => {
    tsheetsApi.getAllJobcodes.mockRejectedValue(new Error('boom'));
    const result = await searchJobcodes(tsheetsApi, { search: 'Clinic' });
    expect(result).toEqual({
      success: false,
      jobcodes: [],
      total_count: 0,
      search_term: 'Clinic',
    });
  });
});
