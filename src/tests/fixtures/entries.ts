import { ProjectReport } from '../../types/sage.js';

export const mockEntry = {
  id: '80001',
  date: '2026-02-03',
  employeeName: 'Jane Doe',
  jobName: 'Acme Clinic Renovation 10001 10001 \u203A 1040 SUPERVISION 1040',
  jobcodeId: 10001,
  hours: 6,
  minutes: 0,
  description: 'Team of 3. 6:00am start. Electricians on site.',
  billableStatus: 'NotBillable',
  hourlyRate: 0,
  attachments: [],
};

export const mockEntryWithPhotos = {
  ...mockEntry,
  id: '80002',
  employeeName: 'John Smith',
  hours: 2,
  minutes: 45,
  description: 'Patch wall after probe, insulate and sheetrock',
  attachments: [
    { id: '90001', fileName: 'IMG_001.png', fileUrl: '', fileSize: 1397246 },
    { id: '90002', fileName: 'IMG_002.png', fileUrl: '', fileSize: 1280563 },
  ],
};

export const mockEntryNoNotes = {
  ...mockEntry,
  id: '80003',
  description: '.',
};

export const mockProjectReport: ProjectReport = {
  jobName: 'Acme Clinic Renovation',
  startDate: '2026-02-02',
  endDate: '2026-02-08',
  totalHours: 8.75,
  totalEntries: 3,
  timeActivities: [mockEntry, mockEntryWithPhotos, mockEntryNoNotes],
  attachments: mockEntryWithPhotos.attachments,
};

export const mockSageReport = {
  jobName: 'All Projects',
  startDate: '2026-02-02',
  endDate: '2026-02-08',
  totalHours: 87.5,
  totalEntries: 12,
  entries: [
    {
      date: '2026-02-02',
      employeeName: 'Jane Doe',
      jobName: 'Acme Clinic Renovation 10001',
      hours: 6.0,
      decimalHours: '6.00',
      notes: 'Patch wall after probe, insulate and sheetrock',
    },
    {
      date: '2026-02-02',
      employeeName: 'John Smith',
      jobName: 'Acme Clinic Renovation 10001',
      hours: 2.75,
      decimalHours: '2.75',
      notes: 'Notes with a "quote" and, a comma',
    },
  ],
  employeeSummaries: [
    {
      name: 'John Smith',
      totalHours: 2.75,
      entries: [
        {
          date: '2026-02-02',
          employeeName: 'John Smith',
          jobName: 'Acme Clinic Renovation 10001',
          hours: 2.75,
          decimalHours: '2.75',
          notes: 'Notes with a "quote" and, a comma',
        },
      ],
    },
    {
      name: 'Jane Doe',
      totalHours: 6.0,
      entries: [
        {
          date: '2026-02-02',
          employeeName: 'Jane Doe',
          jobName: 'Acme Clinic Renovation 10001',
          hours: 6.0,
          decimalHours: '6.00',
          notes: 'Patch wall after probe, insulate and sheetrock',
        },
      ],
    },
  ],
  dailySummaries: [
    {
      date: '2026-02-02',
      totalHours: 8.75,
      entries: [
        {
          date: '2026-02-02',
          employeeName: 'Jane Doe',
          jobName: 'Acme Clinic Renovation 10001',
          hours: 6.0,
          decimalHours: '6.00',
          notes: 'Patch wall after probe, insulate and sheetrock',
        },
        {
          date: '2026-02-02',
          employeeName: 'John Smith',
          jobName: 'Acme Clinic Renovation 10001',
          hours: 2.75,
          decimalHours: '2.75',
          notes: 'Notes with a "quote" and, a comma',
        },
      ],
    },
  ],
};
