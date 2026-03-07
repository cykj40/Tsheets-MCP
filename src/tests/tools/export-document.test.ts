const mockState = vi.hoisted(() => ({
  packerToBufferMock: vi.fn(async () => Buffer.from('docx-content')),
  savePdfMock: vi.fn(async () => Uint8Array.from([1, 2, 3, 4])),
}));

vi.mock('docx', () => ({
  Document: class {
    constructor(_args: unknown) {}
  },
  Packer: { toBuffer: mockState.packerToBufferMock },
  Paragraph: class {
    constructor(public args: unknown) {}
  },
  TextRun: class {
    constructor(public args: unknown) {}
  },
  Table: class {
    constructor(public args: unknown) {}
  },
  TableCell: class {
    constructor(public args: unknown) {}
  },
  TableRow: class {
    constructor(public args: unknown) {}
  },
  WidthType: { PERCENTAGE: 'PERCENTAGE' },
  AlignmentType: { CENTER: 'CENTER' },
  BorderStyle: {},
}));

vi.mock('pdf-lib', () => ({
  PDFDocument: {
    create: vi.fn(async () => ({
      addPage: vi.fn(() => ({
        getSize: () => ({ width: 612, height: 792 }),
        drawText: vi.fn(),
        drawLine: vi.fn(),
      })),
      embedFont: vi.fn(async () => ({})),
      save: mockState.savePdfMock,
    })),
  },
  StandardFonts: {
    Helvetica: 'Helvetica',
    HelveticaBold: 'HelveticaBold',
  },
  rgb: vi.fn(() => ({})),
}));

import { exportDocument } from '../../tools/export-document.js';
import { mockSageReport } from '../fixtures/entries.js';

describe('exportDocument', () => {
  it('returns a valid base64 payload for docx', async () => {
    const result = await exportDocument({ sageReport: mockSageReport as any, format: 'docx' });
    expect(result.base64).toBe(Buffer.from('docx-content').toString('base64'));
    expect(() => Buffer.from(result.base64, 'base64')).not.toThrow();
  });

  it('returns a valid base64 payload for pdf', async () => {
    const result = await exportDocument({ sageReport: mockSageReport as any, format: 'pdf' });
    expect(() => Buffer.from(result.base64, 'base64')).not.toThrow();
  });

  it('uses a sensible default filename when one is not provided', async () => {
    const result = await exportDocument({ sageReport: mockSageReport as any, format: 'docx' });
    expect(result.filename).toContain('timesheet_All_Projects_2026-02-02_to_2026-02-08.docx');
  });

  it('uses the custom filename when provided', async () => {
    const result = await exportDocument({ sageReport: mockSageReport as any, format: 'pdf', filename: 'custom-report.pdf' });
    expect(result.filename).toBe('custom-report.pdf');
  });

  it('does not throw on empty entries', async () => {
    await expect(exportDocument({
      sageReport: {
        ...mockSageReport,
        entries: [],
        employeeSummaries: [],
        dailySummaries: [],
      } as any,
      format: 'docx',
    })).resolves.toMatchObject({ format: 'docx' });
  });
});
