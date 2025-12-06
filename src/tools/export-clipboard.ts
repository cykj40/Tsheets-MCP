import { z } from 'zod';
import { SageReport, ExportFormatSchema, ExportFormat } from '../types/sage.js';
import { getDateRangeString } from '../utils/date.js';

export const ExportClipboardArgsSchema = z.object({
  sageReport: z.custom<SageReport>(),
  format: ExportFormatSchema,
});

export type ExportClipboardArgs = z.infer<typeof ExportClipboardArgsSchema>;

export function exportClipboard(args: ExportClipboardArgs): string {
  const { sageReport, format } = args;

  switch (format) {
    case 'text':
      return formatAsText(sageReport);
    case 'markdown':
      return formatAsMarkdown(sageReport);
    case 'csv':
      return formatAsCSV(sageReport);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
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

  // Daily summaries
  lines.push('## Daily Breakdown');
  lines.push('');

  report.dailySummaries.forEach(daily => {
    lines.push(`### ${daily.date}`);
    lines.push('');

    daily.entries.forEach(entry => {
      lines.push(`- **${entry.employeeName}** - ${entry.decimalHours} hrs`);
      if (entry.notes) {
        lines.push(`  - _Notes:_ ${entry.notes}`);
      }
    });

    lines.push('');
  });

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
    const notes = escapeCSV(entry.notes);

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
