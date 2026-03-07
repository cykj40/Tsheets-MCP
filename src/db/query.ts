import { CachedAttachment, CachedTimeEntry, getDatabase, mapAttachmentRows, mapEntryRows } from './database.js';

function selectEntriesBase(): string {
  return `
    SELECT
      te.*,
      COUNT(a.id) AS attachment_count
    FROM time_entries te
    LEFT JOIN attachments a ON a.entry_id = te.id
  `;
}

export function getEntriesByJobcode(jobcodeId: number): CachedTimeEntry[] {
  const db = getDatabase();
  const rows = db.prepare(`
    WITH RECURSIVE descendants(id) AS (
      SELECT ?
      UNION ALL
      SELECT j.id
      FROM jobcodes j
      JOIN descendants d ON j.parent_id = d.id
    )
    ${selectEntriesBase()}
    WHERE te.jobcode_id IN (SELECT id FROM descendants)
    GROUP BY te.id
    ORDER BY te.date ASC, te.employee_name ASC
  `).all(jobcodeId) as Record<string, unknown>[];

  return mapEntryRows(rows);
}

export function getEntriesByDateRange(
  startDate: string,
  endDate: string,
  jobcodeId?: number
): CachedTimeEntry[] {
  const db = getDatabase();

  if (jobcodeId !== undefined) {
    const rows = db.prepare(`
      WITH RECURSIVE descendants(id) AS (
        SELECT ?
        UNION ALL
        SELECT j.id
        FROM jobcodes j
        JOIN descendants d ON j.parent_id = d.id
      )
      ${selectEntriesBase()}
      WHERE te.date BETWEEN ? AND ?
        AND te.jobcode_id IN (SELECT id FROM descendants)
      GROUP BY te.id
      ORDER BY te.date ASC, te.employee_name ASC
    `).all(jobcodeId, startDate, endDate) as Record<string, unknown>[];

    return mapEntryRows(rows);
  }

  const rows = db.prepare(`
    ${selectEntriesBase()}
    WHERE te.date BETWEEN ? AND ?
    GROUP BY te.id
    ORDER BY te.date ASC, te.employee_name ASC
  `).all(startDate, endDate) as Record<string, unknown>[];

  return mapEntryRows(rows);
}

export function searchEntriesByJobName(searchTerm: string): CachedTimeEntry[] {
  const db = getDatabase();
  const rows = db.prepare(`
    ${selectEntriesBase()}
    WHERE te.job_name LIKE ?
    GROUP BY te.id
    ORDER BY te.date ASC, te.employee_name ASC
  `).all(`%${searchTerm}%`) as Record<string, unknown>[];

  return mapEntryRows(rows);
}

export function getAttachmentsForEntry(entryId: string): CachedAttachment[] {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT id, entry_id, file_name, file_url, file_size
    FROM attachments
    WHERE entry_id = ?
    ORDER BY file_name ASC
  `).all(entryId) as Record<string, unknown>[];

  return mapAttachmentRows(rows);
}

export function getDistinctJobcodes(): Array<{ jobcodeId: number; jobName: string; totalEntries: number }> {
  const db = getDatabase();
  const rows = db.prepare(`
    SELECT
      te.jobcode_id AS jobcode_id,
      COALESCE(j.name, MIN(te.job_name)) AS job_name,
      COUNT(*) AS total_entries
    FROM time_entries te
    LEFT JOIN jobcodes j ON j.id = te.jobcode_id
    WHERE te.jobcode_id IS NOT NULL
    GROUP BY te.jobcode_id
    ORDER BY job_name ASC
  `).all() as Array<{
    jobcode_id: number;
    job_name: string;
    total_entries: number;
  }>;

  return rows.map(row => ({
    jobcodeId: row.jobcode_id,
    jobName: row.job_name,
    totalEntries: row.total_entries,
  }));
}
