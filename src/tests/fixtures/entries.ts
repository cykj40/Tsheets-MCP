import { ProjectReport } from '../../types/sage.js';

export const mockEntry = {
  id: '792651992',
  date: '2026-02-03',
  employeeName: 'Marc Egan',
  jobName: 'NYP Buckley 4 Telemetry Rooms/Corridor Construction 25831 25831 \u203A 1040 SUPERVISION 1040',
  jobcodeId: 25831,
  hours: 6,
  minutes: 0,
  description: 'Me, Cole, Pawel. 5:45am start. 2 plumbers on site.',
  billableStatus: 'NotBillable',
  hourlyRate: 0,
  attachments: [],
};

export const mockEntryWithPhotos = {
  ...mockEntry,
  id: '792651993',
  employeeName: 'Cole Egan',
  hours: 2,
  minutes: 45,
  description: 'Patch wall after probe, insulate and sheetrock',
  attachments: [
    { id: '56670630', fileName: 'IMG_001.png', fileUrl: '', fileSize: 1397246 },
    { id: '56670631', fileName: 'IMG_002.png', fileUrl: '', fileSize: 1280563 },
  ],
};

export const mockEntryNoNotes = {
  ...mockEntry,
  id: '792651994',
  description: '.',
};

export const mockProjectReport: ProjectReport = {
  jobName: 'NYP Buckley 4 Telemetry Rooms/Corridor Construction',
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
      employeeName: 'Marc Egan',
      jobName: 'NYP Buckley 4 Telemetry 25831',
      hours: 6.0,
      decimalHours: '6.00',
      notes: 'Patch wall after probe, insulate and sheetrock',
    },
    {
      date: '2026-02-02',
      employeeName: 'Cole Egan',
      jobName: 'NYP Buckley 4 Telemetry 25831',
      hours: 2.75,
      decimalHours: '2.75',
      notes: 'Notes with a "quote" and, a comma',
    },
  ],
  employeeSummaries: [
    {
      name: 'Cole Egan',
      totalHours: 2.75,
      entries: [
        {
          date: '2026-02-02',
          employeeName: 'Cole Egan',
          jobName: 'NYP Buckley 4 Telemetry 25831',
          hours: 2.75,
          decimalHours: '2.75',
          notes: 'Notes with a "quote" and, a comma',
        },
      ],
    },
    {
      name: 'Marc Egan',
      totalHours: 6.0,
      entries: [
        {
          date: '2026-02-02',
          employeeName: 'Marc Egan',
          jobName: 'NYP Buckley 4 Telemetry 25831',
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
          employeeName: 'Marc Egan',
          jobName: 'NYP Buckley 4 Telemetry 25831',
          hours: 6.0,
          decimalHours: '6.00',
          notes: 'Patch wall after probe, insulate and sheetrock',
        },
        {
          date: '2026-02-02',
          employeeName: 'Cole Egan',
          jobName: 'NYP Buckley 4 Telemetry 25831',
          hours: 2.75,
          decimalHours: '2.75',
          notes: 'Notes with a "quote" and, a comma',
        },
      ],
    },
  ],
};
