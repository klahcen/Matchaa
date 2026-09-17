import React from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../../context/SocketContext';

export const IncomingCallToast: React.FC = () => {
  const navigate = useNavigate();
  const { incomingCall, rejectIncomingCall } = useSocket();

  if (!incomingCall) return null;

  const callerName = incomingCall.from_user?.first_name || 'A connected user';
  const Icon = incomingCall.callType === 'video' ? Video : Phone;

  return (
    <div className="fixed right-4 top-[84px] z-50 w-[min(360px,calc(100vw-2rem))] rounded-3xl border border-brand-accent/20 bg-brand-surface shadow-2xl shadow-brand-accent/20 p-4">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-brand-accent/10 text-brand-accent flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-brand-text">Incoming {incomingCall.callType} call</p>
          <p className="text-sm text-brand-muted mt-0.5 truncate">{callerName} is calling you</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mt-4">
        <button
          type="button"
          onClick={() => navigate(`/chat/${incomingCall.fromUserId}`)}
          className="inline-flex items-center justify-center gap-1.5 min-h-[42px] rounded-full bg-emerald-500 text-white text-xs font-black uppercase tracking-wider"
        >
          <Phone className="w-4 h-4" /> Open
        </button>
        <button
          type="button"
          onClick={rejectIncomingCall}
          className="inline-flex items-center justify-center gap-1.5 min-h-[42px] rounded-full bg-brand-error-bg text-brand-error-text text-xs font-black uppercase tracking-wider"
        >
          <PhoneOff className="w-4 h-4" /> Decline
        </button>
      </div>
    </div>
  );
};
