import { z } from 'zod';
import { SageReport, ExportFormatSchema } from '../types/sage.js';
import { getDateRangeString } from '../utils/date.js';

export const ExportClipboardArgsSchema = z.object({
  sageReport: z.custom<SageReport>(),
  format: ExportFormatSchema,
});

export type ExportClipboardArgs = z.infer<typeof ExportClipboardArgsSchema>;

type PartialSageReport = Partial<SageReport> & {
  entries?: SageReport['entries'];
  employeeSummaries?: SageReport['employeeSummaries'];
  dailySummaries?: SageReport['dailySummaries'];
};

export function exportClipboard(args: ExportClipboardArgs): string {
  const report = normalizeReport(args.sageReport as PartialSageReport);

  switch (args.format) {
    case 'text':
      return formatAsText(report);
    case 'markdown':
      return formatAsMarkdown(report);
    case 'csv':
      return formatAsCSV(report);
    default:
      throw new Error(`Unsupported format: ${args.format}`);
  }
}

function normalizeReport(report: PartialSageReport): SageReport {
  const entries = Array.isArray(report.entries) ? [...report.entries] : [];

  const dailySummaries = Array.isArray(report.dailySummaries)
    ? report.dailySummaries
    : buildDailySummaries(entries);

  const employeeSummaries = Array.isArray(report.employeeSummaries)
    ? report.employeeSummaries
    : buildEmployeeSummaries(entries);

  const totalHours = typeof report.totalHours === 'number'
    ? report.totalHours
    : parseFloat(entries.reduce((sum, entry) => sum + entry.hours, 0).toFixed(2));

  const totalEntries = typeof report.totalEntries === 'number'
    ? report.totalEntries
    : entries.length;

  return {
    jobName: report.jobName || 'Unknown Job',
    startDate: report.startDate || '',
    endDate: report.endDate || '',
    totalHours,
    totalEntries,
    entries,
    employeeSummaries,
    dailySummaries,
  };
}

function buildDailySummaries(entries: SageReport['entries']): SageReport['dailySummaries'] {
  const dailyMap = new Map<string, SageReport['entries']>();

  for (const entry of entries) {
    const existing = dailyMap.get(entry.date) || [];
    existing.push(entry);
    dailyMap.set(entry.date, existing);
  }

  return Array.from(dailyMap.entries())
    .map(([date, dailyEntries]) => ({
      date,
      entries: dailyEntries,
      totalHours: parseFloat(dailyEntries.reduce((sum, entry) => sum + entry.hours, 0).toFixed(2)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function buildEmployeeSummaries(entries: SageReport['entries']): SageReport['employeeSummaries'] {
  const employeeMap = new Map<string, SageReport['entries']>();

  for (const entry of entries) {
    const existing = employeeMap.get(entry.employeeName) || [];
    existing.push(entry);
    employeeMap.set(entry.employeeName, existing);
  }

  return Array.from(employeeMap.entries())
    .map(([name, employeeEntries]) => ({
      name,
      totalHours: parseFloat(employeeEntries.reduce((sum, entry) => sum + entry.hours, 0).toFixed(2)),
      entries: employeeEntries,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function formatAsText(report: SageReport): string {
  const lines: string[] = [];

  // Header
  lines.push(`JOB: ${report.jobName}`);
  lines.push(`DATE RANGE: ${getDateRangeString(report.startDate, report.endDate)}`);
  lines.push(`TOTAL HOURS: ${report.totalHours.toFixed(2)}`);
  lines.push('');
  lines.push('=========================================');
  lines.push('');

  // Daily summaries
  report.dailySummaries.forEach(daily => {
    lines.push(`DATE: ${daily.date}`);
    lines.push('----------------------------------------');

    daily.entries.forEach(entry => {
      lines.push(`${entry.employeeName} - ${entry.decimalHours} hrs`);
      if (entry.notes) {
        lines.push(`  Notes: ${entry.notes}`);
      }
    });

    lines.push('');
  });

  // Employee summaries
  lines.push('=========================================');
  lines.push('EMPLOYEE SUMMARIES');
  lines.push('=========================================');
  lines.push('');

  report.employeeSummaries.forEach(employee => {
    lines.push(`${employee.name}: ${employee.totalHours.toFixed(2)} hours`);
  });

  return lines.join('\n');
}

function formatAsMarkdown(report: SageReport): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${report.jobName}`);
  lines.push('');
  lines.push(`**Date Range:** ${getDateRangeString(report.startDate, report.endDate)}`);
  lines.push(`**Total Hours:** ${report.totalHours.toFixed(2)}`);
  lines.push(`**Total Entries:** ${report.totalEntries}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  lines.push('| Date | Employee | Job | Hours | Notes |');
  lines.push('| --- | --- | --- | --- | --- |');

  report.entries.forEach(entry => {
    lines.push(
      `| ${escapeMarkdownTable(entry.date)} | ${escapeMarkdownTable(entry.employeeName)} | ${escapeMarkdownTable(entry.jobName)} | ${escapeMarkdownTable(entry.decimalHours)} | ${escapeMarkdownTable(cleanInlineText(entry.notes))} |`
    );
  });

  if (report.entries.length === 0) {
    lines.push('| - | - | - | - | - |');
  }

  lines.push('');

  // Employee summaries
  lines.push('---');
  lines.push('');
  lines.push('## Employee Summaries');
  lines.push('');

  report.employeeSummaries.forEach(employee => {
    lines.push(`- **${employee.name}:** ${employee.totalHours.toFixed(2)} hours`);
  });

  return lines.join('\n');
}

function formatAsCSV(report: SageReport): string {
  const lines: string[] = [];

  // Header row
  lines.push('Date,Employee,Job,Hours,Notes');

  // Data rows
  report.entries.forEach(entry => {
    const date = escapeCSV(entry.date);
    const employee = escapeCSV(entry.employeeName);
    const job = escapeCSV(entry.jobName);
    const hours = entry.decimalHours;
    const notes = escapeCSV(cleanInlineText(entry.notes));

    lines.push(`${date},${employee},${job},${hours},${notes}`);
  });

  return lines.join('\n');
}

function escapeCSV(value: string): string {
  if (!value) return '""';

  // If value contains comma, quote, or newline, wrap in quotes and escape quotes
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return `"${value}"`;
}

function cleanInlineText(value: string | null | undefined): string {
  return (value || '').replace(/\r?\n+/g, ' ').trim();
}

function escapeMarkdownTable(value: string): string {
  return value.replace(/\|/g, '\\|');
}
