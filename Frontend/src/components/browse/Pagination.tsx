import React from 'react';
import type { BrowsePagination } from '../../types/browse';

interface PaginationProps {
  pagination: BrowsePagination;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

/**
 * Builds a compact page list with ellipses, e.g. 1 … 4 5 [6] 7 8 … 20.
 * Keeps the control a fixed width regardless of how many pages exist.
 */
const buildPageItems = (current: number, total: number): (number | 'gap')[] => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const items: (number | 'gap')[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) items.push('gap');
  for (let p = start; p <= end; p++) items.push(p);
  if (end < total - 1) items.push('gap');

  items.push(total);
  return items;
};

export const Pagination: React.FC<PaginationProps> = ({ pagination, onPageChange, disabled }) => {
  const { page, total_pages: totalPages, total, has_next: hasNext, has_prev: hasPrev } = pagination;

  if (total === 0 || totalPages <= 1) return null;

  const items = buildPageItems(page, totalPages);

  const arrow = (label: string, target: number, enabled: boolean, icon: React.ReactNode) => (
    <button
      type="button"
      onClick={() => onPageChange(target)}
      disabled={disabled || !enabled}
      aria-label={label}
      className="w-10 h-10 flex items-center justify-center rounded-full bg-brand-surface border border-brand-border text-brand-text hover:border-brand-accent hover:text-brand-accent transition-colors disabled:opacity-40 disabled:pointer-events-none"
    >
      {icon}
    </button>
  );

  return (
    <nav className="flex flex-col items-center gap-3" aria-label="Suggestions pagination">
      <div className="flex items-center gap-1.5 flex-wrap justify-center">
        {arrow('Previous page', page - 1, hasPrev, (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
          </svg>
        ))}

        {items.map((item, index) =>
          item === 'gap' ? (
            <span key={`gap-${index}`} className="w-8 text-center text-brand-muted text-sm select-none">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              disabled={disabled}
              aria-current={item === page ? 'page' : undefined}
              className={`w-10 h-10 rounded-full text-sm font-bold transition-all duration-200 ${
                item === page
                  ? 'bg-gradient-to-br from-brand-start via-brand-mid to-brand-end text-white shadow-lg shadow-brand-accent/25'
                  : 'bg-brand-surface border border-brand-border text-brand-muted hover:border-brand-accent hover:text-brand-accent'
              } disabled:opacity-50 disabled:pointer-events-none`}
            >
              {item}
            </button>
          )
        )}

        {arrow('Next page', page + 1, hasNext, (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
          </svg>
        ))}
      </div>

      <p className="text-xs text-brand-muted">
        Page {page} of {totalPages} · {total} {total === 1 ? 'match' : 'matches'}
      </p>
    </nav>
  );
};
