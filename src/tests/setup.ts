import Database from 'better-sqlite3';
import { beforeEach } from 'vitest';
import { getDatabase, setDatabaseForTests } from '../db/database.js';

const testDatabase = new Database(':memory:');
setDatabaseForTests(testDatabase);

export function getTestDb(): Database.Database {
  return getDatabase();
}

beforeEach(() => {
  const db = getTestDb();
  db.exec(`
    DELETE FROM attachments;
    DELETE FROM time_entries;
    DELETE FROM jobcodes;
    DELETE FROM sync_log;
  `);
});
