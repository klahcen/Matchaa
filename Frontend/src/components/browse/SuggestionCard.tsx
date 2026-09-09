import React from 'react';
import { Link } from 'react-router-dom';
import { resolveMediaUrl } from '../../api/profile';
import { FameBadge } from '../profile/FameBadge';
import type { Suggestion } from '../../types/browse';

interface SuggestionCardProps {
  suggestion: Suggestion;
}

/** Formats a distance for display, hiding it when coordinates are unknown. */
const formatDistance = (km: number | null): string | null => {
  if (km === null || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
};

/**
 * One suggested profile in the browse grid.
 *
 * The whole card links to /profile/:userId. Only coarse, public fields are
 * shown: approximate location text and rounded distance — never the precise
 * coordinates stored on the user row.
 */
export const SuggestionCard: React.FC<SuggestionCardProps> = ({ suggestion }) => {
  const photo = resolveMediaUrl(suggestion.photo_url);
  const initials =
    `${suggestion.first_name?.[0] ?? ''}${suggestion.last_name?.[0] ?? ''}`.toUpperCase() || '?';
  const distance = formatDistance(suggestion.distance_km);

  return (
    <Link
      to={`/profile/${suggestion.id}`}
      className="group block bg-brand-surface rounded-3xl shadow-md hover:shadow-xl border border-brand-border hover:border-brand-accent/40 overflow-hidden transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-3 focus-visible:ring-brand-accent/40"
    >
      {/* Photo */}
      <div className="relative aspect-[4/5] bg-brand-bg overflow-hidden">
        {photo ? (
          <img
            src={photo}
            alt={`${suggestion.first_name}'s profile picture`}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-start/15 via-brand-mid/15 to-brand-end/15">
            <span className="text-4xl font-black text-brand-accent/60">{initials}</span>
          </div>
        )}

        {/* Relevance score */}
        <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur-sm text-white text-[11px] font-black tracking-wide">
          {suggestion.relevance_score}% match
        </div>

        {/* Same-area highlight */}
        {suggestion.same_area && (
          <div className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-full bg-gradient-to-br from-brand-start via-brand-mid to-brand-end text-white text-[10px] font-black uppercase tracking-wider shadow-md">
            Near you
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-base font-black text-brand-text truncate">
            {suggestion.first_name}
            {suggestion.age !== null && (
              <span className="font-bold text-brand-muted">, {suggestion.age}</span>
            )}
          </h3>
          <div className="shrink-0">
            <FameBadge rating={suggestion.fame_rating} showLabel={false} />
          </div>
        </div>

        <p className="text-xs text-brand-muted truncate mb-2.5">@{suggestion.username}</p>

        <div className="flex flex-col gap-1 text-xs text-brand-muted mb-3">
          {suggestion.location_text && (
            <span className="flex items-center gap-1.5 truncate">
              <svg className="w-3.5 h-3.5 shrink-0 text-brand-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="truncate">{suggestion.location_text}</span>
            </span>
          )}
          {distance && (
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 shrink-0 text-brand-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              {distance}
            </span>
          )}
        </div>

        {/* Shared interest tags */}
        {suggestion.shared_tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {suggestion.shared_tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-1 rounded-full bg-brand-accent/10 text-brand-accent text-[11px] font-semibold border border-brand-accent/15"
              >
                #{tag}
              </span>
            ))}
            {suggestion.shared_tags.length > 4 && (
              <span className="px-2.5 py-1 rounded-full bg-brand-bg text-brand-muted text-[11px] font-semibold">
                +{suggestion.shared_tags.length - 4}
              </span>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-brand-muted italic">No shared interests yet</p>
        )}
      </div>
    </Link>
  );
};
