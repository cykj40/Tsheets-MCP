import { z } from 'zod';
import { runCoverageReport, type CoverageClient } from '../coverage/run.js';
import type { CoverageResult } from '../coverage/coverage.js';

export const CoverageReportArgsSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
});

export type CoverageReportArgs = z.infer<typeof CoverageReportArgsSchema>;

/** Thin wrapper: all logic lives in src/coverage (shared with the CLI). */
export async function coverageReport(
  client: CoverageClient,
  args: CoverageReportArgs,
): Promise<CoverageResult & { warning?: string }> {
  const result = await runCoverageReport(client, args);
  return result.complete
    ? result
    : {
        warning:
          'INCOMPLETE RESULT: data was truncated or a fetch failed. Do not treat this as a full report. See issues.',
        ...result,
      };
}
