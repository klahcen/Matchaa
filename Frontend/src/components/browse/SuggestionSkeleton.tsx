import React from 'react';

interface SuggestionSkeletonProps {
  count?: number;
}

/**
 * Shimmering placeholder cards shown while suggestions load, sized to match
 * SuggestionCard so the grid does not jump when real results arrive.
 */
export const SuggestionSkeleton: React.FC<SuggestionSkeletonProps> = ({ count = 8 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="bg-brand-surface rounded-3xl border border-brand-border overflow-hidden animate-pulse"
          aria-hidden="true"
        >
          <div className="aspect-[4/5] bg-brand-border/60" />
          <div className="p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="h-4 w-2/3 rounded-full bg-brand-border/70" />
              <div className="h-5 w-9 rounded-full bg-brand-border/70" />
            </div>
            <div className="h-3 w-1/2 rounded-full bg-brand-border/50" />
            <div className="h-3 w-3/4 rounded-full bg-brand-border/50" />
            <div className="flex gap-1.5 pt-1">
              <div className="h-6 w-14 rounded-full bg-brand-border/50" />
              <div className="h-6 w-12 rounded-full bg-brand-border/50" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
};
