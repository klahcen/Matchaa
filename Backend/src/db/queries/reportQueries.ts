import { query } from '../../config/db';

/**
 * Report data access ("fake account" flags).
 *
 * `reports` has UNIQUE(reporter_id, reported_id), so one user can only have a
 * single open report against any given target. Re-reporting is surfaced to the
 * caller as "already reported" rather than silently piling up duplicate rows.
 */

export interface ReportRow {
  id: number;
  reporter_id: number;
  reported_id: number;
  reason: string;
  created_at: Date;
}

/**
 * Files a report.
 * @returns the created row, or null when this reporter already reported this user.
 */
export const createReport = async (
  reporterId: number,
  reportedId: number,
  reason: string
): Promise<ReportRow | null> => {
  const result = await query<ReportRow>(
    `INSERT INTO reports (reporter_id, reported_id, reason)
     VALUES ($1, $2, $3)
     ON CONFLICT (reporter_id, reported_id) DO NOTHING
     RETURNING id, reporter_id, reported_id, reason, created_at`,
    [reporterId, reportedId, reason]
  );
  return result.rows[0] ?? null;
};

/** Whether this reporter has already reported this user. */
export const hasReported = async (reporterId: number, reportedId: number): Promise<boolean> => {
  const result = await query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM reports WHERE reporter_id = $1 AND reported_id = $2) AS exists`,
    [reporterId, reportedId]
  );
  return Boolean(result.rows[0]?.exists);
};

/** Count of reports filed against a user — handy for moderation later. */
export const countReportsAgainst = async (reportedId: number): Promise<number> => {
  const result = await query<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM reports WHERE reported_id = $1`,
    [reportedId]
  );
  return result.rows[0]?.count ?? 0;
};
