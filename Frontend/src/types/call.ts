export type CallType = 'audio' | 'video';

export interface IncomingCall {
  callId: string;
  callType: CallType;
  fromUserId: number;
  from_user?: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
  };
}
