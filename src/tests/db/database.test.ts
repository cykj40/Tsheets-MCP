import { getMostRecentSyncEndDate, initDatabase, logSync } from '../../db/database.js';
import { getLastSyncDate } from '../../db/sync.js';
import { getTestDb } from '../setup.js';

describe('database initialization', () => {
  it('creates all required tables on init', () => {
    initDatabase();
    const db = getTestDb();
    const tables = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
      ORDER BY name ASC
    `).all() as Array<{ name: string }>;

    expect(tables.map(table => table.name)).toEqual(
      expect.arrayContaining(['attachments', 'jobcodes', 'sync_log', 'sqlite_sequence', 'time_entries'])
    );
  });

  it('creates all required indexes on init', () => {
    initDatabase();
    const db = getTestDb();
    const indexes = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'index'
      ORDER BY name ASC
    `).all() as Array<{ name: string }>;

    expect(indexes.map(index => index.name)).toEqual(
      expect.arrayContaining([
        'idx_entries_date',
        'idx_entries_description',
        'idx_entries_employee',
        'idx_entries_jobcode',
      ])
    );
  });

  it('does not throw when init runs twice', () => {
    expect(() => {
      initDatabase();
      initDatabase();
    }).not.toThrow();
  });

  it('returns null when sync_log is empty', () => {
    expect(getMostRecentSyncEndDate()).toBeNull();
    expect(getLastSyncDate()).toBeNull();
  });

  it('returns the most recent end_date after inserts', () => {
    logSync({
      syncType: 'range',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      syncedAt: '2026-02-01T00:00:00.000Z',
      entriesSynced: 2,
    });
    logSync({
      syncType: 'recent',
      startDate: '2026-02-01',
      endDate: '2026-02-28',
      syncedAt: '2026-03-01T00:00:00.000Z',
      entriesSynced: 5,
    });

    expect(getLastSyncDate()).toBe('2026-02-28');
  });
});
