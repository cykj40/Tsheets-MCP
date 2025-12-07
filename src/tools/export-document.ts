import { z } from 'zod';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableCell,
  TableRow,
  WidthType,
  AlignmentType,
  BorderStyle,
} from 'docx';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { SageReport } from '../types/sage.js';

export const ExportDocumentArgsSchema = z.object({
  sageReport: z.object({
    jobName: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    totalHours: z.number(),
    totalEntries: z.number(),
    entries: z.array(z.any()),
    employeeSummaries: z.array(z.any()),
    dailySummaries: z.array(z.any()),
  }),
  format: z.enum(['docx', 'pdf']),
  filename: z.string().optional(),
});

export type ExportDocumentArgs = z.infer<typeof ExportDocumentArgsSchema>;

/**
 * Export formatted report as DOCX or PDF document
 */
export async function exportDocument(
  args: ExportDocumentArgs
): Promise<{ format: string; base64: string; filename: string }> {
  const { sageReport, format, filename } = args;

  const defaultFilename = `timesheet_${sageReport.jobName.replace(/\s+/g, '_')}_${sageReport.startDate}_to_${sageReport.endDate}`;

  if (format === 'docx') {
    const buffer = await generateDocx(sageReport);
    return {
      format: 'docx',
      base64: buffer.toString('base64'),
      filename: filename || `${defaultFilename}.docx`,
    };
  } else {
    const buffer = await generatePdf(sageReport);
    return {
      format: 'pdf',
      base64: buffer.toString('base64'),
      filename: filename || `${defaultFilename}.pdf`,
    };
  }
}

/**
 * Generate DOCX document
 */
async function generateDocx(report: SageReport): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          // Title
          new Paragraph({
            text: 'Timesheet Report',
            heading: 'Heading1',
            alignment: AlignmentType.CENTER,
          }),

          // Job and Date Range
          new Paragraph({
            children: [
              new TextRun({ text: 'Job: ', bold: true }),
              new TextRun({ text: report.jobName }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Date Range: ', bold: true }),
              new TextRun({ text: `${report.startDate} to ${report.endDate}` }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Total Hours: ', bold: true }),
              new TextRun({ text: report.totalHours.toFixed(2) }),
            ],
          }),
          new Paragraph({ text: '' }), // Spacing

          // Summary Table Header
          new Paragraph({
            text: 'Summary by Employee',
            heading: 'Heading2',
          }),

          // Employee Summary Table
          createEmployeeSummaryTable(report),

          new Paragraph({ text: '' }), // Spacing

          // Detailed Entries Header
          new Paragraph({
            text: 'Detailed Time Entries',
            heading: 'Heading2',
          }),

          // Entries Table
          createEntriesTable(report),
        ],
      },
    ],
  });

  return await Packer.toBuffer(doc);
}

/**
 * Create employee summary table for DOCX
 */
function createEmployeeSummaryTable(report: SageReport): Table {
  const rows = [
    // Header row
    new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: 'Employee', bold: true })],
            }),
          ],
          width: { size: 60, type: WidthType.PERCENTAGE },
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: 'Hours', bold: true })],
            }),
          ],
          width: { size: 20, type: WidthType.PERCENTAGE },
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: 'Entries', bold: true })],
            }),
          ],
          width: { size: 20, type: WidthType.PERCENTAGE },
        }),
      ],
    }),
  ];

  // Data rows
  for (const summary of report.employeeSummaries) {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ text: summary.name })],
          }),
          new TableCell({
            children: [new Paragraph({ text: summary.totalHours.toFixed(2) })],
          }),
          new TableCell({
            children: [new Paragraph({ text: summary.entries.length.toString() })],
          }),
        ],
      })
    );
  }

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

/**
 * Create entries table for DOCX
 */
function createEntriesTable(report: SageReport): Table {
  const rows = [
    // Header row
    new TableRow({
      children: [
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: 'Date', bold: true })],
            }),
          ],
          width: { size: 15, type: WidthType.PERCENTAGE },
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: 'Employee', bold: true })],
            }),
          ],
          width: { size: 25, type: WidthType.PERCENTAGE },
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: 'Hours', bold: true })],
            }),
          ],
          width: { size: 15, type: WidthType.PERCENTAGE },
        }),
        new TableCell({
          children: [
            new Paragraph({
              children: [new TextRun({ text: 'Notes', bold: true })],
            }),
          ],
          width: { size: 45, type: WidthType.PERCENTAGE },
        }),
      ],
    }),
  ];

  // Data rows
  for (const entry of report.entries) {
    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ text: entry.date })],
          }),
          new TableCell({
            children: [new Paragraph({ text: entry.employeeName })],
          }),
          new TableCell({
            children: [new Paragraph({ text: entry.decimalHours })],
          }),
          new TableCell({
            children: [new Paragraph({ text: entry.notes || '-' })],
          }),
        ],
      })
    );
  }

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

/**
 * Generate PDF document
 */
async function generatePdf(report: SageReport): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([612, 792]); // Letter size
  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;

  // Title
  page.drawText('Timesheet Report', {
    x: margin,
    y,
    size: 24,
    font: boldFont,
    color: rgb(0, 0, 0),
  });
  y -= 40;

  // Job and Date Info
  page.drawText(`Job: ${report.jobName}`, {
    x: margin,
    y,
    size: 12,
    font: font,
  });
  y -= 20;

  page.drawText(`Date Range: ${report.startDate} to ${report.endDate}`, {
    x: margin,
    y,
    size: 12,
    font: font,
  });
  y -= 20;

  page.drawText(`Total Hours: ${report.totalHours.toFixed(2)}`, {
    x: margin,
    y,
    size: 12,
    font: boldFont,
  });
  y -= 40;

  // Employee Summary Section
  page.drawText('Summary by Employee', {
    x: margin,
    y,
    size: 16,
    font: boldFont,
  });
  y -= 25;

  // Table headers
  page.drawText('Employee', { x: margin, y, size: 10, font: boldFont });
  page.drawText('Hours', { x: margin + 250, y, size: 10, font: boldFont });
  page.drawText('Entries', { x: margin + 320, y, size: 10, font: boldFont });
  y -= 15;

  // Draw line
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  y -= 15;

  // Employee data
  for (const summary of report.employeeSummaries) {
    page.drawText(summary.name, { x: margin, y, size: 10, font: font });
    page.drawText(summary.totalHours.toFixed(2), {
      x: margin + 250,
      y,
      size: 10,
      font: font,
    });
    page.drawText(summary.entries.length.toString(), {
      x: margin + 320,
      y,
      size: 10,
      font: font,
    });
    y -= 15;

    // Check if we need a new page
    if (y < margin + 100) {
      page = pdfDoc.addPage([612, 792]);
      y = height - margin;
    }
  }

  y -= 20;

  // Detailed Entries Section
  if (y < margin + 200) {
    page = pdfDoc.addPage([612, 792]);
    y = height - margin;
  }

  page.drawText('Detailed Time Entries', {
    x: margin,
    y,
    size: 16,
    font: boldFont,
  });
  y -= 25;

  // Table headers
  page.drawText('Date', { x: margin, y, size: 10, font: boldFont });
  page.drawText('Employee', { x: margin + 80, y, size: 10, font: boldFont });
  page.drawText('Hours', { x: margin + 220, y, size: 10, font: boldFont });
  page.drawText('Notes', { x: margin + 280, y, size: 10, font: boldFont });
  y -= 15;

  // Draw line
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  y -= 15;

  // Entry data
  for (const entry of report.entries) {
    page.drawText(entry.date, { x: margin, y, size: 9, font: font });
    page.drawText(entry.employeeName.substring(0, 20), {
      x: margin + 80,
      y,
      size: 9,
      font: font,
    });
    page.drawText(entry.decimalHours, {
      x: margin + 220,
      y,
      size: 9,
      font: font,
    });

    const notes = (entry.notes || '-').substring(0, 40);
    page.drawText(notes, { x: margin + 280, y, size: 9, font: font });
    y -= 15;

    // Check if we need a new page
    if (y < margin + 50) {
      page = pdfDoc.addPage([612, 792]);
      y = height - margin;
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
