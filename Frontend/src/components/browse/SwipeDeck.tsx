import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Info, MapPin, MessageCircle, RotateCcw, X } from 'lucide-react';
import { fetchSuggestions, passProfile, resetPasses } from '../../api/browse';
import { profileIncompleteMissing } from '../../api/http';
import { resolveMediaUrl } from '../../api/profile';
import { usersApi } from '../../api/users';
import { ErrorBanner } from '../common/ErrorBanner';
import { FameBadge } from '../profile/FameBadge';
import type { BrowseQuery, Suggestion } from '../../types/browse';
import { formatDistance } from '../../utils/format';

/** Backend maximum per request; the deck refills from page 1 because swiped profiles drop out server-side. */
const BATCH_SIZE = 50;
/** Fetch more when only this many cards are left. */
const REFILL_THRESHOLD = 3;
/** Horizontal drag (px) that commits a swipe when released. */
const SWIPE_THRESHOLD = 110;
/** Duration of the fly-out animation (ms). */
const EXIT_MS = 280;
/** How many cards are stacked visibly. */
const VISIBLE_CARDS = 3;

type Direction = 'left' | 'right';

interface SwipeDeckProps {
  /** Applied filters and sort from the Browse page; changing them re-deals the deck. */
  query: Omit<BrowseQuery, 'page' | 'limit' | 'swipe'>;
  /** True when filters are active, to tailor the "seen everyone" message. */
  hasFilters: boolean;
  /** Called when the backend gates browsing (403 PROFILE_INCOMPLETE). */
  onIncomplete: (missing: string[]) => void;
}

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * Swipe mode for Browse: one suggested profile at a time. Drag (touch or
 * mouse), the buttons, or the arrow keys: right likes, left passes.
 *
 * A like is the normal like (same rules and notifications as the profile
 * page). A pass is private and only hides the profile from this deck. The
 * server leaves out everyone already liked or passed on, so the deck never
 * deals the same profile twice. Opening the full profile from here records
 * a visit, exactly like the grid.
 */
export const SwipeDeck: React.FC<SwipeDeckProps> = ({ query, hasFilters, onIncomplete }) => {
  const [cards, setCards] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  // Every remaining match is already in (or through) the deck.
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState({ dx: 0, dy: 0, active: false });
  const [leaving, setLeaving] = useState<{ id: number; dir: Direction } | null>(null);
  const [match, setMatch] = useState<Suggestion | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [restarting, setRestarting] = useState(false);

  // Swiped this session; filters out profiles whose pass/like is still in flight.
  const swipedIds = useRef(new Set<number>());
  const fetching = useRef(false);
  const dragStart = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const exitTimer = useRef<number | null>(null);

  const queryKey = JSON.stringify(query);

  const loadMore = useCallback(
    async (replace: boolean, signal?: AbortSignal) => {
      if (fetching.current && !replace) return;
      fetching.current = true;
      try {
        const result = await fetchSuggestions(
          { ...JSON.parse(queryKey), page: 1, limit: BATCH_SIZE, swipe: true },
          { signal }
        );
        setCards((prev) => {
          const base = replace ? [] : prev;
          const known = new Set(base.map((card) => card.id));
          const fresh = result.suggestions.filter(
            (s) => !known.has(s.id) && !swipedIds.current.has(s.id)
          );
          return [...base, ...fresh];
        });
        setExhausted(result.pagination.total <= result.suggestions.length);
        setError(null);
      } catch (err) {
        if (signal?.aborted) return;
        const missing = profileIncompleteMissing(err);
        if (missing) onIncomplete(missing);
        else setError(err instanceof Error ? err.message : 'Failed to load profiles');
      } finally {
        fetching.current = false;
        if (!signal?.aborted) setLoading(false);
      }
    },
    [queryKey, onIncomplete]
  );

  // New filters or sort: start a fresh deck. Reset during render (not in the
  // effect) so the effect never calls setState synchronously.
  const [dealtKey, setDealtKey] = useState<string | null>(null);
  if (dealtKey !== queryKey) {
    setDealtKey(queryKey);
    setCards([]);
    setLoading(true);
    setExhausted(false);
    setError(null);
  }

  useEffect(() => {
    const controller = new AbortController();
    void loadMore(true, controller.signal);
    return () => controller.abort();
  }, [loadMore]);

  // Top up before the deck runs dry.
  useEffect(() => {
    if (!loading && !exhausted && !error && cards.length <= REFILL_THRESHOLD) {
      void loadMore(false);
    }
  }, [cards.length, loading, exhausted, error, loadMore]);

  useEffect(
    () => () => {
      if (exitTimer.current !== null) window.clearTimeout(exitTimer.current);
    },
    []
  );

  /** Puts a card back on top when its like/pass failed, so nothing is lost. */
  const restore = useCallback((card: Suggestion, message: string) => {
    swipedIds.current.delete(card.id);
    setCards((prev) => [card, ...prev.filter((c) => c.id !== card.id)]);
    setError(message);
  }, []);

  const likeCard = useCallback(
    async (card: Suggestion) => {
      try {
        const result = await usersApi.like(card.id);
        setAnnouncement(`You liked ${card.first_name}.`);
        if (result.newly_connected) setMatch(card);
      } catch (err) {
        const missing = profileIncompleteMissing(err);
        if (missing) {
          swipedIds.current.delete(card.id);
          onIncomplete(missing);
          return;
        }
        restore(card, err instanceof Error ? err.message : `Could not like ${card.first_name}`);
      }
    },
    [onIncomplete, restore]
  );

  const passCard = useCallback(
    async (card: Suggestion) => {
      try {
        await passProfile(card.id);
        setAnnouncement(`You passed on ${card.first_name}.`);
      } catch (err) {
        restore(card, err instanceof Error ? err.message : `Could not pass on ${card.first_name}`);
      }
    },
    [restore]
  );

  const top = cards[0];

  const commit = useCallback(
    (dir: Direction) => {
      if (!top || leaving) return;
      const card = top;
      swipedIds.current.add(card.id);
      setError(null);
      setLeaving({ id: card.id, dir });
      setDrag({ dx: 0, dy: 0, active: false });

      // Let the card fly out, then drop it and tell the server.
      exitTimer.current = window.setTimeout(() => {
        exitTimer.current = null;
        setCards((prev) => prev.filter((c) => c.id !== card.id));
        setLeaving(null);
        void (dir === 'right' ? likeCard(card) : passCard(card));
      }, EXIT_MS);
    },
    [top, leaving, likeCard, passCard]
  );

  // Arrow keys swipe; Escape closes the match dialog.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (match) {
        if (event.key === 'Escape') setMatch(null);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        commit('left');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        commit('right');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commit, match]);

  // --- pointer dragging (touch + mouse) ---------------------------------
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (leaving || event.button !== 0) return;
    if ((event.target as HTMLElement).closest('a,button')) return;
    dragStart.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ dx: 0, dy: 0, active: true });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    setDrag({ dx: event.clientX - start.x, dy: event.clientY - start.y, active: true });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    dragStart.current = null;
    const dx = event.clientX - start.x;
    if (Math.abs(dx) >= SWIPE_THRESHOLD) commit(dx > 0 ? 'right' : 'left');
    else setDrag({ dx: 0, dy: 0, active: false });
  };

  const onPointerCancel = () => {
    dragStart.current = null;
    setDrag({ dx: 0, dy: 0, active: false });
  };

  const handleStartOver = async () => {
    setRestarting(true);
    try {
      await resetPasses();
      swipedIds.current.clear();
      setLoading(true);
      setExhausted(false);
      await loadMore(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not restore passed profiles');
    } finally {
      setRestarting(false);
    }
  };

  // --- rendering -----------------------------------------------------------
  const progress = Math.min(Math.abs(drag.dx) / SWIPE_THRESHOLD, 1);
  const likeOpacity = leaving ? (leaving.dir === 'right' ? 1 : 0) : Math.max(0, Math.min(drag.dx / SWIPE_THRESHOLD, 1));
  const nopeOpacity = leaving ? (leaving.dir === 'left' ? 1 : 0) : Math.max(0, Math.min(-drag.dx / SWIPE_THRESHOLD, 1));

  const cardStyle = (index: number, card: Suggestion): React.CSSProperties => {
    if (index === 0) {
      if (leaving?.id === card.id) {
        const sign = leaving.dir === 'right' ? 1 : -1;
        return {
          transform: `translate(${sign * 140}%, 0) rotate(${sign * 24}deg)`,
          opacity: 0,
          transition: `transform ${EXIT_MS}ms ease-in, opacity ${EXIT_MS}ms ease-in`,
        };
      }
      return {
        transform: `translate(${drag.dx}px, ${drag.dy * 0.25}px) rotate(${drag.dx / 18}deg)`,
        transition: drag.active ? 'none' : 'transform 250ms ease-out',
        touchAction: 'pan-y',
      };
    }
    // Cards behind grow toward the front as the top card is dragged away.
    const depth = Math.max(index - (leaving ? 1 : progress), 0);
    return {
      transform: `translateY(${depth * 12}px) scale(${1 - depth * 0.05})`,
      transition: 'transform 250ms ease-out',
    };
  };

  const renderCard = (card: Suggestion, index: number) => {
    const photo = resolveMediaUrl(card.photo_url);
    const distance = formatDistance(card.distance_km);
    const initials = `${card.first_name?.[0] ?? ''}${card.last_name?.[0] ?? ''}`.toUpperCase() || '?';
    const isTop = index === 0;

    return (
      <div
        key={card.id}
        className={`absolute inset-0 rounded-[2rem] overflow-hidden bg-brand-bg shadow-xl border border-brand-border select-none motion-reduce:transition-none ${
          isTop ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'
        }`}
        style={{ ...cardStyle(index, card), zIndex: VISIBLE_CARDS - index }}
        aria-hidden={!isTop}
        {...(isTop
          ? {
              role: 'group',
              'aria-roledescription': 'profile card',
              'aria-label': `${card.first_name}${card.age !== null ? `, ${card.age}` : ''}`,
              onPointerDown,
              onPointerMove,
              onPointerUp,
              onPointerCancel,
            }
          : {})}
      >
        {photo ? (
          <img
            src={photo}
            alt={`${card.first_name}'s profile picture`}
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-start/20 via-brand-mid/20 to-brand-end/20">
            <span className="text-6xl font-black text-brand-accent/60">{initials}</span>
          </div>
        )}

        {/* Readability gradient for the text at the bottom */}
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

        {typeof card.relevance_score === 'number' && (
          <div className="absolute top-4 left-4 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-sm text-white text-[11px] font-black tracking-wide">
            {card.relevance_score}% match
          </div>
        )}
        {card.same_area && (
          <div className="absolute top-4 right-4 px-2.5 py-1 rounded-full bg-gradient-to-br from-brand-start via-brand-mid to-brand-end text-white text-[10px] font-black uppercase tracking-wider shadow-md">
            Near you
          </div>
        )}

        {isTop && (
          <>
            <div
              className="absolute top-14 left-5 -rotate-12 px-3 py-1 rounded-xl border-4 border-emerald-400 text-emerald-400 text-3xl font-black tracking-widest"
              style={{ opacity: likeOpacity }}
              aria-hidden="true"
            >
              LIKE
            </div>
            <div
              className="absolute top-14 right-5 rotate-12 px-3 py-1 rounded-xl border-4 border-rose-500 text-rose-500 text-3xl font-black tracking-widest"
              style={{ opacity: nopeOpacity }}
              aria-hidden="true"
            >
              NOPE
            </div>
          </>
        )}

        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-2xl sm:text-3xl font-black leading-tight truncate">
                {card.first_name}
                {card.age !== null && <span className="font-bold text-white/85">, {card.age}</span>}
              </h2>
              <p className="text-sm text-white/75 truncate">@{card.username}</p>
            </div>
            <div className="shrink-0">
              <FameBadge rating={card.fame_rating} showLabel={false} />
            </div>
          </div>

          {(card.location_text || distance) && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-white/85 min-w-0">
              <MapPin className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {[card.location_text, distance].filter(Boolean).join(' · ')}
              </span>
            </p>
          )}

          {card.shared_tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {card.shared_tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white text-[11px] font-semibold"
                >
                  #{tag}
                </span>
              ))}
              {card.shared_tags.length > 4 && (
                <span className="px-2.5 py-1 rounded-full bg-white/10 text-white/80 text-[11px] font-semibold">
                  +{card.shared_tags.length - 4}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const actionButton =
    'flex items-center justify-center rounded-full shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-accent/30';

  return (
    <div className="w-full flex flex-col items-center">
      <div className="w-full max-w-sm">
        <ErrorBanner message={error} onDismiss={() => setError(null)} />
      </div>

      {/* Capped by viewport height so the action buttons stay on screen on phones. */}
      <div className="relative w-full max-w-sm aspect-[3/4] max-h-[max(22rem,calc(100dvh-26rem))]">
        {loading && cards.length === 0 ? (
          <div className="absolute inset-0 rounded-[2rem] bg-brand-surface border border-brand-border shadow-xl animate-pulse" />
        ) : cards.length > 0 ? (
          cards.slice(0, VISIBLE_CARDS).map(renderCard).reverse()
        ) : (
          <div className="absolute inset-0 rounded-[2rem] bg-brand-surface border border-brand-border shadow-xl flex flex-col items-center justify-center text-center p-8">
            <div className="w-16 h-16 rounded-full bg-brand-accent/10 text-brand-accent flex items-center justify-center mb-4">
              <Heart className="w-8 h-8" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-black text-brand-text">You've seen everyone for now</h2>
            <p className="text-sm text-brand-muted mt-2 leading-relaxed">
              {hasFilters
                ? 'Widen your filters to meet more people, or bring back the profiles you passed on.'
                : 'Check back later for new people, or bring back the profiles you passed on.'}{' '}
              People you liked stay liked.
            </p>
            <button
              type="button"
              onClick={handleStartOver}
              disabled={restarting}
              className="mt-5 inline-flex items-center gap-2 min-h-[44px] px-5 rounded-full bg-brand-accent text-white text-sm font-bold shadow-md hover:bg-brand-mid transition-colors disabled:opacity-60"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              {restarting ? 'Restoring…' : 'Start over'}
            </button>
          </div>
        )}
      </div>

      {/* Actions: pass / open profile / like */}
      <div className="mt-6 flex items-center justify-center gap-5">
        <button
          type="button"
          onClick={() => commit('left')}
          disabled={!top || !!leaving}
          aria-label={top ? `Pass on ${top.first_name}` : 'Pass'}
          title="Pass (←)"
          className={`${actionButton} w-16 h-16 bg-brand-surface border border-brand-border text-rose-500 hover:border-rose-300`}
        >
          <X className="w-8 h-8" strokeWidth={3} aria-hidden="true" />
        </button>

        {top ? (
          <Link
            to={`/profile/${top.id}`}
            aria-label={`View ${top.first_name}'s full profile`}
            title="View full profile"
            className={`${actionButton} w-12 h-12 bg-brand-surface border border-brand-border text-brand-muted hover:text-brand-accent`}
          >
            <Info className="w-5 h-5" aria-hidden="true" />
          </Link>
        ) : (
          <span className={`${actionButton} w-12 h-12 bg-brand-surface border border-brand-border text-brand-muted opacity-40`} aria-hidden="true">
            <Info className="w-5 h-5" />
          </span>
        )}

        <button
          type="button"
          onClick={() => commit('right')}
          disabled={!top || !!leaving}
          aria-label={top ? `Like ${top.first_name}` : 'Like'}
          title="Like (→)"
          className={`${actionButton} w-16 h-16 bg-gradient-to-br from-brand-start via-brand-mid to-brand-end text-white shadow-brand-accent/30`}
        >
          <Heart className="w-8 h-8 fill-current" aria-hidden="true" />
        </button>
      </div>

      <p className="mt-4 text-xs text-brand-muted text-center">
        Drag the card<span className="hidden sm:inline"> or use <kbd className="font-sans font-bold">←</kbd> <kbd className="font-sans font-bold">→</kbd></span>. Passing is private.
      </p>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {match && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setMatch(null)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="match-title"
            className="relative w-full max-w-sm rounded-[2rem] bg-gradient-to-br from-brand-start via-brand-mid to-brand-end text-white text-center p-8 shadow-2xl"
          >
            <div className="mx-auto w-28 h-28 rounded-full border-4 border-white shadow-xl overflow-hidden bg-white/20 mb-5">
              {resolveMediaUrl(match.photo_url) ? (
                <img src={resolveMediaUrl(match.photo_url)!} alt="" className="w-full h-full object-cover" />
              ) : (
                <Heart className="w-full h-full p-7 fill-current" aria-hidden="true" />
              )}
            </div>
            <h2 id="match-title" className="text-3xl font-black tracking-tight">
              It's a match!
            </h2>
            <p className="mt-2 text-white/90">
              You and {match.first_name} like each other. You can chat now.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Link
                to={`/chat/${match.id}`}
                className="inline-flex items-center justify-center gap-2 min-h-[48px] rounded-full bg-white text-brand-accent font-black shadow-lg hover:scale-[1.02] transition-transform"
              >
                <MessageCircle className="w-5 h-5" aria-hidden="true" />
                Send a message
              </Link>
              <button
                type="button"
                onClick={() => setMatch(null)}
                autoFocus
                className="min-h-[44px] rounded-full border-2 border-white/70 text-white font-bold hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
              >
                Keep swiping
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
