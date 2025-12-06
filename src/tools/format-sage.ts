import { z } from 'zod';
import { ProjectReport, SageReport, SageEntry, EmployeeSummary, DailySummary } from '../types/sage.js';
import { formatDecimalHours } from '../utils/date.js';

export const FormatSageArgsSchema = z.object({
  rawReport: z.custom<ProjectReport>(),
});

export type FormatSageArgs = z.infer<typeof FormatSageArgsSchema>;

export function formatSage(args: FormatSageArgs): SageReport {
  const { rawReport } = args;

  // Transform to Sage entries
  const entries: SageEntry[] = rawReport.timeActivities.map(activity => ({
    date: activity.date,
    employeeName: activity.employeeName,
    jobName: activity.jobName,
    hours: activity.hours + activity.minutes / 60,
    decimalHours: formatDecimalHours(activity.hours, activity.minutes),
    notes: activity.description,
  }));

  // Sort by date, then employee name
  entries.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    return a.employeeName.localeCompare(b.employeeName);
  });

  // Calculate employee summaries
  const employeeMap = new Map<string, SageEntry[]>();
  entries.forEach(entry => {
    const existing = employeeMap.get(entry.employeeName) || [];
    existing.push(entry);
    employeeMap.set(entry.employeeName, existing);
  });

  const employeeSummaries: EmployeeSummary[] = Array.from(employeeMap.entries())
    .map(([name, employeeEntries]) => ({
      name,
      totalHours: parseFloat(
        employeeEntries.reduce((sum, e) => sum + e.hours, 0).toFixed(2)
      ),
      entries: employeeEntries,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Calculate daily summaries
  const dailyMap = new Map<string, SageEntry[]>();
  entries.forEach(entry => {
    const existing = dailyMap.get(entry.date) || [];
    existing.push(entry);
    dailyMap.set(entry.date, existing);
  });

  const dailySummaries: DailySummary[] = Array.from(dailyMap.entries())
    .map(([date, dailyEntries]) => ({
      date,
      entries: dailyEntries,
      totalHours: parseFloat(
        dailyEntries.reduce((sum, e) => sum + e.hours, 0).toFixed(2)
      ),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    jobName: rawReport.jobName,
    startDate: rawReport.startDate,
    endDate: rawReport.endDate,
    totalHours: rawReport.totalHours,
    totalEntries: rawReport.totalEntries,
    entries,
    employeeSummaries,
    dailySummaries,
  };
}
