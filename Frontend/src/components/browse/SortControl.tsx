import React from 'react';
import { SORT_OPTIONS, type SortField, type SortOrder } from '../../types/browse';

interface SortControlProps {
  sortBy: SortField;
  sortOrder: SortOrder;
  onSortByChange: (field: SortField) => void;
  onSortOrderChange: (order: SortOrder) => void;
  disabled?: boolean;
}

const ORDER_LABELS: Record<SortField, { asc: string; desc: string }> = {
  relevance: { asc: 'Lowest match first', desc: 'Best match first' },
  age: { asc: 'Youngest first', desc: 'Oldest first' },
  location: { asc: 'Nearest first', desc: 'Farthest first' },
  fame: { asc: 'Lowest fame first', desc: 'Highest fame first' },
  commonTags: { asc: 'Fewest tags first', desc: 'Most tags first' },
};

/**
 * Sort field dropdown plus a direction toggle.
 *
 * Changing the field resets the direction to that field's sensible default
 * (fame/commonTags descending, age and distance ascending), matching the
 * backend's DEFAULT_SORT_ORDER so the two never disagree.
 */
export const SortControl: React.FC<SortControlProps> = ({
  sortBy,
  sortOrder,
  onSortByChange,
  onSortOrderChange,
  disabled,
}) => {
  const handleFieldChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const field = event.target.value as SortField;
    const option = SORT_OPTIONS.find((o) => o.value === field);
    onSortByChange(field);
    if (option) onSortOrderChange(option.defaultOrder);
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
      <div className="relative flex-1 sm:flex-none sm:min-w-[190px]">
        <label htmlFor="sort-by" className="sr-only">
          Sort suggestions by
        </label>
        <select
          id="sort-by"
          value={sortBy}
          disabled={disabled}
          onChange={handleFieldChange}
          className="w-full min-h-[44px] appearance-none pl-4 pr-10 py-2.5 text-sm font-semibold bg-brand-surface border border-brand-border rounded-full text-brand-text outline-none transition-all duration-150 focus:border-brand-accent focus:ring-3 focus:ring-brand-accent/20 disabled:opacity-50 cursor-pointer"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <svg
          className="w-4 h-4 absolute right-4 top-1/2 -translate-y-1/2 text-brand-muted pointer-events-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onSortOrderChange(sortOrder === 'asc' ? 'desc' : 'asc')}
        title={ORDER_LABELS[sortBy][sortOrder]}
        aria-label={`Sort direction: ${ORDER_LABELS[sortBy][sortOrder]}. Click to reverse.`}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-full bg-brand-surface border border-brand-border text-sm font-semibold text-brand-text hover:border-brand-accent hover:text-brand-accent transition-colors disabled:opacity-50 disabled:pointer-events-none"
      >
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${sortOrder === 'asc' ? '' : 'rotate-180'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" />
        </svg>
        <span className="whitespace-nowrap">{ORDER_LABELS[sortBy][sortOrder]}</span>
      </button>
    </div>
  );
};
