import React from 'react';
import { Link } from 'react-router-dom';
import { PrimaryButton } from '../common/PrimaryButton';
import { describeRequirement } from '../../utils/profileCompletion';

type EmptyVariant = 'filtered' | 'no-candidates' | 'gender-required' | 'profile-incomplete';

interface BrowseEmptyStateProps {
  variant: EmptyVariant;
  onClearFilters?: () => void;
  /** For 'profile-incomplete': the backend's `missing` keys (biography, tags, ...). */
  missing?: string[];
}

const COPY: Record<EmptyVariant, { title: string; body: string }> = {
  filtered: {
    title: 'No matches found',
    body: 'Nothing matches your current filters. Try widening the age or fame range, removing a tag, or clearing the location field.',
  },
  'no-candidates': {
    title: 'No suggestions yet',
    body: 'There is nobody to show you right now. Suggestions appear once other verified members with a photo match your preferences.',
  },
  'gender-required': {
    title: 'Complete your profile to see matches',
    body: 'Matcha needs both your gender and the gender you want to see before it can suggest compatible profiles.',
  },
  'profile-incomplete': {
    title: 'Complete your profile to start browsing',
    body: 'Other members only see complete profiles, and so do you. Finish these steps to unlock browsing, research, the map and likes:',
  },
};

/**
 * Empty state for the browse grid. Each cause gets its own message, because
 * "your filters are too narrow" and "you must complete your profile" need
 * different actions from the user.
 */
export const BrowseEmptyState: React.FC<BrowseEmptyStateProps> = ({ variant, onClearFilters, missing }) => {
  const { title, body } = COPY[variant];
  const needsProfile = variant === 'gender-required' || variant === 'profile-incomplete';

  return (
    <div className="col-span-full flex flex-col items-center text-center py-14 px-6 bg-brand-surface rounded-3xl border border-brand-border">
      <div
        className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
          needsProfile ? 'bg-brand-accent/10 text-brand-accent' : 'bg-brand-bg text-brand-muted'
        }`}
      >
        {needsProfile ? (
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        ) : (
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        )}
      </div>

      <h3 className="text-lg font-black text-brand-text mb-2">{title}</h3>
      <p className="text-sm text-brand-muted max-w-md leading-relaxed mb-6">{body}</p>

      {variant === 'profile-incomplete' && missing && missing.length > 0 && (
        <ul className="w-full max-w-sm text-left space-y-2 mb-7">
          {missing.map((key) => (
            <li
              key={key}
              className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-brand-bg border border-brand-border text-sm font-semibold text-brand-text"
            >
              <span className="w-2 h-2 shrink-0 rounded-full bg-brand-accent" aria-hidden="true" />
              {describeRequirement(key)}
            </li>
          ))}
        </ul>
      )}

      {variant === 'filtered' && onClearFilters && (
        <div className="w-full max-w-xs">
          <PrimaryButton variant="outline" type="button" onClick={onClearFilters}>
            Clear all filters
          </PrimaryButton>
        </div>
      )}

      {needsProfile && (
        <div className="w-full max-w-xs">
          <Link to="/profile">
            <PrimaryButton type="button">Complete my profile</PrimaryButton>
          </Link>
        </div>
      )}

      {variant === 'no-candidates' && (
        <div className="w-full max-w-xs">
          <Link to="/profile">
            <PrimaryButton variant="outline" type="button">
              Review my profile
            </PrimaryButton>
          </Link>
        </div>
      )}
    </div>
  );
};
