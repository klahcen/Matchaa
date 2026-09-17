import { query } from '../../config/db';

export type DateStatus = 'pending' | 'accepted' | 'declined';

export interface DateProposalRow {
  id: number;
  proposer_id: number;
  recipient_id: number;
  proposed_datetime: Date;
  location_text: string | null;
  note: string | null;
  status: DateStatus;
  created_at: Date;
  updated_at: Date;
  proposer_first_name: string;
  proposer_username: string;
  recipient_first_name: string;
  recipient_username: string;
}

const DATE_SELECT = `
  d.id, d.proposer_id, d.recipient_id, d.proposed_datetime, d.location_text,
  d.note, d.status, d.created_at, d.updated_at,
  proposer.first_name AS proposer_first_name,
  proposer.username AS proposer_username,
  recipient.first_name AS recipient_first_name,
  recipient.username AS recipient_username
`;

export const createDateProposal = async (input: {
  proposerId: number;
  recipientId: number;
  proposedDatetime: Date;
  locationText: string | null;
  note: string | null;
}): Promise<DateProposalRow> => {
  const result = await query<DateProposalRow>(
    `INSERT INTO dates (proposer_id, recipient_id, proposed_datetime, location_text, note)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, proposer_id, recipient_id, proposed_datetime, location_text, note, status, created_at, updated_at,
       (SELECT first_name FROM users WHERE id = $1) AS proposer_first_name,
       (SELECT username FROM users WHERE id = $1) AS proposer_username,
       (SELECT first_name FROM users WHERE id = $2) AS recipient_first_name,
       (SELECT username FROM users WHERE id = $2) AS recipient_username`,
    [input.proposerId, input.recipientId, input.proposedDatetime, input.locationText, input.note]
  );
  return result.rows[0]!;
};

export const getDateProposalsBetween = async (userA: number, userB: number): Promise<DateProposalRow[]> => {
  const result = await query<DateProposalRow>(
    `SELECT ${DATE_SELECT}
     FROM dates d
     JOIN users proposer ON proposer.id = d.proposer_id
     JOIN users recipient ON recipient.id = d.recipient_id
     WHERE (d.proposer_id = $1 AND d.recipient_id = $2)
        OR (d.proposer_id = $2 AND d.recipient_id = $1)
     ORDER BY d.proposed_datetime DESC, d.created_at DESC
     LIMIT 20`,
    [userA, userB]
  );
  return result.rows;
};

export const respondToDateProposal = async (
  dateId: number,
  recipientId: number,
  status: Exclude<DateStatus, 'pending'>
): Promise<DateProposalRow | null> => {
  const result = await query<DateProposalRow>(
    `UPDATE dates
     SET status = $3, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND recipient_id = $2 AND status = 'pending'
     RETURNING id, proposer_id, recipient_id, proposed_datetime, location_text, note, status, created_at, updated_at,
       (SELECT first_name FROM users WHERE id = proposer_id) AS proposer_first_name,
       (SELECT username FROM users WHERE id = proposer_id) AS proposer_username,
       (SELECT first_name FROM users WHERE id = recipient_id) AS recipient_first_name,
       (SELECT username FROM users WHERE id = recipient_id) AS recipient_username`,
    [dateId, recipientId, status]
  );
  return result.rows[0] ?? null;
};
