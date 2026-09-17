import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CalendarDays, Check, MessageCircle, Mic, MicOff, Phone, PhoneOff, Send, CheckCheck, Video, VideoOff, X } from 'lucide-react';
import { chatApi } from '../api/chat';
import { dateApi } from '../api/date';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import { resolveMediaUrl } from '../api/profile';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { PrimaryButton } from '../components/common/PrimaryButton';
import { FameBadge } from '../components/profile/FameBadge';
import type { Conversation, Message } from '../types/chat';
import type { DateProposal } from '../types/date';
import type { CallType } from '../types/call';

const MESSAGE_PAGE_SIZE = 50;

const minDateTimeLocal = (): string => {
  const date = new Date(Date.now() + 30 * 60 * 1000);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
};

const formatDateProposalTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return date.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

type CallPhase = 'idle' | 'incoming' | 'calling' | 'connecting' | 'active';

const createCallId = (): string =>
  crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const ChatPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { userId } = useParams<{ userId: string }>();
  const {
    socket,
    conversations,
    unreadMessageCount,
    incomingCall,
    clearIncomingCall,
    rejectIncomingCall: rejectSharedIncomingCall,
    setConversations,
    markConversationRead,
  } = useSocket();

  const currentUserId = user?.id ?? 0;
  const targetUserId = Number.parseInt(String(userId), 10);
  const isConversationView = !!userId && Number.isInteger(targetUserId) && targetUserId > 0;

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [targetUser, setTargetUser] = useState<Conversation | null>(null);
  const [messageText, setMessageText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [dateProposals, setDateProposals] = useState<DateProposal[]>([]);
  const [showDateForm, setShowDateForm] = useState(false);
  const [dateSaving, setDateSaving] = useState(false);
  const [dateDraft, setDateDraft] = useState({ proposed_datetime: '', location_text: '', note: '' });
  const [callPhase, setCallPhase] = useState<CallPhase>('idle');
  const [callType, setCallType] = useState<CallType>('audio');
  const [callPeerName, setCallPeerName] = useState('');
  const [callError, setCallError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const loadingRef = useRef(false);
  const messagesRef = useRef<Message[]>([]);
  const activeConversationIdRef = useRef<number | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const currentCallRef = useRef<{ callId: string; peerId: number } | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const loadConversations = useCallback(async () => {
    try {
      const data = await chatApi.getConversations();
      setConversations(data.conversations);
    } catch (err: any) {
      console.error('Failed to load conversations:', err);
    }
  }, [setConversations]);

  const loadMessages = useCallback(async (conversation: Conversation, reset = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const beforeId = reset ? undefined : messagesRef.current[0]?.id;
      const data = await chatApi.getMessages(conversation.id, { limit: MESSAGE_PAGE_SIZE, beforeId });
      const newMessages = data.messages;
      if (reset || !beforeId) {
        setMessages(newMessages);
      } else {
        setMessages((prev) => [...newMessages, ...prev]);
      }
      setHasMore(newMessages.length === MESSAGE_PAGE_SIZE);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load messages');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  const loadDateProposals = useCallback(async (otherUserId: number, signal?: AbortSignal) => {
    try {
      const data = await dateApi.getWithUser(otherUserId, signal);
      setDateProposals(data.dates);
    } catch (err: any) {
      if (signal?.aborted) return;
      console.error('Failed to load date proposals:', err);
    }
  }, []);

  useEffect(() => {
    if (!isConversationView) {
      activeConversationIdRef.current = null;
      setTargetUser((current) => (current === null ? current : null));
      setMessages((current) => (current.length === 0 ? current : []));
      setLoading(false);
      return;
    }

    if (targetUserId === currentUserId) {
      navigate('/chat');
      return;
    }

    const conv = conversations.find((c) => c.id === targetUserId);
    if (!conv) {
      activeConversationIdRef.current = null;
      setError('Conversation not found or you are no longer connected');
      setLoading(false);
      return;
    }

    setError(null);
    setTargetUser((current) => (current?.id === conv.id ? current : conv));
    markConversationRead(targetUserId);

    if (activeConversationIdRef.current === conv.id) return;

    activeConversationIdRef.current = conv.id;
    setMessages([]);
    void loadMessages(conv, true);
  }, [conversations, currentUserId, isConversationView, loadMessages, markConversationRead, navigate, targetUserId]);

  useEffect(() => {
    if (!targetUser) {
      setDateProposals([]);
      setShowDateForm(false);
      return;
    }

    const controller = new AbortController();
    void loadDateProposals(targetUser.id, controller.signal);
    return () => controller.abort();
  }, [loadDateProposals, targetUser]);


  const attachLocalStream = useCallback((stream: MediaStream | null) => {
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
  }, []);

  const attachRemoteStream = useCallback((stream: MediaStream | null) => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
  }, []);

  const finishCall = useCallback((notice?: string) => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    currentCallRef.current = null;
    attachLocalStream(null);
    attachRemoteStream(null);
    setCallPhase('idle');
    clearIncomingCall();
    setCallPeerName('');
    setIsMuted(false);
    setIsCameraOff(false);
    if (notice) setCallError(notice);
  }, [attachLocalStream, attachRemoteStream, clearIncomingCall]);

  const prepareLocalMedia = useCallback(async (type: CallType) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser cannot access microphone/camera devices');
    }

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
    localStreamRef.current = stream;
    attachLocalStream(stream);
    setIsMuted(false);
    setIsCameraOff(false);
    return stream;
  }, [attachLocalStream]);

  const createPeerConnection = useCallback((peerId: number, callId: string) => {
    peerConnectionRef.current?.close();
    remoteStreamRef.current = new MediaStream();
    attachRemoteStream(remoteStreamRef.current);

    const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket?.emit('call:ice-candidate', { receiverId: peerId, callId, candidate: event.candidate.toJSON() });
      }
    };

    peer.ontrack = (event) => {
      const remoteStream = remoteStreamRef.current ?? new MediaStream();
      event.streams[0]?.getTracks().forEach((track) => {
        if (!remoteStream.getTracks().some((existing) => existing.id === track.id)) {
          remoteStream.addTrack(track);
        }
      });
      remoteStreamRef.current = remoteStream;
      attachRemoteStream(remoteStream);
      setCallPhase('active');
    };

    peerConnectionRef.current = peer;
    return peer;
  }, [attachRemoteStream, socket]);

  const startCall = useCallback(async (type: CallType) => {
    if (!targetUser || !socket || callPhase !== 'idle') return;

    const nextCallId = createCallId();
    setCallError(null);
    setCallType(type);
    setCallPeerName(`${targetUser.first_name} ${targetUser.last_name}`.trim());
    setCallPhase('calling');

    try {
      const stream = await prepareLocalMedia(type);
      const peer = createPeerConnection(targetUser.id, nextCallId);
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      currentCallRef.current = { callId: nextCallId, peerId: targetUser.id };

      socket.emit('call:invite', { receiverId: targetUser.id, callId: nextCallId, callType: type }, (response: any) => {
        if (!response?.success) finishCall(response?.error || 'Call failed');
      });
    } catch (err: any) {
      finishCall(err?.message || 'Could not start call');
    }
  }, [callPhase, createPeerConnection, finishCall, prepareLocalMedia, socket, targetUser]);

  const acceptCall = useCallback(async () => {
    if (!incomingCall || !socket) return;

    setCallError(null);
    setCallType(incomingCall.callType);
    setCallPeerName(incomingCall.from_user?.first_name || 'Incoming call');
    setCallPhase('connecting');

    try {
      const stream = await prepareLocalMedia(incomingCall.callType);
      const peer = createPeerConnection(incomingCall.fromUserId, incomingCall.callId);
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      currentCallRef.current = { callId: incomingCall.callId, peerId: incomingCall.fromUserId };
      socket.emit('call:accept', { callerId: incomingCall.fromUserId, callId: incomingCall.callId }, (response: any) => {
        if (!response?.success) finishCall(response?.error || 'Could not accept call');
      });
      clearIncomingCall();
      if (!isConversationView || targetUserId !== incomingCall.fromUserId) {
        navigate(`/chat/${incomingCall.fromUserId}`);
      }
    } catch (err: any) {
      finishCall(err?.message || 'Could not accept call');
    }
  }, [clearIncomingCall, createPeerConnection, finishCall, incomingCall, isConversationView, navigate, prepareLocalMedia, socket, targetUserId]);

  const rejectIncomingCall = useCallback(() => {
    rejectSharedIncomingCall();
    finishCall();
  }, [finishCall, rejectSharedIncomingCall]);

  const endCall = useCallback(() => {
    const activeCall = currentCallRef.current;
    if (activeCall && socket) {
      socket.emit(callPhase === 'calling' ? 'call:cancel' : 'call:end', {
        receiverId: activeCall.peerId,
        callId: activeCall.callId,
      });
    }
    finishCall();
  }, [callPhase, finishCall, socket]);

  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  }, [isMuted]);

  const toggleCamera = useCallback(() => {
    const nextCameraOff = !isCameraOff;
    localStreamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = !nextCameraOff;
    });
    setIsCameraOff(nextCameraOff);
  }, [isCameraOff]);

  useEffect(() => {
    if (!incomingCall || !isConversationView || targetUserId !== incomingCall.fromUserId) return;

    if (currentCallRef.current || (callPhase !== 'idle' && callPhase !== 'incoming')) {
      rejectSharedIncomingCall();
      return;
    }

    setCallError(null);
    setCallType(incomingCall.callType);
    setCallPeerName(incomingCall.from_user?.first_name || 'Incoming call');
    setCallPhase('incoming');
  }, [callPhase, incomingCall, isConversationView, rejectSharedIncomingCall, targetUserId]);

  useEffect(() => {
    if (!socket) return;

    const handleAccepted = async (data: { callId: string; fromUserId: number }) => {
      const activeCall = currentCallRef.current;
      const peer = peerConnectionRef.current;
      if (!activeCall || !peer || activeCall.callId !== data.callId) return;

      try {
        setCallPhase('connecting');
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit('call:offer', { receiverId: data.fromUserId, callId: data.callId, offer });
      } catch (err: any) {
        finishCall(err?.message || 'Could not connect call');
      }
    };

    const handleOffer = async (data: { callId: string; fromUserId: number; offer: RTCSessionDescriptionInit }) => {
      const activeCall = currentCallRef.current;
      const peer = peerConnectionRef.current;
      if (!activeCall || !peer || activeCall.callId !== data.callId) return;

      try {
        await peer.setRemoteDescription(data.offer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit('call:answer', { receiverId: data.fromUserId, callId: data.callId, answer });
        setCallPhase('active');
      } catch (err: any) {
        finishCall(err?.message || 'Could not answer call');
      }
    };

    const handleAnswer = async (data: { callId: string; answer: RTCSessionDescriptionInit }) => {
      const activeCall = currentCallRef.current;
      const peer = peerConnectionRef.current;
      if (!activeCall || !peer || activeCall.callId !== data.callId) return;

      try {
        await peer.setRemoteDescription(data.answer);
        setCallPhase('active');
      } catch (err: any) {
        finishCall(err?.message || 'Could not finish call connection');
      }
    };

    const handleIceCandidate = async (data: { callId: string; candidate: RTCIceCandidateInit }) => {
      const activeCall = currentCallRef.current;
      const peer = peerConnectionRef.current;
      if (!activeCall || !peer || activeCall.callId !== data.callId) return;
      try {
        await peer.addIceCandidate(data.candidate);
      } catch (err) {
        console.error('Failed to add ICE candidate:', err);
      }
    };

    const handleRejected = (data: { callId: string }) => {
      if (currentCallRef.current?.callId === data.callId) finishCall('Call declined');
    };

    const handleEnded = (data: { callId: string }) => {
      if (currentCallRef.current?.callId === data.callId || incomingCall?.callId === data.callId) {
        finishCall('Call ended');
      }
    };

    socket.on('call:accepted', handleAccepted);
    socket.on('call:offer', handleOffer);
    socket.on('call:answer', handleAnswer);
    socket.on('call:ice-candidate', handleIceCandidate);
    socket.on('call:rejected', handleRejected);
    socket.on('call:cancelled', handleEnded);
    socket.on('call:ended', handleEnded);

    return () => {
      socket.off('call:accepted', handleAccepted);
      socket.off('call:offer', handleOffer);
      socket.off('call:answer', handleAnswer);
      socket.off('call:ice-candidate', handleIceCandidate);
      socket.off('call:rejected', handleRejected);
      socket.off('call:cancelled', handleEnded);
      socket.off('call:ended', handleEnded);
    };
  }, [finishCall, incomingCall?.callId, socket]);

  useEffect(() => () => finishCall(), [finishCall]);

  const handleSendMessage = useCallback(async () => {
    if (!targetUser || !messageText.trim() || sending || !socket) return;

    const content = messageText.trim();
    setMessageText('');
    setSending(true);

    socket.emit('message:send', { receiverId: targetUser.id, content }, (response: any) => {
      setSending(false);
      if (!response.success) {
        setError(response.error || 'Failed to send message');
        setMessageText(content);
      }
    });
  }, [targetUser, messageText, sending, socket]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };


  const handleProposeDate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!targetUser || dateSaving) return;
    setDateSaving(true);
    setError(null);
    try {
      const result = await dateApi.propose({
        recipient_id: targetUser.id,
        proposed_datetime: dateDraft.proposed_datetime,
        location_text: dateDraft.location_text,
        note: dateDraft.note,
      });
      setDateProposals((prev) => (prev.some((item) => item.id === result.date.id) ? prev : [result.date, ...prev]));
      setDateDraft({ proposed_datetime: '', location_text: '', note: '' });
      setShowDateForm(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to propose date');
    } finally {
      setDateSaving(false);
    }
  };

  const handleRespondToDate = async (proposal: DateProposal, status: 'accepted' | 'declined') => {
    setDateSaving(true);
    setError(null);
    try {
      const result = await dateApi.respond(proposal.id, status);
      setDateProposals((prev) => prev.map((item) => (item.id === proposal.id ? result.date : item)));
    } catch (err: any) {
      setError(err?.message || `Failed to ${status} date proposal`);
    } finally {
      setDateSaving(false);
    }
  };

  useEffect(() => {
    if (!socket || !targetUser) return;

    const appendIfActive = (message: Message) => {
      const belongsToOpenChat =
        message.sender_id === targetUser.id || message.receiver_id === targetUser.id;
      if (!belongsToOpenChat) return;

      setMessages((prev) => {
        if (prev.some((existing) => existing.id === message.id)) return prev;
        return [...prev, message];
      });

      if (message.sender_id === targetUser.id) markConversationRead(targetUser.id);
    };

    const handleNewMessage = (message: Message) => appendIfActive(message);
    const handleSentMessage = (data: any) => {
      if (data?.success && data.message) appendIfActive(data.message as Message);
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:sent', handleSentMessage);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:sent', handleSentMessage);
    };
  }, [markConversationRead, socket, targetUser]);


  useEffect(() => {
    if (!socket || !targetUser) return;

    const belongsToOpenDateThread = (proposal: DateProposal) =>
      (proposal.proposer_id === currentUserId && proposal.recipient_id === targetUser.id) ||
      (proposal.proposer_id === targetUser.id && proposal.recipient_id === currentUserId);

    const handleNewDate = (proposal: DateProposal) => {
      if (!belongsToOpenDateThread(proposal)) return;
      setDateProposals((prev) => (prev.some((item) => item.id === proposal.id) ? prev : [proposal, ...prev]));
    };

    const handleUpdatedDate = (proposal: DateProposal) => {
      if (!belongsToOpenDateThread(proposal)) return;
      setDateProposals((prev) => prev.map((item) => (item.id === proposal.id ? proposal : item)));
    };

    socket.on('date:new', handleNewDate);
    socket.on('date:updated', handleUpdatedDate);

    return () => {
      socket.off('date:new', handleNewDate);
      socket.off('date:updated', handleUpdatedDate);
    };
  }, [currentUserId, socket, targetUser]);

  const handleScroll = useCallback(() => {
    if (messagesContainerRef.current && messagesContainerRef.current.scrollTop === 0 && hasMore && !loadingRef.current) {
      if (targetUser) loadMessages(targetUser, false);
    }
  }, [hasMore, loadMessages, targetUser]);

  const formatMessageTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatNotificationTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading && !isConversationView) {
    return (
      <div className="min-h-screen w-full bg-brand-bg flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-brand-accent/30 border-t-brand-accent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={`${isConversationView ? 'h-[calc(100vh-68px)] overflow-hidden' : 'min-h-[calc(100vh-68px)]'} w-full bg-brand-bg flex flex-col`}>
      <main className={`${isConversationView ? 'flex-1 min-h-0 py-4 sm:py-6' : 'flex-1 py-6'} max-w-5xl mx-auto w-full px-4 sm:px-6`}>
        {error && (
          <ErrorBanner message={error} onDismiss={() => setError(null)} />
        )}

        {isConversationView ? (
          /* Conversation View */
          <div className="h-full min-h-0 bg-brand-surface rounded-3xl shadow-md border border-brand-border flex flex-col overflow-hidden">
            {/* Conversation Header */}
            {targetUser && (
              <div className="flex items-center gap-3 px-4 py-3 border-b border-brand-border bg-brand-bg/50">
                <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0">
                  {targetUser.photo_url ? (
                    <img src={resolveMediaUrl(targetUser.photo_url) ?? ''} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-brand-start/15 via-brand-mid/15 to-brand-end/15 flex items-center justify-center">
                      <span className="text-2xl font-black text-brand-accent/50">
                        {targetUser.first_name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <Link to={`/profile/${targetUser.id}`} className="block">
                    <p className="font-black text-brand-text truncate">{targetUser.first_name} {targetUser.last_name}</p>
                  </Link>
                  <p className="text-xs text-brand-muted">@{targetUser.username}</p>
                </div>
                <button
                  type="button"
                  onClick={() => startCall('audio')}
                  disabled={!socket || callPhase !== 'idle'}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-black uppercase tracking-wider hover:bg-emerald-500 hover:text-white transition-colors disabled:opacity-40 disabled:pointer-events-none"
                  title="Start audio call"
                >
                  <Phone className="w-4 h-4" /> Audio
                </button>
                <button
                  type="button"
                  onClick={() => startCall('video')}
                  disabled={!socket || callPhase !== 'idle'}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-sky-500/10 text-sky-600 text-xs font-black uppercase tracking-wider hover:bg-sky-500 hover:text-white transition-colors disabled:opacity-40 disabled:pointer-events-none"
                  title="Start video call"
                >
                  <Video className="w-4 h-4" /> Video
                </button>
                <button
                  type="button"
                  onClick={() => setShowDateForm((open) => !open)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-brand-accent/10 text-brand-accent text-xs font-black uppercase tracking-wider hover:bg-brand-accent hover:text-white transition-colors"
                >
                  <CalendarDays className="w-4 h-4" /> Date
                </button>
                <FameBadge rating={0} size="sm" />
              </div>
            )}

            {(callPhase !== 'idle' || callError) && targetUser && (
              <div className="border-b border-brand-border bg-brand-bg/60 px-4 py-3">
                {callError && callPhase === 'idle' ? (
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-border bg-brand-surface px-4 py-3">
                    <p className="text-sm font-semibold text-brand-text">{callError}</p>
                    <button
                      type="button"
                      onClick={() => setCallError(null)}
                      className="text-xs font-black uppercase tracking-wider text-brand-muted hover:text-brand-text"
                    >
                      Dismiss
                    </button>
                  </div>
                ) : callPhase === 'incoming' && incomingCall ? (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-brand-accent/20 bg-brand-accent/5 px-4 py-3">
                    <div>
                      <p className="text-sm font-black text-brand-text">Incoming {incomingCall.callType} call</p>
                      <p className="text-xs text-brand-muted">{incomingCall.from_user?.first_name || 'A connected member'} is calling you</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={acceptCall}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-500 text-white text-xs font-black uppercase tracking-wider"
                      >
                        <Phone className="w-4 h-4" /> Accept
                      </button>
                      <button
                        type="button"
                        onClick={rejectIncomingCall}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-brand-error-bg text-brand-error-text text-xs font-black uppercase tracking-wider"
                      >
                        <PhoneOff className="w-4 h-4" /> Decline
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-brand-border bg-brand-surface p-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-brand-text">
                          {callPhase === 'calling' ? 'Calling' : callPhase === 'connecting' ? 'Connecting' : 'In call'} {callPeerName || targetUser.first_name}
                        </p>
                        <p className="text-xs text-brand-muted">{callType === 'video' ? 'Video call' : 'Audio call'} with connected user</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={toggleMute}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-brand-border text-xs font-black uppercase tracking-wider text-brand-text hover:border-brand-accent hover:text-brand-accent"
                        >
                          {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />} {isMuted ? 'Unmute' : 'Mute'}
                        </button>
                        {callType === 'video' && (
                          <button
                            type="button"
                            onClick={toggleCamera}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-brand-border text-xs font-black uppercase tracking-wider text-brand-text hover:border-brand-accent hover:text-brand-accent"
                          >
                            {isCameraOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />} {isCameraOff ? 'Camera on' : 'Camera off'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={endCall}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-brand-error-bg text-brand-error-text text-xs font-black uppercase tracking-wider"
                        >
                          <PhoneOff className="w-4 h-4" /> End
                        </button>
                      </div>
                    </div>
                    {callType === 'video' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                        <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
                          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                          <span className="absolute left-3 bottom-2 text-xs font-bold text-white/80">{callPeerName || targetUser.first_name}</span>
                        </div>
                        <div className="relative aspect-video overflow-hidden rounded-2xl bg-black">
                          <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                          <span className="absolute left-3 bottom-2 text-xs font-bold text-white/80">You</span>
                        </div>
                      </div>
                    )}
                    {callType === 'audio' && (
                      <div className="hidden">
                        <video ref={remoteVideoRef} autoPlay playsInline />
                        <video ref={localVideoRef} autoPlay playsInline muted />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {(showDateForm || dateProposals.length > 0) && targetUser && (
              <div className="border-b border-brand-border bg-brand-bg/40 px-4 py-3 space-y-3">
                {showDateForm && (
                  <form onSubmit={handleProposeDate} className="rounded-2xl bg-brand-surface border border-brand-border p-3 grid gap-2 sm:grid-cols-2">
                    <label className="text-xs font-bold text-brand-text">
                      Date and time
                      <input
                        type="datetime-local"
                        required
                        min={minDateTimeLocal()}
                        value={dateDraft.proposed_datetime}
                        onChange={(event) => setDateDraft({ ...dateDraft, proposed_datetime: event.target.value })}
                        className="mt-1 w-full min-h-[40px] rounded-xl border border-brand-border bg-brand-bg px-3 text-sm text-brand-text outline-none focus:border-brand-accent focus:ring-3 focus:ring-brand-accent/20"
                      />
                    </label>
                    <label className="text-xs font-bold text-brand-text">
                      Location
                      <input
                        type="text"
                        maxLength={255}
                        placeholder="e.g. Café in Casablanca"
                        value={dateDraft.location_text}
                        onChange={(event) => setDateDraft({ ...dateDraft, location_text: event.target.value })}
                        className="mt-1 w-full min-h-[40px] rounded-xl border border-brand-border bg-brand-bg px-3 text-sm text-brand-text outline-none focus:border-brand-accent focus:ring-3 focus:ring-brand-accent/20"
                      />
                    </label>
                    <label className="text-xs font-bold text-brand-text sm:col-span-2">
                      Note
                      <input
                        type="text"
                        maxLength={1000}
                        placeholder="Optional note"
                        value={dateDraft.note}
                        onChange={(event) => setDateDraft({ ...dateDraft, note: event.target.value })}
                        className="mt-1 w-full min-h-[40px] rounded-xl border border-brand-border bg-brand-bg px-3 text-sm text-brand-text outline-none focus:border-brand-accent focus:ring-3 focus:ring-brand-accent/20"
                      />
                    </label>
                    <div className="sm:col-span-2 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowDateForm(false)}
                        className="px-4 py-2 rounded-full border border-brand-border text-xs font-black uppercase tracking-wider text-brand-muted hover:text-brand-text"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={dateSaving}
                        className="px-4 py-2 rounded-full bg-brand-accent text-white text-xs font-black uppercase tracking-wider disabled:opacity-50"
                      >
                        {dateSaving ? 'Sending…' : 'Send proposal'}
                      </button>
                    </div>
                  </form>
                )}

                {dateProposals.length > 0 && (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {dateProposals.map((proposal) => {
                      const mine = proposal.proposer_id === currentUserId;
                      const canRespond = proposal.recipient_id === currentUserId && proposal.status === 'pending';
                      return (
                        <div key={proposal.id} className="min-w-[260px] rounded-2xl border border-brand-border bg-brand-surface p-3 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-black text-brand-text">{formatDateProposalTime(proposal.proposed_datetime)}</p>
                              <p className="text-xs text-brand-muted mt-0.5">
                                {mine ? `You proposed to ${proposal.recipient_first_name}` : `${proposal.proposer_first_name} proposed`}
                              </p>
                            </div>
                            <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase ${
                              proposal.status === 'accepted'
                                ? 'bg-emerald-100 text-emerald-700'
                                : proposal.status === 'declined'
                                  ? 'bg-brand-error-bg text-brand-error-text'
                                  : 'bg-brand-accent/10 text-brand-accent'
                            }`}>
                              {proposal.status}
                            </span>
                          </div>
                          {proposal.location_text && <p className="text-xs text-brand-muted mt-2">📍 {proposal.location_text}</p>}
                          {proposal.note && <p className="text-xs text-brand-text mt-2 line-clamp-2">{proposal.note}</p>}
                          {canRespond && (
                            <div className="grid grid-cols-2 gap-2 mt-3">
                              <button
                                type="button"
                                disabled={dateSaving}
                                onClick={() => handleRespondToDate(proposal, 'accepted')}
                                className="inline-flex items-center justify-center gap-1 rounded-full bg-emerald-500 text-white px-3 py-2 text-xs font-black uppercase disabled:opacity-50"
                              >
                                <Check className="w-3.5 h-3.5" /> Accept
                              </button>
                              <button
                                type="button"
                                disabled={dateSaving}
                                onClick={() => handleRespondToDate(proposal, 'declined')}
                                className="inline-flex items-center justify-center gap-1 rounded-full bg-brand-error-bg text-brand-error-text px-3 py-2 text-xs font-black uppercase disabled:opacity-50"
                              >
                                <X className="w-3.5 h-3.5" /> Decline
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Messages */}
            <div
              ref={messagesContainerRef}
              className="flex-1 overflow-y-auto p-4 space-y-4"
              onScroll={handleScroll}
            >
              {hasMore && messages.length > 0 && (
                <div className="text-center text-xs text-brand-muted py-2">
                  Scroll up for more messages
                </div>
              )}
              {messages.length === 0 && !loading && (
                <div className="flex-1 flex items-center justify-center text-brand-muted text-sm">
                  No messages yet. Start the conversation!
                </div>
              )}
              {messages.map((msg) => {
                const isOwn = msg.sender_id === currentUserId;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isOwn ? 'justify-end' : 'justify-start'} animate-fade-in`}
                  >
                    <div
                      className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                        isOwn
                          ? 'bg-gradient-to-br from-brand-start via-brand-mid to-brand-end text-white rounded-br-md'
                          : 'bg-brand-bg text-brand-text rounded-bl-md'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <div className="flex items-center gap-1.5 mt-1 text-[10px]">
                        <span className={isOwn ? 'text-white/70' : 'text-brand-muted'}>
                          {formatMessageTime(msg.created_at)}
                        </span>
                        {isOwn && msg.read_at && (
                          <CheckCheck className="w-3.5 h-3.5 text-white/70" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            {targetUser && (
              <div className="px-4 py-3 border-t border-brand-border bg-brand-bg/50">
                <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    disabled={sending}
                    className="flex-1 min-h-[44px] px-4 py-2 rounded-full bg-brand-bg border border-brand-border text-brand-text placeholder:text-brand-muted/60 focus:outline-none focus:ring-2 focus:ring-brand-accent/40 disabled:opacity-50"
                    maxLength={5000}
                  />
                  <button
                    type="submit"
                    disabled={sending || !messageText.trim()}
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-start via-brand-mid to-brand-end text-white flex items-center justify-center hover:brightness-105 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
                    aria-label="Send message"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              </div>
            )}
          </div>
        ) : (
          /* Conversations List */
          <div className="bg-brand-surface rounded-3xl shadow-md border border-brand-border overflow-hidden">
            <div className="px-5 py-4 border-b border-brand-border flex items-center justify-between">
              <h1 className="text-xl font-black text-brand-text">Messages</h1>
              {unreadMessageCount > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-brand-accent/10 text-brand-accent text-xs font-black">
                  {unreadMessageCount} unread
                </span>
              )}
            </div>
            {conversations.length === 0 ? (
              <div className="p-8 text-center">
                <MessageCircle className="w-16 h-16 text-brand-muted/30 mx-auto mb-4" />
                <h2 className="text-lg font-black text-brand-text mb-1">No conversations yet</h2>
                <p className="text-sm text-brand-muted mb-6">Connect with someone to start chatting</p>
                <Link to="/browse">
                  <PrimaryButton type="button">Browse members</PrimaryButton>
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-brand-border">
                {conversations.map((conv) => (
                  <li key={conv.id}>
                    <Link
                      to={`/chat/${conv.id}`}
                      className="block p-4 hover:bg-brand-bg transition-colors flex items-center gap-3"
                    >
                      <div className="relative w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
                        {conv.photo_url ? (
                          <img src={resolveMediaUrl(conv.photo_url) ?? ''} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-brand-start/15 via-brand-mid/15 to-brand-end/15 flex items-center justify-center">
                            <span className="text-2xl font-black text-brand-accent/50">
                              {conv.first_name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        {conv.unread_count > 0 && (
                          <span className="absolute -bottom-1 -right-1 w-5 h-5 bg-brand-error-text text-white text-[10px] font-black rounded-full flex items-center justify-center">
                            {conv.unread_count > 9 ? '9+' : conv.unread_count}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-brand-text truncate pr-2">
                            {conv.first_name} {conv.last_name}
                          </p>
                          {conv.last_message_at && (
                            <span className="text-xs text-brand-muted whitespace-nowrap">
                              {formatNotificationTime(conv.last_message_at)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <p className="text-sm text-brand-muted truncate pr-2">
                            {conv.last_message_content || 'No messages yet'}
                          </p>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
