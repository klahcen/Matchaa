import React, { useEffect, useRef, useState } from 'react';
import { profileApi } from '../../api/profile';
import { PrimaryButton } from '../common/PrimaryButton';
import {
  AGE_MAX,
  AGE_MIN,
  EMPTY_FILTER_DRAFT,
  FAME_MAX,
  type FilterDraft,
} from '../../types/browse';
import type { Tag } from '../../types/profile';

interface FilterPanelProps {
  draft: FilterDraft;
  onChange: (draft: FilterDraft) => void;
  onApply: () => void;
  onReset: () => void;
  /** Number of filters currently active, for the "clear" affordance. */
  activeCount: number;
}

const SEARCH_DEBOUNCE_MS = 250;

/**
 * Combined filter controls: age range, location text, fame range and a
 * multi-select tag picker.
 *
 * The tag picker reuses the Profile feature's shared GET /api/tags/search
 * endpoint, so suggestions come from the same global tag pool and selecting one
 * filters by an existing tag rather than inventing a new one.
 *
 * Values are held in a draft by the parent and only sent to the API when the
 * user presses "Apply", so typing does not fire a request per keystroke.
 */
export const FilterPanel: React.FC<FilterPanelProps> = ({
  draft,
  onChange,
  onApply,
  onReset,
  activeCount,
}) => {
  const [tagQuery, setTagQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [open, setOpen] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const tagBoxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (tagBoxRef.current && !tagBoxRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const patch = (partial: Partial<FilterDraft>) => onChange({ ...draft, ...partial });

  const searchTags = async (raw: string) => {
    const q = raw.trim().replace(/^#/, '').toLowerCase();
    if (!q) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    try {
      const results = await profileApi.searchTags(q);
      const chosen = new Set(draft.tags);
      setSuggestions(results.filter((t) => !chosen.has(t.name)));
      setOpen(true);
    } catch {
      setSuggestions([]);
    }
  };

  const handleTagInput = (value: string) => {
    setTagQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchTags(value), SEARCH_DEBOUNCE_MS);
  };

  const addTag = (name: string) => {
    const normalized = name.trim().replace(/^#/, '').toLowerCase();
    if (!normalized || draft.tags.includes(normalized)) return;
    patch({ tags: [...draft.tags, normalized] });
    setTagQuery('');
    setSuggestions([]);
    setOpen(false);
  };

  /**
   * Lets a user type a tag that does not exist yet; the backend accepts any
   * well-formed name and simply returns no matches for it.
   */
  const commitTypedTag = () => {
    const normalized = tagQuery.trim().replace(/^#/, '').toLowerCase();
    if (!normalized) return;
    if (!/^[a-z0-9_-]{2,30}$/.test(normalized)) {
      setFieldError('Tags must be 2-30 characters: lowercase letters, numbers, _ or -.');
      return;
    }
    setFieldError(null);
    addTag(normalized);
  };

  const removeTag = (name: string) => patch({ tags: draft.tags.filter((t) => t !== name) });

  /**
   * Client-side range sanity check mirroring the server rule, so an impossible
   * range is caught before a round-trip.
   */
  const validateRanges = (): string | null => {
    const minAge = draft.minAge.trim() ? Number(draft.minAge) : null;
    const maxAge = draft.maxAge.trim() ? Number(draft.maxAge) : null;
    if (minAge !== null && maxAge !== null && minAge > maxAge) {
      return 'Minimum age cannot be greater than maximum age.';
    }
    const minFame = draft.minFame.trim() ? Number(draft.minFame) : null;
    const maxFame = draft.maxFame.trim() ? Number(draft.maxFame) : null;
    if (minFame !== null && maxFame !== null && minFame > maxFame) {
      return 'Minimum fame cannot be greater than maximum fame.';
    }
    return null;
  };

  const handleApply = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validateRanges();
    setFieldError(problem);
    if (problem) return;
    onApply();
  };

  const handleReset = () => {
    setFieldError(null);
    setTagQuery('');
    setSuggestions([]);
    onChange({ ...EMPTY_FILTER_DRAFT });
    onReset();
  };

  const numberField = (
    id: string,
    label: string,
    value: string,
    min: number,
    max: number,
    onValue: (v: string) => void
  ) => (
    <div className="flex-1 min-w-0">
      <label htmlFor={id} className="block text-[11px] font-semibold uppercase tracking-wider text-brand-muted mb-1">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        placeholder={`${min}–${max}`}
        onChange={(e) => onValue(e.target.value)}
        className="w-full min-h-[42px] px-3 py-2 text-sm bg-brand-bg/80 border border-brand-border rounded-xl text-brand-text placeholder-brand-muted/60 outline-none transition-all duration-150 focus:bg-brand-surface focus:border-brand-accent focus:ring-3 focus:ring-brand-accent/20"
      />
    </div>
  );

  return (
    <form onSubmit={handleApply} noValidate className="flex flex-col gap-5">
      {/* Age range */}
      <div>
        <h3 className="text-xs font-black uppercase tracking-wider text-brand-text mb-2.5">Age</h3>
        <div className="flex gap-2.5 items-end">
          {numberField('filter-min-age', 'Min', draft.minAge, AGE_MIN, AGE_MAX, (v) => patch({ minAge: v }))}
          <span className="pb-3 text-brand-muted text-sm">–</span>
          {numberField('filter-max-age', 'Max', draft.maxAge, AGE_MIN, AGE_MAX, (v) => patch({ maxAge: v }))}
        </div>
      </div>

      {/* Location */}
      <div>
        <h3 className="text-xs font-black uppercase tracking-wider text-brand-text mb-2.5">Location</h3>
        <input
          id="filter-location"
          type="text"
          value={draft.location}
          maxLength={255}
          placeholder="e.g. Casablanca"
          onChange={(e) => patch({ location: e.target.value })}
          className="w-full min-h-[42px] px-3 py-2 text-sm bg-brand-bg/80 border border-brand-border rounded-xl text-brand-text placeholder-brand-muted/60 outline-none transition-all duration-150 focus:bg-brand-surface focus:border-brand-accent focus:ring-3 focus:ring-brand-accent/20"
        />
        <p className="text-[11px] text-brand-muted mt-1.5">Partial match on the public location text.</p>
      </div>

      {/* Fame range */}
      <div>
        <h3 className="text-xs font-black uppercase tracking-wider text-brand-text mb-2.5">Fame rating</h3>
        <div className="flex gap-2.5 items-end">
          {numberField('filter-min-fame', 'Min', draft.minFame, 0, FAME_MAX, (v) => patch({ minFame: v }))}
          <span className="pb-3 text-brand-muted text-sm">–</span>
          {numberField('filter-max-fame', 'Max', draft.maxFame, 0, FAME_MAX, (v) => patch({ maxFame: v }))}
        </div>
      </div>

      {/* Tag multi-select */}
      <div>
        <h3 className="text-xs font-black uppercase tracking-wider text-brand-text mb-2.5">
          Shared interests
        </h3>

        {draft.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {draft.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-brand-accent/10 text-brand-accent text-xs font-semibold border border-brand-accent/20"
              >
                #{tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove ${tag} filter`}
                  className="w-4 h-4 rounded-full flex items-center justify-center text-brand-accent/70 hover:text-white hover:bg-brand-accent transition-colors"
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="relative" ref={tagBoxRef}>
          <div className="flex gap-2">
            <input
              id="filter-tags"
              type="text"
              value={tagQuery}
              placeholder="Search tags..."
              autoComplete="off"
              role="combobox"
              aria-expanded={open}
              aria-controls="filter-tag-suggestions"
              onChange={(e) => handleTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (open && suggestions[0]) addTag(suggestions[0].name);
                  else commitTypedTag();
                }
                if (e.key === 'Escape') setOpen(false);
              }}
              className="flex-1 min-w-0 min-h-[42px] px-3 py-2 text-sm bg-brand-bg/80 border border-brand-border rounded-xl text-brand-text placeholder-brand-muted/60 outline-none transition-all duration-150 focus:bg-brand-surface focus:border-brand-accent focus:ring-3 focus:ring-brand-accent/20"
            />
            <button
              type="button"
              onClick={commitTypedTag}
              disabled={!tagQuery.trim()}
              aria-label="Add tag filter"
              className="shrink-0 w-11 min-h-[42px] rounded-xl bg-brand-accent/10 text-brand-accent hover:bg-brand-accent hover:text-white transition-colors disabled:opacity-40 disabled:pointer-events-none font-black text-lg"
            >
              +
            </button>
          </div>

          {open && suggestions.length > 0 && (
            <ul
              id="filter-tag-suggestions"
              role="listbox"
              className="absolute z-30 w-full mt-1.5 bg-brand-surface border border-brand-border rounded-2xl shadow-xl max-h-44 overflow-y-auto py-1"
            >
              {suggestions.map((tag) => (
                <li key={tag.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onClick={() => addTag(tag.name)}
                    className="w-full text-left px-3.5 py-2 text-sm text-brand-text hover:bg-brand-bg transition-colors"
                  >
                    #{tag.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-[11px] text-brand-muted mt-1.5">Matches profiles sharing at least one selected tag.</p>
      </div>

      {fieldError && (
        <p className="text-xs text-brand-error-text font-medium bg-brand-error-bg border border-brand-error-text/20 rounded-xl px-3 py-2">
          {fieldError}
        </p>
      )}

      <div className="flex flex-col gap-2.5 pt-1">
        <PrimaryButton type="submit">
          Apply {activeCount > 0 ? `(${activeCount})` : 'filters'}
        </PrimaryButton>
        <PrimaryButton
          type="button"
          variant="ghost"
          onClick={handleReset}
          disabled={activeCount === 0}
        >
          Clear all
        </PrimaryButton>
      </div>
    </form>
  );
};
