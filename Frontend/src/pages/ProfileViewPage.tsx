import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Ban, CalendarDays, Clock, Flag, Heart, MapPin, MessageCircle, Undo2, VenusAndMars } from 'lucide-react';
import { usersApi, UsersApiError } from '../api/users';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { PrimaryButton } from '../components/common/PrimaryButton';
import { FameBadge } from '../components/profile/FameBadge';
import { PhotoCarousel } from '../components/profileView/PhotoCarousel';
import type { PublicProfileResponse, RelationshipState } from '../types/users';

/**
 * Profile View — /profile/:userId.
 *
 * Shows another member's full public profile (everything except email and
 * password) and hosts the like/unlike, block/unblock and report actions.
 * Merely loading this page records a visit in the backend `views` history log.
 *
 * If the target has blocked us the backend answers 404 (deliberately
 * indistinguishable from a deleted profile) and we render a neutral
 * "Profile not available" card — never a leaked "you are blocked".
 *
 * REAL-TIME NOTE: the backend writes everything the notification system needs
 * (views/likes rows + a pending_notifications array in each response), but the
 * actual push to the other user within 10s is wired up with the dedicated
 * Notifications feature — no Socket.io/websocket transport exists yet.
 */

type PendingAction = 'like' | 'unlike' | 'block' | 'unblock' | 'report' | null;

/** Quick-pick reasons offered in the report dialog, per the subject's "fake account" rule. */
const REPORT_REASON_PRESETS = [
  'Fake account',
  'Inappropriate photos',
  'Harassment or hate speech',
  'Spam or scam',
];

const MIN_REPORT_REASON_LENGTH = 3;

const capitalize = (value: string | null): string | null =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : null;

const formatLastSeen = (value: string | null): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
};

const formatMemberSince = (value: string): string | null => {
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
};

export const ProfileViewPage: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();

  const numericId = Number.parseInt(String(userId), 10);
  const isValidId = Number.isInteger(numericId) && numericId > 0;

  const [profile, setProfile] = useState<PublicProfileResponse | null>(null);
  // Relationship lives in its own state so actions update it without a refetch
  // (a refetch would append another row to the views history log).
  const [relationship, setRelationship] = useState<RelationshipState | null>(null);
  const [targetFame, setTargetFame] = useState<number>(0);

  const [loading, setLoading] = useState(true);
  const [notAvailable, setNotAvailable] = useState(!isValidId);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [justMatched, setJustMatched] = useState(false);

  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');

  useEffect(() => {
    if (!isValidId) {
      setNotAvailable(true);
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await usersApi.getProfile(numericId, { signal: controller.signal });
        setProfile(data);
        setRelationship(data.relationship);
        setTargetFame(data.fame_rating);
        setNotAvailable(false);
      } catch (error: any) {
        if (controller.signal.aborted) return;
        // 404 = profile deleted OR target blocked us. Same neutral UI for both.
        if (error instanceof UsersApiError && error.status === 404) {
          setNotAvailable(true);
        } else {
          setLoadError(error?.message ?? 'Unable to load this profile');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    load();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const clearMessages = () => {
    setActionError(null);
    setSuccessMessage(null);
    setJustMatched(false);
  };

  const handleLike = useCallback(async () => {
    if (!profile || pendingAction) return;
    clearMessages();
    setPendingAction('like');
    try {
      const result = await usersApi.like(profile.id);
      setRelationship((prev) =>
        prev
          ? { ...prev, has_liked: true, has_liked_me: result.has_liked_me, is_connected: result.is_connected }
          : prev
      );
      setTargetFame(result.target_fame_rating);
      if (result.newly_connected) {
        setJustMatched(true);
      } else {
        setSuccessMessage('You liked this member.');
      }
    } catch (error: any) {
      setActionError(error?.message ?? 'Unable to like this member');
    } finally {
      setPendingAction(null);
    }
  }, [profile, pendingAction]);

  const handleUnlike = useCallback(async () => {
    if (!profile || pendingAction) return;
    clearMessages();
    setPendingAction('unlike');
    try {
      const result = await usersApi.unlike(profile.id);
      setRelationship((prev) =>
        prev ? { ...prev, has_liked: false, has_liked_me: result.has_liked_me, is_connected: false } : prev
      );
      setTargetFame(result.target_fame_rating);
      setSuccessMessage(
        result.connection_broken
          ? 'Like removed — you are no longer connected and chat is no longer possible.'
          : 'Like removed.'
      );
    } catch (error: any) {
      setActionError(error?.message ?? 'Unable to remove your like');
    } finally {
      setPendingAction(null);
    }
  }, [profile, pendingAction]);

  const handleBlock = useCallback(async () => {
    if (!profile || pendingAction) return;
    clearMessages();
    setPendingAction('block');
    try {
      await usersApi.block(profile.id);
      // Blocking removes likes in both directions and breaks any connection.
      setRelationship((prev) =>
        prev ? { ...prev, has_blocked: true, has_liked: false, has_liked_me: false, is_connected: false } : prev
      );
      setSuccessMessage('Member blocked. They will no longer appear in your suggestions or search results.');
      setBlockDialogOpen(false);
    } catch (error: any) {
      setActionError(error?.message ?? 'Unable to block this member');
      setBlockDialogOpen(false);
    } finally {
      setPendingAction(null);
    }
  }, [profile, pendingAction]);

  const handleUnblock = useCallback(async () => {
    if (!profile || pendingAction) return;
    clearMessages();
    setPendingAction('unblock');
    try {
      await usersApi.unblock(profile.id);
      setRelationship((prev) => (prev ? { ...prev, has_blocked: false } : prev));
      setSuccessMessage('Member unblocked.');
    } catch (error: any) {
      setActionError(error?.message ?? 'Unable to unblock this member');
    } finally {
      setPendingAction(null);
    }
  }, [profile, pendingAction]);

  const handleReport = useCallback(async () => {
    if (!profile || pendingAction) return;
    const trimmed = reportReason.replace(/\s+/g, ' ').trim();
    if (trimmed.length < MIN_REPORT_REASON_LENGTH) return;

    clearMessages();
    setPendingAction('report');
    try {
      await usersApi.report(profile.id, trimmed);
      setSuccessMessage('Report submitted. Our moderators will review this account.');
      setReportDialogOpen(false);
      setReportReason('');
    } catch (error: any) {
      setActionError(error?.message ?? 'Unable to submit the report');
      setReportDialogOpen(false);
    } finally {
      setPendingAction(null);
    }
  }, [profile, pendingAction, reportReason]);

  // ------------------------------ Render ----------------------------------

  const fullName = profile ? `${profile.first_name} ${profile.last_name}`.trim() : '';

  return (
    <div className="min-h-screen w-full bg-brand-bg">
      {/* Header — same gradient bar as /browse */}
      <header className="sticky top-0 z-30 bg-gradient-to-br from-brand-start via-brand-mid to-brand-end shadow-lg">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Go back"
              className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <Link to="/browse" className="text-xl sm:text-2xl font-black tracking-tight text-white">
              matcha
            </Link>
          </div>
          <Link
            to="/profile"
            className="text-xs sm:text-sm font-bold uppercase tracking-wider text-white/90 hover:text-white transition-colors"
          >
            My profile
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {loading && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="aspect-[4/5] rounded-3xl bg-brand-border/60 animate-pulse" />
            <div className="space-y-4">
              <div className="h-8 w-2/3 rounded-full bg-brand-border/60 animate-pulse" />
              <div className="h-4 w-1/2 rounded-full bg-brand-border/60 animate-pulse" />
              <div className="h-32 rounded-3xl bg-brand-border/60 animate-pulse" />
              <div className="h-24 rounded-3xl bg-brand-border/60 animate-pulse" />
            </div>
          </div>
        )}

        {!loading && notAvailable && (
          <div className="max-w-md mx-auto bg-brand-surface rounded-3xl shadow-md border border-brand-border p-8 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-brand-bg flex items-center justify-center text-brand-muted mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.8"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 4l16 16" />
              </svg>
            </div>
            <h1 className="text-xl font-black text-brand-text mb-2">Profile not available</h1>
            <p className="text-sm text-brand-muted leading-relaxed mb-6">
              This profile does not exist or is no longer available.
            </p>
            <Link to="/browse" className="block w-full">
              <PrimaryButton type="button">Back to suggestions</PrimaryButton>
            </Link>
          </div>
        )}

        {!loading && !notAvailable && loadError && (
          <div className="max-w-md mx-auto">
            <ErrorBanner message={loadError} onDismiss={() => setLoadError(null)} />
            <Link to="/browse" className="block w-full">
              <PrimaryButton type="button" variant="outline">
                Back to suggestions
              </PrimaryButton>
            </Link>
          </div>
        )}

        {!loading && !notAvailable && !loadError && profile && relationship && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
            {/* Left — photo gallery */}
            <div className="bg-brand-surface rounded-3xl shadow-md border border-brand-border p-3">
              <PhotoCarousel photos={profile.photos} fullName={fullName} />
            </div>

            {/* Right — info + actions */}
            <div className="space-y-4">
              <div className="bg-brand-surface rounded-3xl shadow-md border border-brand-border p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h1 className="text-2xl font-black text-brand-text leading-tight">
                    {profile.first_name}
                    {profile.age !== null && (
                      <span className="font-bold text-brand-muted">, {profile.age}</span>
                    )}
                  </h1>
                  <FameBadge rating={targetFame} size="sm" />
                </div>
                <p className="text-sm text-brand-muted mb-3">@{profile.username}</p>

                {/* Online status / last connection */}
                {profile.is_online ? (
                  <p className="inline-flex items-center gap-2 text-xs font-bold text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1.5 mb-4">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                    </span>
                    Online now
                  </p>
                ) : (
                  <p className="inline-flex items-center gap-2 text-xs font-semibold text-brand-muted bg-brand-bg border border-brand-border rounded-full px-3 py-1.5 mb-4">
                    <Clock className="w-3.5 h-3.5" />
                    {formatLastSeen(profile.last_seen)
                      ? `Last seen ${formatLastSeen(profile.last_seen)}`
                      : 'Last connection unknown'}
                  </p>
                )}

                <div className="space-y-2.5 text-sm text-brand-text mb-4">
                  {(profile.gender || profile.sexual_preferences) && (
                    <p className="flex items-center gap-2">
                      <VenusAndMars className="w-4 h-4 shrink-0 text-brand-accent" />
                      <span className="text-brand-muted">
                        {[capitalize(profile.gender), profile.sexual_preferences && `into ${profile.sexual_preferences}`]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </span>
                    </p>
                  )}
                  <p className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 shrink-0 text-brand-accent" />
                    <span className="text-brand-muted">{profile.location_text || 'Location not set'}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 shrink-0 text-brand-accent" />
                    <span className="text-brand-muted">
                      Member since {formatMemberSince(profile.member_since) ?? '—'}
                    </span>
                  </p>
                </div>

                {profile.biography && (
                  <div className="mb-4">
                    <h2 className="text-xs font-black uppercase tracking-wider text-brand-muted mb-1.5">
                      About
                    </h2>
                    <p className="text-sm text-brand-text leading-relaxed whitespace-pre-line">
                      {profile.biography}
                    </p>
                  </div>
                )}

                <div>
                  <h2 className="text-xs font-black uppercase tracking-wider text-brand-muted mb-2">
                    Interests
                  </h2>
                  {profile.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {profile.tags.map((tag) => (
                        <span
                          key={tag.id}
                          className="px-2.5 py-1 rounded-full bg-brand-accent/10 text-brand-accent text-[11px] font-semibold border border-brand-accent/15"
                        >
                          #{tag.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-brand-muted italic">No interests added yet</p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="bg-brand-surface rounded-3xl shadow-md border border-brand-border p-5 sm:p-6 space-y-3">
                {justMatched && (
                  <div className="rounded-2xl bg-gradient-to-br from-brand-start via-brand-mid to-brand-end text-white p-4 text-center shadow-lg shadow-brand-accent/25">
                    <p className="text-base font-black mb-0.5 flex items-center justify-center gap-2">
                      <Heart className="w-5 h-5 fill-current" /> It's a match!
                    </p>
                    <p className="text-xs font-medium text-white/90">
                      You and {profile.first_name} liked each other — you are now connected.
                    </p>
                  </div>
                )}

                {successMessage && (
                  <div className="rounded-2xl bg-brand-accent/10 border border-brand-accent/15 text-brand-accent text-xs font-semibold p-3.5">
                    {successMessage}
                  </div>
                )}

                <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />

                {profile.is_self ? (
                  <div className="text-center py-2">
                    <p className="text-sm text-brand-muted mb-4">This is your own profile.</p>
                    <Link to="/profile" className="block w-full">
                      <PrimaryButton type="button" variant="outline">
                        Edit my profile
                      </PrimaryButton>
                    </Link>
                  </div>
                ) : relationship.has_blocked ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl bg-brand-error-bg border border-[#FFCDD2] text-brand-error-text text-xs font-semibold p-3.5 flex items-center gap-2">
                      <Ban className="w-4 h-4 shrink-0" />
                      You blocked {profile.first_name}. They cannot see you in suggestions or search,
                      and no notifications pass between you.
                    </div>
                    <PrimaryButton
                      type="button"
                      variant="outline"
                      loading={pendingAction === 'unblock'}
                      disabled={pendingAction !== null}
                      onClick={handleUnblock}
                    >
                      <Undo2 className="w-4 h-4" /> Unblock
                    </PrimaryButton>
                  </div>
                ) : (
                  <>
                    {/* They liked me first (not yet mutual) — nudge to reciprocate */}
                    {relationship.has_liked_me && !relationship.has_liked && (
                      <div className="rounded-2xl bg-brand-accent/10 border border-brand-accent/15 text-brand-accent text-xs font-bold p-3.5 flex items-center gap-2">
                        <Heart className="w-4 h-4 shrink-0 fill-current" />
                        {profile.first_name} likes you!
                      </div>
                    )}

                    {/* Mutual like — connected */}
                    {relationship.is_connected && (
                      <div className="rounded-2xl bg-green-50 border border-green-200 text-green-700 text-xs font-bold p-3.5 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2">
                          <Heart className="w-4 h-4 shrink-0 fill-current" /> Connected
                        </span>
                        <span className="font-semibold text-green-600/80">You liked each other</span>
                      </div>
                    )}

                    {!relationship.has_liked ? (
                      <div>
                        <PrimaryButton
                          type="button"
                          loading={pendingAction === 'like'}
                          disabled={pendingAction !== null || !profile.viewer.can_like}
                          onClick={handleLike}
                          title={profile.viewer.can_like ? undefined : profile.viewer.like_blocked_reason ?? undefined}
                        >
                          <Heart className="w-4 h-4 fill-current" /> Like
                        </PrimaryButton>
                        {!profile.viewer.can_like && profile.viewer.like_blocked_reason && (
                          <p className="text-[11px] font-medium text-brand-error-text mt-2 text-center">
                            {profile.viewer.like_blocked_reason}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="rounded-2xl bg-brand-bg border border-brand-border text-brand-muted text-xs font-bold p-3 flex items-center gap-2">
                          <Heart className="w-4 h-4 shrink-0 fill-current text-brand-accent" />
                          You liked {profile.first_name}
                        </div>
                        <PrimaryButton
                          type="button"
                          variant="outline"
                          loading={pendingAction === 'unlike'}
                          disabled={pendingAction !== null}
                          onClick={handleUnlike}
                        >
                          Unlike
                        </PrimaryButton>
                      </div>
                    )}

                    {relationship.is_connected && (
                      <PrimaryButton
                        type="button"
                        variant="outline"
                        onClick={() => navigate(`/chat/${profile.id}`)}
                        title="Messaging arrives with the Chat feature"
                      >
                        <MessageCircle className="w-4 h-4" /> Message
                      </PrimaryButton>
                    )}

                    <div className="pt-3 border-t border-brand-border grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          clearMessages();
                          setBlockDialogOpen(true);
                        }}
                        className="min-h-[40px] px-4 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-brand-error-text border border-brand-error-text/30 hover:bg-brand-error-bg transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Ban className="w-3.5 h-3.5" /> Block
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          clearMessages();
                          setReportDialogOpen(true);
                        }}
                        className="min-h-[40px] px-4 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-brand-muted border border-brand-border hover:bg-brand-bg hover:text-brand-text transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Flag className="w-3.5 h-3.5" /> Report
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Block confirmation */}
      <ConfirmDialog
        open={blockDialogOpen}
        title={`Block ${profile?.first_name ?? 'this member'}?`}
        message="Blocking is serious: you will both disappear from each other's suggestions and search results, any like between you is removed (breaking a connection and making chat impossible), and neither of you will receive notifications from the other. You can unblock later, but removed likes are not restored."
        confirmLabel="Block"
        tone="danger"
        loading={pendingAction === 'block'}
        onConfirm={handleBlock}
        onCancel={() => setBlockDialogOpen(false)}
      />

      {/* Report confirmation with reason form */}
      <ConfirmDialog
        open={reportDialogOpen}
        title={`Report ${profile?.first_name ?? 'this member'} as a fake account?`}
        message="Pick a reason or describe the problem. Our moderators will review this account — please only report genuine violations."
        confirmLabel="Submit report"
        tone="danger"
        loading={pendingAction === 'report'}
        confirmDisabled={reportReason.replace(/\s+/g, ' ').trim().length < MIN_REPORT_REASON_LENGTH}
        onConfirm={handleReport}
        onCancel={() => {
          setReportDialogOpen(false);
          setReportReason('');
        }}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {REPORT_REASON_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setReportReason(preset)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition-colors ${
                  reportReason === preset
                    ? 'bg-brand-accent/10 text-brand-accent border-brand-accent/30'
                    : 'bg-brand-bg text-brand-muted border-brand-border hover:text-brand-text'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <textarea
            value={reportReason}
            onChange={(event) => setReportReason(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Reason for the report (at least 3 characters)..."
            className="w-full rounded-2xl border border-brand-border bg-brand-bg px-4 py-3 text-sm text-brand-text placeholder:text-brand-muted/60 focus:outline-none focus:ring-2 focus:ring-brand-accent/40 resize-none"
          />
        </div>
      </ConfirmDialog>
    </div>
  );
};
