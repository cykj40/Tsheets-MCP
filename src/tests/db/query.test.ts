import { getAttachmentsForEntry, getDistinctJobcodes, getEntriesByDateRange, getEntriesByJobcode, searchEntriesByJobName } from '../../db/query.js';
import { upsertJobcodes, upsertTimeEntries, replaceAttachments } from '../../db/database.js';

describe('db query functions', () => {
  beforeEach(() => {
    upsertJobcodes([
      {
        id: 10001,
        name: 'Acme Clinic Renovation',
        short_code: '10001',
        parent_id: undefined,
        active: true,
        has_children: true,
        type: 'regular',
      },
      {
        id: 1030,
        name: '1030 GENERAL LABOR',
        short_code: '1030',
        parent_id: 10001,
        active: true,
        has_children: false,
        type: 'regular',
      },
      {
        id: 10002,
        name: 'Acme Lab Expansion',
        short_code: '10002',
        parent_id: undefined,
        active: true,
        has_children: false,
        type: 'regular',
      },
    ], '2026-03-07T00:00:00.000Z');

    upsertTimeEntries([
      {
        id: 'entry-2',
        date: '2026-02-05',
        employeeName: 'Zed Alpha',
        jobName: 'Acme Clinic Renovation 10001 10001 \u203A 1030 GENERAL LABOR 1030',
        jobcodeId: 1030,
        hours: 4.5,
        minutes: 30,
        description: 'Worked with Herman all day',
        billableStatus: 'NotBillable',
        hourlyRate: 0,
        createdAt: null,
        lastSynced: '2026-03-07T00:00:00.000Z',
      },
      {
        id: 'entry-1',
        date: '2026-02-05',
        employeeName: 'Amy Beta',
        jobName: 'Acme Clinic Renovation 10001 10001 \u203A 1040 SUPERVISION 1040',
        jobcodeId: 10001,
        hours: 8.5,
        minutes: 30,
        description: 'Supervision',
        billableStatus: 'NotBillable',
        hourlyRate: 0,
        createdAt: null,
        lastSynced: '2026-03-07T00:00:00.000Z',
      },
      {
        id: 'entry-3',
        date: '2026-02-06',
        employeeName: 'Jane Doe',
        jobName: 'Acme Lab Expansion 10002',
        jobcodeId: 10002,
        hours: 7,
        minutes: 0,
        description: 'Other job work',
        billableStatus: 'NotBillable',
        hourlyRate: 0,
        createdAt: null,
        lastSynced: '2026-03-07T00:00:00.000Z',
      },
    ]);

    replaceAttachments(['entry-1', 'entry-2'], [
      {
        id: 'att-1',
        entryId: 'entry-1',
        fileName: 'IMG_001.png',
        fileUrl: '',
        fileSize: 123,
      },
      {
        id: 'att-2',
        entryId: 'entry-1',
        fileName: 'IMG_002.png',
        fileUrl: '',
        fileSize: 456,
      },
    ]);
  });

  describe('getEntriesByJobcode', () => {
    it('returns all entries for that jobcode', () => {
      const entries = getEntriesByJobcode(10001);
      expect(entries).toHaveLength(2);
    });

    it('returns empty array when jobcode has no entries', () => {
      expect(getEntriesByJobcode(123456)).toEqual([]);
    });

    it('returns results sorted by date ascending then employee_name ascending', () => {
      const entries = getEntriesByJobcode(10001);
      expect(entries.map(entry => entry.id)).toEqual(['entry-1', 'entry-2']);
    });

    it('does not include entries from other jobcodes', () => {
      const entries = getEntriesByJobcode(10001);
      expect(entries.some(entry => entry.jobcodeId === 10002)).toBe(false);
    });
  });

  describe('getEntriesByDateRange', () => {
    it('returns entries within range inclusive', () => {
      const entries = getEntriesByDateRange('2026-02-05', '2026-02-05');
      expect(entries.map(entry => entry.id)).toEqual(['entry-1', 'entry-2']);
    });

    it('excludes entries outside the range', () => {
      const entries = getEntriesByDateRange('2026-02-06', '2026-02-06');
      expect(entries.map(entry => entry.id)).toEqual(['entry-3']);
    });

    it('applies the optional jobcodeId filter correctly', () => {
      const entries = getEntriesByDateRange('2026-02-01', '2026-02-10', 10001);
      expect(entries.map(entry => entry.id)).toEqual(['entry-1', 'entry-2']);
    });

    it('returns empty array when no entries match', () => {
      expect(getEntriesByDateRange('2026-01-01', '2026-01-02')).toEqual([]);
    });
  });

  describe('searchEntriesByJobName', () => {
    it('returns partial matches', () => {
      const entries = searchEntriesByJobName('Clinic');
      expect(entries).toHaveLength(2);
    });

    it('is case insensitive', () => {
      const entries = searchEntriesByJobName('clinic');
      expect(entries).toHaveLength(2);
    });

    it('returns empty array when no job names match', () => {
      expect(searchEntriesByJobName('NoSuchProject')).toEqual([]);
    });
  });

  describe('getAttachmentsForEntry', () => {
    it('returns all attachments for an entry', () => {
      expect(getAttachmentsForEntry('entry-1')).toHaveLength(2);
    });

    it('returns empty array for entry with no attachments', () => {
      expect(getAttachmentsForEntry('entry-2')).toEqual([]);
    });
  });

  describe('getDistinctJobcodes', () => {
    it('returns unique jobcodes with the correct totalEntries count', () => {
      expect(getDistinctJobcodes()).toEqual([
        {
          jobcodeId: 1030,
          jobName: '1030 GENERAL LABOR',
          totalEntries: 1,
        },
        {
          jobcodeId: 10001,
          jobName: 'Acme Clinic Renovation',
          totalEntries: 1,
        },
        {
          jobcodeId: 10002,
          jobName: 'Acme Lab Expansion',
          totalEntries: 1,
        },
      ]);
    });

    it('returns jobcodes sorted by jobcodeId', () => {
      const jobcodes = getDistinctJobcodes();
      expect(jobcodes.map(jobcode => jobcode.jobcodeId)).toEqual([1030, 10001, 10002]);
    });
  });
});
