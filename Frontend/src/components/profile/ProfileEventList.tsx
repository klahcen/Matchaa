import React from 'react';
import { resolveMediaUrl } from '../../api/profile';
import type { ProfileSummary } from '../../types/profile';

interface ProfileEventListProps {
  people: ProfileSummary[];
  loading: boolean;
  /** e.g. "No one has viewed your profile yet." */
  emptyMessage: string;
  /** e.g. "Viewed" or "Liked" — labels the timestamp on each row. */
  eventLabel: string;
}

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Shared list of other members, used by both the "Who viewed me" /
 * "Who liked me" tabs on the profile page and their standalone pages.
 *
 * Only public summary fields are rendered (name, username, profile picture,
 * fame rating, approximate location) — never email or precise coordinates.
 */
export const ProfileEventList: React.FC<ProfileEventListProps> = ({
  people,
  loading,
  emptyMessage,
  eventLabel,
}) => {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-9 h-9 border-4 border-brand-border border-t-brand-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (people.length === 0) {
    return (
      <div className="text-center py-10 px-4">
        <div className="w-14 h-14 mx-auto rounded-full bg-brand-bg flex items-center justify-center text-brand-muted mb-3">
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
        </div>
        <p className="text-sm text-brand-muted">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2.5">
      {people.map((person) => {
        const avatar = resolveMediaUrl(person.profile_picture_url);
        const initials = `${person.first_name?.[0] ?? ''}${person.last_name?.[0] ?? ''}`.toUpperCase();

        return (
          <li
            key={person.id}
            className="flex items-center gap-3 sm:gap-4 p-3 rounded-2xl bg-brand-bg border border-brand-border hover:border-brand-accent/40 transition-colors"
          >
            {avatar ? (
              <img
                src={avatar}
                alt={`${person.username}'s profile picture`}
                className="w-12 h-12 rounded-full object-cover shrink-0 border-2 border-brand-surface"
                loading="lazy"
              />
            ) : (
              <div className="w-12 h-12 rounded-full shrink-0 bg-gradient-to-br from-brand-start via-brand-mid to-brand-end flex items-center justify-center text-white font-black text-sm">
                {initials || '?'}
              </div>
            )}

            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-brand-text truncate">
                {person.first_name} {person.last_name}
                {person.age != null && (
                  <span className="font-semibold text-brand-muted">, {person.age}</span>
                )}
              </p>
              <p className="text-xs text-brand-muted truncate">@{person.username}</p>
              {person.location_text && (
                <p className="text-xs text-brand-muted truncate mt-0.5">
                  <span aria-hidden="true">📍 </span>
                  {person.location_text}
                </p>
              )}
            </div>

            <div className="shrink-0 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider text-brand-muted">
                {eventLabel}
              </p>
              <p className="text-xs text-brand-text font-semibold">{formatDate(person.event_at)}</p>
              <p className="text-[10px] text-brand-accent font-bold mt-0.5">
                ★ {person.fame_rating} fame
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
};
