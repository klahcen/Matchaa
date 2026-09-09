import React from 'react';
import { Link } from 'react-router-dom';
import { PrimaryButton } from '../common/PrimaryButton';

type EmptyVariant = 'filtered' | 'no-candidates' | 'gender-required';

interface BrowseEmptyStateProps {
  variant: EmptyVariant;
  onClearFilters?: () => void;
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
    title: 'Set your gender to see matches',
    body: 'You chose a gendered preference, so Matcha needs your own gender to work out who to show you. Nothing has been widened or guessed — add it and your suggestions will appear.',
  },
};

/**
 * Empty state for the browse grid. Three distinct causes get three distinct
 * messages, because "your filters are too narrow" and "you must complete your
 * profile" need different actions from the user.
 */
export const BrowseEmptyState: React.FC<BrowseEmptyStateProps> = ({ variant, onClearFilters }) => {
  const { title, body } = COPY[variant];

  return (
    <div className="col-span-full flex flex-col items-center text-center py-14 px-6 bg-brand-surface rounded-3xl border border-brand-border">
      <div className="w-16 h-16 rounded-full bg-brand-bg flex items-center justify-center text-brand-muted mb-4">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      <h3 className="text-lg font-black text-brand-text mb-2">{title}</h3>
      <p className="text-sm text-brand-muted max-w-md leading-relaxed mb-6">{body}</p>

      {variant === 'filtered' && onClearFilters && (
        <div className="w-full max-w-xs">
          <PrimaryButton variant="outline" type="button" onClick={onClearFilters}>
            Clear all filters
          </PrimaryButton>
        </div>
      )}

      {variant === 'gender-required' && (
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
