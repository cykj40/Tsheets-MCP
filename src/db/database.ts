import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Jobcode } from '../types/tsheets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_DIR = resolve(__dirname, '../..');
const DATA_DIR = process.env.TSHEETS_DB_PATH
  ? resolve(process.env.TSHEETS_DB_PATH, '..')
  : resolve(PROJECT_DIR, 'data');
const DATABASE_PATH = process.env.TSHEETS_DB_PATH
  ? resolve(process.env.TSHEETS_DB_PATH)
  : resolve(DATA_DIR, 'tsheets-cache.db');

let database: Database.Database | null = null;

export interface CachedTimeEntry {
  id: string;
  date: string;
  employeeName: string;
  jobName: string;
  jobcodeId: number | null;
  hours: number;
  minutes: number;
  description: string | null;
  billableStatus: string | null;
  hourlyRate: number;
  createdAt: string | null;
  lastSynced: string;
  attachmentCount: number;
}

export interface CachedAttachment {
  id: string;
  entryId: string;
  fileName: string;
  fileUrl: string | null;
  fileSize: number | null;
}

export interface SyncResult {
  startDate: string;
  endDate: string;
  entriesSynced: number;
  attachmentsSynced: number;
  jobcodesSynced: number;
}

interface TimeEntryUpsertRow {
  id: string;
  date: string;
  employeeName: string;
  jobName: string;
  jobcodeId: number | null;
  hours: number;
  minutes: number;
  description: string | null;
  billableStatus: string | null;
  hourlyRate: number;
  createdAt: string | null;
  lastSynced: string;
}

interface AttachmentUpsertRow {
  id: string;
  entryId: string;
  fileName: string;
  fileUrl: string | null;
  fileSize: number | null;
}

interface SyncLogRow {
  syncType: string;
  startDate?: string;
  endDate?: string;
  entriesSynced?: number;
  syncedAt: string;
  status?: 'success' | 'error';
  error?: string;
}

function mapCachedEntry(row: Record<string, unknown>): CachedTimeEntry {
  return {
    id: String(row.id),
    date: String(row.date),
    employeeName: String(row.employee_name),
    jobName: String(row.job_name),
    jobcodeId: row.jobcode_id === null || row.jobcode_id === undefined ? null : Number(row.jobcode_id),
    hours: Number(row.hours),
    minutes: Number(row.minutes),
    description: row.description === null || row.description === undefined ? null : String(row.description),
    billableStatus: row.billable_status === null || row.billable_status === undefined ? null : String(row.billable_status),
    hourlyRate: Number(row.hourly_rate ?? 0),
    createdAt: row.created_at === null || row.created_at === undefined ? null : String(row.created_at),
    lastSynced: String(row.last_synced),
    attachmentCount: Number(row.attachment_count ?? 0),
  };
}

export function getDatabasePath(): string {
  return DATABASE_PATH;
}

export function initDatabase(): Database.Database {
  if (database) {
    ensureSchema(database);
    return database;
  }

  mkdirSync(DATA_DIR, { recursive: true });

  database = new Database(DATABASE_PATH);
  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  ensureSchema(database);

  return database;
}

function ensureSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS time_entries (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      job_name TEXT NOT NULL,
      jobcode_id INTEGER,
      hours REAL NOT NULL,
      minutes INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      billable_status TEXT,
      hourly_rate REAL DEFAULT 0,
      created_at TEXT,
      last_synced TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_url TEXT,
      file_size INTEGER,
      FOREIGN KEY (entry_id) REFERENCES time_entries(id)
    );

    CREATE TABLE IF NOT EXISTS jobcodes (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      short_code TEXT,
      parent_id INTEGER,
      active INTEGER DEFAULT 1,
      last_synced TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_type TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      entries_synced INTEGER DEFAULT 0,
      synced_at TEXT NOT NULL,
      status TEXT DEFAULT 'success',
      error TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_entries_date ON time_entries(date);
    CREATE INDEX IF NOT EXISTS idx_entries_jobcode ON time_entries(jobcode_id);
    CREATE INDEX IF NOT EXISTS idx_entries_employee ON time_entries(employee_name);
    CREATE INDEX IF NOT EXISTS idx_entries_description ON time_entries(description);
  `);
}

export function getDatabase(): Database.Database {
  return initDatabase();
}

export function setDatabaseForTests(testDatabase: Database.Database): Database.Database {
  database = testDatabase;
  database.pragma('foreign_keys = ON');
  ensureSchema(database);
  return database;
}

export function resetDatabaseForTests(): void {
  if (database) {
    database.close();
  }
  database = null;
}

export function upsertTimeEntries(entries: TimeEntryUpsertRow[]): void {
  if (entries.length === 0) {
    return;
  }

  const db = getDatabase();
  const insert = db.prepare(`
    INSERT OR REPLACE INTO time_entries (
      id, date, employee_name, job_name, jobcode_id, hours, minutes,
      description, billable_status, hourly_rate, created_at, last_synced
    ) VALUES (
      @id, @date, @employeeName, @jobName, @jobcodeId, @hours, @minutes,
      @description, @billableStatus, @hourlyRate, @createdAt, @lastSynced
    )
  `);

  const transaction = db.transaction((rows: TimeEntryUpsertRow[]) => {
    for (const row of rows) {
      insert.run(row);
    }
  });

  transaction(entries);
}

export function replaceAttachments(entryIds: string[], attachments: AttachmentUpsertRow[]): void {
  const db = getDatabase();
  const uniqueEntryIds = [...new Set(entryIds)];
  const deleteByEntry = db.prepare('DELETE FROM attachments WHERE entry_id = ?');
  const insert = db.prepare(`
    INSERT OR REPLACE INTO attachments (
      id, entry_id, file_name, file_url, file_size
    ) VALUES (
      @id, @entryId, @fileName, @fileUrl, @fileSize
    )
  `);

  const transaction = db.transaction((rows: AttachmentUpsertRow[]) => {
    for (const entryId of uniqueEntryIds) {
      deleteByEntry.run(entryId);
    }

    for (const row of rows) {
      insert.run(row);
    }
  });

  transaction(attachments);
}

export function upsertJobcodes(jobcodes: Jobcode[], lastSynced: string): void {
  if (jobcodes.length === 0) {
    return;
  }

  const db = getDatabase();
  const insert = db.prepare(`
    INSERT OR REPLACE INTO jobcodes (
      id, name, short_code, parent_id, active, last_synced
    ) VALUES (
      @id, @name, @short_code, @parent_id, @active, @last_synced
    )
  `);

  const transaction = db.transaction((rows: Jobcode[]) => {
    for (const row of rows) {
      insert.run({
        id: row.id,
        name: row.name,
        short_code: row.short_code ?? null,
        parent_id: row.parent_id ?? null,
        active: row.active ? 1 : 0,
        last_synced: lastSynced,
      });
    }
  });

  transaction(jobcodes);
}

export function logSync(row: SyncLogRow): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO sync_log (
      sync_type, start_date, end_date, entries_synced, synced_at, status, error
    ) VALUES (
      @syncType, @startDate, @endDate, @entriesSynced, @syncedAt, @status, @error
    )
  `).run({
    syncType: row.syncType,
    startDate: row.startDate ?? null,
    endDate: row.endDate ?? null,
    entriesSynced: row.entriesSynced ?? 0,
    syncedAt: row.syncedAt,
    status: row.status ?? 'success',
    error: row.error ?? null,
  });
}

export function getMostRecentSyncEndDate(): string | null {
  const db = getDatabase();
  const row = db.prepare(`
    SELECT end_date
    FROM sync_log
    WHERE status = 'success' AND end_date IS NOT NULL
    ORDER BY synced_at DESC
    LIMIT 1
  `).get() as { end_date?: string } | undefined;

  return row?.end_date ?? null;
}

export function mapEntryRows(rows: Record<string, unknown>[]): CachedTimeEntry[] {
  return rows.map(mapCachedEntry);
}

export function mapAttachmentRows(rows: Record<string, unknown>[]): CachedAttachment[] {
  return rows.map(row => ({
    id: String(row.id),
    entryId: String(row.entry_id),
    fileName: String(row.file_name),
    fileUrl: row.file_url === null || row.file_url === undefined ? null : String(row.file_url),
    fileSize: row.file_size === null || row.file_size === undefined ? null : Number(row.file_size),
  }));
}
