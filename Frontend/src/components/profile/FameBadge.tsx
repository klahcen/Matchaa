import React from 'react';

interface FameBadgeProps {
  rating: number;
  size?: 'sm' | 'lg';
  showLabel?: boolean;
}

/**
 * Read-only fame rating display.
 *
 * Score formula (mirrors the backend fameRatingService):
 *   +1 per profile view received, +3 per like received,
 *   +10 once the profile is complete (bio + >=1 tag + >=1 photo + location).
 */
export const FameBadge: React.FC<FameBadgeProps> = ({ rating, size = 'sm', showLabel = true }) => {
  const isLarge = size === 'lg';

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full bg-gradient-to-br from-brand-start via-brand-mid to-brand-end text-white shadow-lg shadow-brand-accent/25 ${
        isLarge ? 'px-4 py-2' : 'px-3 py-1.5'
      }`}
      title="Fame rating: +1 per profile view, +3 per like, +10 for a complete profile"
    >
      <svg
        className={isLarge ? 'w-5 h-5 fill-current' : 'w-4 h-4 fill-current'}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M12 2l2.9 6.26L21.5 9.3l-4.75 4.4 1.25 6.55L12 17.1l-6 3.15 1.25-6.55L2.5 9.3l6.6-1.04L12 2z" />
      </svg>
      <span className={isLarge ? 'text-xl font-black leading-none' : 'text-sm font-black leading-none'}>
        {rating}
      </span>
      {showLabel && (
        <span className={isLarge ? 'text-xs font-bold uppercase tracking-wider' : 'text-[10px] font-bold uppercase tracking-wider'}>
          Fame
        </span>
      )}
    </div>
  );
};
