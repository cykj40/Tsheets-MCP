import { formatSage } from '../../tools/format-sage.js';
import { ProjectReport } from '../../types/sage.js';

describe('formatSage', () => {
  function buildReport(timeActivities: ProjectReport['timeActivities']): ProjectReport {
    return {
      jobName: 'All Projects',
      startDate: '2026-02-02',
      endDate: '2026-02-08',
      totalHours: timeActivities.reduce((sum, entry) => sum + entry.hours + entry.minutes / 60, 0),
      totalEntries: timeActivities.length,
      timeActivities,
      attachments: timeActivities.flatMap(entry => entry.attachments),
    };
  }

  it('converts hours and minutes to decimal hours', () => {
    const report = buildReport([
      { id: '1', date: '2026-02-02', employeeName: 'A', jobName: 'J', jobcodeId: 1, hours: 2, minutes: 45, description: '', billableStatus: 'NotBillable', hourlyRate: 0, attachments: [] },
      { id: '2', date: '2026-02-03', employeeName: 'B', jobName: 'J', jobcodeId: 1, hours: 5, minutes: 30, description: '', billableStatus: 'NotBillable', hourlyRate: 0, attachments: [] },
      { id: '3', date: '2026-02-04', employeeName: 'C', jobName: 'J', jobcodeId: 1, hours: 8, minutes: 0, description: '', billableStatus: 'NotBillable', hourlyRate: 0, attachments: [] },
      { id: '4', date: '2026-02-05', employeeName: 'D', jobName: 'J', jobcodeId: 1, hours: 0, minutes: 15, description: '', billableStatus: 'NotBillable', hourlyRate: 0, attachments: [] },
      { id: '5', date: '2026-02-06', employeeName: 'E', jobName: 'J', jobcodeId: 1, hours: 0, minutes: 0, description: '', billableStatus: 'NotBillable', hourlyRate: 0, attachments: [] },
    ]);

    const result = formatSage({ rawReport: report });
    expect(result.entries.map(entry => entry.decimalHours)).toEqual(['2.75', '5.50', '8.00', '0.25', '0.00']);
  });

  it('sorts entries by date ascending and employee name ascending', () => {
    const result = formatSage({
      rawReport: buildReport([
        { id: '1', date: '2026-02-03', employeeName: 'Zed', jobName: 'J', jobcodeId: 1, hours: 1, minutes: 0, description: '', billableStatus: 'NotBillable', hourlyRate: 0, attachments: [] },
        { id: '2', date: '2026-02-02', employeeName: 'Marc', jobName: 'J', jobcodeId: 1, hours: 1, minutes: 0, description: '', billableStatus: 'NotBillable', hourlyRate: 0, attachments: [] },
        { id: '3', date: '2026-02-03', employeeName: 'Amy', jobName: 'J', jobcodeId: 1, hours: 1, minutes: 0, description: '', billableStatus: 'NotBillable', hourlyRate: 0, attachments: [] },
      ]),
    });

    expect(result.entries.map(entry => `${entry.date}-${entry.employeeName}`)).toEqual([
      '2026-02-02-Marc',
      '2026-02-03-Amy',
      '2026-02-03-Zed',
    ]);
  });

  it('calculates employee summaries and sorts employees alphabetically', () => {
    const result = formatSage({
      rawReport: buildReport([
        { id: '1', date: '2026-02-03', employeeName: 'Marc', jobName: 'J', jobcodeId: 1, hours: 2, minutes: 0, description: '', billableStatus: 'NotBillable', hourlyRate: 0, attachments: [] },
        { id: '2', date: '2026-02-04', employeeName: 'Marc', jobName: 'J', jobcodeId: 1, hours: 1, minutes: 30, description: '', billableStatus: 'NotBillable', hourlyRate: 0, attachments: [] },
        { id: '3', date: '2026-02-05', employeeName: 'Amy', jobName: 'J', jobcodeId: 1, hours: 3, minutes: 0, description: '', billableStatus: 'NotBillable', hourlyRate: 0, attachments: [] },
      ]),
    });

    expect(result.employeeSummaries.map(summary => [summary.name, summary.totalHours])).toEqual([
      ['Amy', 3],
      ['Marc', 3.5],
    ]);
  });

  it('groups daily summaries and calculates daily totals', () => {
    const result = formatSage({
      rawReport: buildReport([
        { id: '1', date: '2026-02-03', employeeName: 'Marc', jobName: 'J', jobcodeId: 1, hours: 2, minutes: 30, description: '', billableStatus: 'NotBillable', hourlyRate: 0, attachments: [] },
        { id: '2', date: '2026-02-03', employeeName: 'Amy', jobName: 'J', jobcodeId: 1, hours: 1, minutes: 0, description: '', billableStatus: 'NotBillable', hourlyRate: 0, attachments: [] },
        { id: '3', date: '2026-02-04', employeeName: 'Cole', jobName: 'J', jobcodeId: 1, hours: 4, minutes: 0, description: '', billableStatus: 'NotBillable', hourlyRate: 0, attachments: [] },
      ]),
    });

    expect(result.dailySummaries).toHaveLength(2);
    expect(result.dailySummaries[0].totalHours).toBe(3.5);
    expect(result.dailySummaries[0].entries).toHaveLength(2);
    expect(result.dailySummaries[1].totalHours).toBe(4);
  });

  it('handles empty timeActivities arrays', () => {
    const result = formatSage({ rawReport: buildReport([]) });
    expect(result.entries).toEqual([]);
    expect(result.employeeSummaries).toEqual([]);
    expect(result.dailySummaries).toEqual([]);
  });

  it('handles a single entry', () => {
    const result = formatSage({
      rawReport: buildReport([
        { id: '1', date: '2026-02-03', employeeName: 'Marc', jobName: 'J', jobcodeId: 1, hours: 8, minutes: 0, description: 'Solo', billableStatus: 'NotBillable', hourlyRate: 0, attachments: [] },
      ]),
    });

    expect(result.entries).toHaveLength(1);
    expect(result.employeeSummaries).toHaveLength(1);
    expect(result.dailySummaries).toHaveLength(1);
  });

  it('puts all entries on the same date into one daily group', () => {
    const result = formatSage({
      rawReport: buildReport([
        { id: '1', date: '2026-02-03', employeeName: 'Marc', jobName: 'J', jobcodeId: 1, hours: 1, minutes: 0, description: '', billableStatus: 'NotBillable', hourlyRate: 0, attachments: [] },
        { id: '2', date: '2026-02-03', employeeName: 'Amy', jobName: 'J', jobcodeId: 1, hours: 1, minutes: 0, description: '', billableStatus: 'NotBillable', hourlyRate: 0, attachments: [] },
      ]),
    });

    expect(result.dailySummaries).toHaveLength(1);
    expect(result.dailySummaries[0].entries).toHaveLength(2);
  });
});
