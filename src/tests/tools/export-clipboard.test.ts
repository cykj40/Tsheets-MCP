import { exportClipboard } from '../../tools/export-clipboard.js';
import { mockSageReport } from '../fixtures/entries.js';

describe('exportClipboard', () => {
  describe('text format', () => {
    it('includes header, date range, total hours, entries, and employee summary', () => {
      const output = exportClipboard({ sageReport: mockSageReport as any, format: 'text' });
      expect(output).toContain('JOB: All Projects');
      expect(output).toContain('DATE RANGE: 2026-02-02 - 2026-02-08');
      expect(output).toContain('TOTAL HOURS: 87.50');
      expect(output).toContain('Marc Egan - 6.00 hrs');
      expect(output).toContain('EMPLOYEE SUMMARIES');
    });

    it('produces valid output for empty entries without crashing', () => {
      const output = exportClipboard({
        sageReport: { jobName: 'Empty', startDate: '2026-01-01', endDate: '2026-01-02', totalHours: 0, totalEntries: 0, entries: [] } as any,
        format: 'text',
      });
      expect(output).toContain('JOB: Empty');
    });
  });

  describe('csv format', () => {
    it('writes the expected header and columns', () => {
      const output = exportClipboard({ sageReport: mockSageReport as any, format: 'csv' });
      const [header, firstRow] = output.split('\n');
      expect(header).toBe('Date,Employee,Job,Hours,Notes');
      expect(firstRow).toContain('"2026-02-02","Marc Egan","NYP Buckley 4 Telemetry 25831",6.00,');
    });

    it('quotes commas and escapes double quotes', () => {
      const output = exportClipboard({ sageReport: mockSageReport as any, format: 'csv' });
      expect(output).toContain('"Notes with a ""quote"" and, a comma"');
    });

    it('handles empty notes and cleans newlines to a single line', () => {
      const output = exportClipboard({
        sageReport: {
          ...mockSageReport,
          entries: [
            {
              date: '2026-02-02',
              employeeName: 'Marc Egan',
              jobName: 'Job',
              hours: 1,
              decimalHours: '1.00',
              notes: '',
            },
            {
              date: '2026-02-03',
              employeeName: 'Cole Egan',
              jobName: 'Job',
              hours: 2,
              decimalHours: '2.00',
              notes: 'Line one\nLine two',
            },
          ],
        } as any,
        format: 'csv',
      });

      expect(output).toContain('""');
      expect(output).toContain('"Line one Line two"');
    });
  });

  describe('markdown format', () => {
    it('contains a markdown header and table with separators', () => {
      const output = exportClipboard({ sageReport: mockSageReport as any, format: 'markdown' });
      expect(output).toContain('# All Projects');
      expect(output).toContain('| Date | Employee | Job | Hours | Notes |');
      expect(output).toContain('| 2026-02-02 | Marc Egan | NYP Buckley 4 Telemetry 25831 | 6.00 | Patch wall after probe, insulate and sheetrock |');
    });

    it('produces valid markdown for empty entries', () => {
      const output = exportClipboard({
        sageReport: { jobName: 'Empty', startDate: '2026-01-01', endDate: '2026-01-02', totalHours: 0, totalEntries: 0, entries: [] } as any,
        format: 'markdown',
      });
      expect(output).toContain('| - | - | - | - | - |');
    });
  });

  it('never throws for empty entries or undefined notes in any format', () => {
    const report = {
      jobName: 'Empty',
      startDate: '2026-01-01',
      endDate: '2026-01-02',
      totalHours: 0,
      totalEntries: 1,
      entries: [
        {
          date: '2026-01-01',
          employeeName: 'Marc',
          jobName: 'Job',
          hours: 0,
          decimalHours: '0.00',
          notes: undefined,
        },
      ],
    } as any;

    expect(() => exportClipboard({ sageReport: report, format: 'text' })).not.toThrow();
    expect(() => exportClipboard({ sageReport: report, format: 'csv' })).not.toThrow();
    expect(() => exportClipboard({ sageReport: report, format: 'markdown' })).not.toThrow();
  });
});
