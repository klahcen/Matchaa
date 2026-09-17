export type DateStatus = 'pending' | 'accepted' | 'declined';

export interface DateProposal {
  id: number;
  proposer_id: number;
  recipient_id: number;
  proposed_datetime: string;
  location_text: string | null;
  note: string | null;
  status: DateStatus;
  created_at: string;
  updated_at: string;
  proposer_first_name: string;
  proposer_username: string;
  recipient_first_name: string;
  recipient_username: string;
}

export interface DateProposalPayload {
  recipient_id: number;
  proposed_datetime: string;
  location_text?: string;
  note?: string;
}
