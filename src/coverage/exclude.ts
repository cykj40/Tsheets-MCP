/**
 * W1 coverage report — exclusion config (PURE: parse + compile, no I/O).
 *
 * Excludes non-job time (Lunch Break, Vacation, ...) by matching the ROOT job's
 * name or id. This is plain name/id matching, not job-type inference.
 */

import { z } from 'zod';

export const ExcludeConfigSchema = z.object({
  names: z.array(z.string()).default([]), // exact, case-insensitive
  ids: z.array(z.number()).default([]), // root jobcode ids
  patterns: z.array(z.string()).default([]), // regex source, tested case-insensitively on the name
});

export type ExcludeConfig = z.infer<typeof ExcludeConfigSchema>;

export const EMPTY_EXCLUDE: ExcludeConfig = { names: [], ids: [], patterns: [] };

export type JobMatcher = (job: { id: number; name: string }) => boolean;

/** Validate an already-parsed JSON value. Throws a readable error. */
export function parseExcludeConfig(value: unknown): ExcludeConfig {
  const parsed = ExcludeConfigSchema.safeParse(value);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new Error(`invalid exclusion config (${i.path.join('.') || 'root'}: ${i.message})`);
  }
  return parsed.data;
}

/** Compile to a predicate. A bad regex throws instead of being silently ignored. */
export function compileExclude(config: ExcludeConfig): JobMatcher {
  const names = new Set(config.names.map(n => n.trim().toLowerCase()));
  const ids = new Set(config.ids);
  const patterns = config.patterns.map(p => {
    try {
      return new RegExp(p, 'i');
    } catch (e) {
      throw new Error(`invalid exclusion pattern "${p}" (${e instanceof Error ? e.message : String(e)})`);
    }
  });
  return job =>
    ids.has(job.id) ||
    names.has(job.name.trim().toLowerCase()) ||
    patterns.some(re => re.test(job.name));
}
