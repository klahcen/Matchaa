import React, { useEffect, useRef, useState } from 'react';
import { profileApi } from '../../api/profile';
import type { Tag } from '../../types/profile';

interface TagPickerProps {
  tags: Tag[];
  onAdded: (tag: Tag) => void;
  onRemoved: (tagId: number) => void;
  onError: (message: string) => void;
}

const MIN_QUERY_LENGTH = 1;
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Interest tag picker.
 *
 * Shows the user's current tags as removable pills, plus an autocomplete input
 * backed by GET /api/tags/search. Suggestions come from the shared tags table,
 * so picking one reuses an existing tag; typing a brand-new name creates it.
 * Search is debounced so the API is not hit on every keystroke.
 */
export const TagPicker: React.FC<TagPickerProps> = ({ tags, onAdded, onRemoved, onError }) => {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = async (raw: string) => {
    const q = raw.trim().replace(/^#/, '').toLowerCase();
    if (q.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    try {
      const results = await profileApi.searchTags(q);
      // Hide tags the user already has — nothing to suggest for those.
      const alreadyOwned = new Set(tags.map((t) => t.name.toLowerCase()));
      setSuggestions(results.filter((t) => !alreadyOwned.has(t.name.toLowerCase())));
      setOpen(true);
      setHighlighted(0);
    } catch {
      // Autocomplete is a convenience; failures must not block manual entry.
      setSuggestions([]);
    }
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value), SEARCH_DEBOUNCE_MS);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Close the suggestion list when clicking outside the picker.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const commit = async (name: string) => {
    const normalized = name.trim().replace(/^#/, '').toLowerCase();
    if (!normalized) return;

    setBusy(true);
    try {
      const tag = await profileApi.addTag(normalized);
      onAdded(tag);
      setInput('');
      setSuggestions([]);
      setOpen(false);
      inputRef.current?.focus();
    } catch (err: any) {
      onError(err?.message || 'Failed to add tag');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (tagId: number) => {
    try {
      await profileApi.removeTag(tagId);
      onRemoved(tagId);
    } catch (err: any) {
      onError(err?.message || 'Failed to remove tag');
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && open && suggestions.length > 0) {
      event.preventDefault();
      setHighlighted((prev) => (prev + 1) % suggestions.length);
      return;
    }
    if (event.key === 'ArrowUp' && open && suggestions.length > 0) {
      event.preventDefault();
      setHighlighted((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (open && suggestions[highlighted]) {
        void commit(suggestions[highlighted].name);
      } else {
        void commit(input);
      }
    }
  };

  return (
    <div>
      {/* Current tags as removable pills */}
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-2 mb-4">
          {tags.map((tag) => (
            <span
              key={tag.id}
              className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full bg-brand-accent/10 text-brand-accent text-sm font-semibold border border-brand-accent/20"
            >
              #{tag.name}
              <button
                type="button"
                onClick={() => handleRemove(tag.id)}
                aria-label={`Remove tag ${tag.name}`}
                className="w-5 h-5 rounded-full flex items-center justify-center text-brand-accent/70 hover:text-white hover:bg-brand-accent transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-brand-muted mb-4">
          No interests yet. Add a few tags so other members can find you.
        </p>
      )}

      {/* Autocomplete input */}
      <div className="relative" ref={containerRef}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-muted text-sm font-semibold pointer-events-none">
              #
            </span>
            <input
              ref={inputRef}
              id="tag-input"
              type="text"
              value={input}
              disabled={busy}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (suggestions.length > 0) setOpen(true);
              }}
              placeholder="vegan, geek, piercing..."
              autoComplete="off"
              aria-label="Add an interest tag"
              aria-expanded={open}
              role="combobox"
              aria-controls="tag-suggestions"
              className="w-full min-h-[46px] pl-8 pr-4 py-2.5 text-sm bg-brand-bg/80 border border-brand-border rounded-xl text-brand-text placeholder-brand-muted/70 outline-none transition-all duration-150 focus:bg-brand-surface focus:border-brand-accent focus:ring-3 focus:ring-brand-accent/20 disabled:opacity-60"
            />
          </div>
          <button
            type="button"
            onClick={() => commit(input)}
            disabled={busy || !input.trim()}
            className="shrink-0 px-5 min-h-[46px] rounded-full font-bold text-sm uppercase tracking-wider text-white bg-gradient-to-br from-brand-start via-brand-mid to-brand-end shadow-lg shadow-brand-accent/25 hover:brightness-105 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none"
          >
            {busy ? 'Adding...' : 'Add'}
          </button>
        </div>

        {open && suggestions.length > 0 && (
          <ul
            id="tag-suggestions"
            role="listbox"
            className="absolute z-20 w-full mt-2 bg-brand-surface border border-brand-border rounded-2xl shadow-xl max-h-48 overflow-y-auto py-1"
          >
            {suggestions.map((tag, index) => (
              <li key={tag.id} role="option" aria-selected={index === highlighted}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlighted(index)}
                  onClick={() => commit(tag.name)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                    index === highlighted
                      ? 'bg-brand-accent/10 text-brand-accent font-semibold'
                      : 'text-brand-text hover:bg-brand-bg'
                  }`}
                >
                  #{tag.name}
                  <span className="ml-2 text-xs text-brand-muted">existing tag</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-brand-muted mt-2">
        2–30 characters. Lowercase letters, numbers, underscores and hyphens — no spaces. Tags are
        shared across Matcha, so “Vegan” and “vegan” are the same tag.
      </p>
    </div>
  );
};
