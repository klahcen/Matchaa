import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchSuggestions } from '../api/browse';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { BrowseEmptyState } from '../components/browse/BrowseEmptyState';
import { FilterPanel } from '../components/browse/FilterPanel';
import { Pagination } from '../components/browse/Pagination';
import { SortControl } from '../components/browse/SortControl';
import { SuggestionCard } from '../components/browse/SuggestionCard';
import { SuggestionSkeleton } from '../components/browse/SuggestionSkeleton';
import { useAuth } from '../context/AuthContext';
import {
  EMPTY_FILTER_DRAFT,
  LIMIT_OPTIONS,
  type BrowseQuery,
  type FilterDraft,
  type SortField,
  type SortOrder,
  type SuggestionsResponse,
} from '../types/browse';

/** Turns the applied draft into query params, omitting anything left blank. */
const draftToQuery = (draft: FilterDraft): Partial<BrowseQuery> => {
  const toInt = (value: string): number | undefined => {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  return {
    ...(toInt(draft.minAge) !== undefined ? { minAge: toInt(draft.minAge) } : {}),
    ...(toInt(draft.maxAge) !== undefined ? { maxAge: toInt(draft.maxAge) } : {}),
    ...(toInt(draft.minFame) !== undefined ? { minFame: toInt(draft.minFame) } : {}),
    ...(toInt(draft.maxFame) !== undefined ? { maxFame: toInt(draft.maxFame) } : {}),
    ...(draft.location.trim() ? { location: draft.location.trim() } : {}),
    ...(draft.tags.length > 0 ? { tags: draft.tags } : {}),
  };
};

const countActiveFilters = (draft: FilterDraft): number =>
  [
    draft.minAge.trim(),
    draft.maxAge.trim(),
    draft.minFame.trim(),
    draft.maxFame.trim(),
    draft.location.trim(),
  ].filter(Boolean).length + (draft.tags.length > 0 ? 1 : 0);

export const BrowsePage: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  // `draft` is what the panel shows; `applied` is what was last sent to the API.
  // Keeping them separate means typing never triggers a request.
  const [draft, setDraft] = useState<FilterDraft>({ ...EMPTY_FILTER_DRAFT });
  const [applied, setApplied] = useState<FilterDraft>({ ...EMPTY_FILTER_DRAFT });

  const [sortBy, setSortBy] = useState<SortField>('relevance');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(LIMIT_OPTIONS[0]);

  const [data, setData] = useState<SuggestionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Stable identity for "the inputs that should trigger a fetch".
  const requestKey = JSON.stringify({ applied, sortBy, sortOrder, page, limit });
  const [fetchedKey, setFetchedKey] = useState<string | null>(null);

  // Flip into the loading state during render rather than inside the effect, so
  // the effect never calls setState synchronously (avoids a cascading render).
  if (fetchedKey !== requestKey) {
    setFetchedKey(requestKey);
    setLoading(true);
  }

  useEffect(() => {
    const controller = new AbortController();

    const run = async () => {
      try {
        const result = await fetchSuggestions(
          { ...draftToQuery(applied), sortBy, sortOrder, page, limit },
          { signal: controller.signal }
        );
        setData(result);
        setError(null);
      } catch (err: any) {
        // A superseded request was cancelled on purpose — ignore it silently.
        if (controller.signal.aborted) return;
        setError(err?.message || 'Failed to load suggestions');
        setData(null);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void run();
    return () => controller.abort();
    // requestKey captures every value that should retrigger the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  // Scroll to the top of the grid when the page changes.
  const handlePageChange = useCallback((next: number) => {
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleApplyFilters = () => {
    setApplied({ ...draft });
    setPage(1); // a new filter set invalidates the current page position
    setDrawerOpen(false);
  };

  const handleResetFilters = () => {
    setDraft({ ...EMPTY_FILTER_DRAFT });
    setApplied({ ...EMPTY_FILTER_DRAFT });
    setPage(1);
  };

  const handleSortByChange = (field: SortField) => {
    setSortBy(field);
    setPage(1);
  };

  const handleSortOrderChange = (order: SortOrder) => {
    setSortOrder(order);
    setPage(1);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const activeCount = countActiveFilters(applied);
  const suggestions = data?.suggestions ?? [];
  const orientation = data?.orientation;
  const hasFilters = activeCount > 0;

  // Three distinct empty causes, each with its own message and action.
  const emptyVariant = orientation?.gender_required
    ? 'gender-required'
    : hasFilters
      ? 'filtered'
      : 'no-candidates';

  const filterPanel = (
    <FilterPanel
      draft={draft}
      onChange={setDraft}
      onApply={handleApplyFilters}
      onReset={handleResetFilters}
      activeCount={countActiveFilters(draft)}
    />
  );

  return (
    <div className="min-h-screen w-full bg-brand-bg">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-gradient-to-br from-brand-start via-brand-mid to-brand-end shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <span className="text-xl sm:text-2xl font-black tracking-tight text-white">matcha</span>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              to="/profile"
              className="text-white/90 hover:text-white text-xs sm:text-sm font-bold uppercase tracking-wider transition-colors"
            >
              My profile
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="text-white/90 hover:text-white text-xs sm:text-sm font-bold uppercase tracking-wider transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Mobile filter trigger */}
        <div className="lg:hidden mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-full bg-brand-surface border border-brand-border text-sm font-bold text-brand-text hover:border-brand-accent hover:text-brand-accent transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
            {activeCount > 0 && (
              <span className="ml-0.5 min-w-[20px] h-5 px-1.5 rounded-full bg-brand-accent text-white text-[11px] font-black flex items-center justify-center">
                {activeCount}
              </span>
            )}
          </button>

          <p className="text-xs text-brand-muted font-semibold">
            {loading ? 'Searching…' : `${data?.pagination.total ?? 0} matches`}
          </p>
        </div>

        <div className="flex gap-6 items-start">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block w-72 shrink-0 sticky top-24">
            <div className="bg-brand-surface rounded-3xl shadow-md border border-brand-border p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-black uppercase tracking-wider text-brand-text">Filters</h2>
                {activeCount > 0 && (
                  <span className="min-w-[22px] h-5 px-1.5 rounded-full bg-brand-accent text-white text-[11px] font-black flex items-center justify-center">
                    {activeCount}
                  </span>
                )}
              </div>
              {filterPanel}
            </div>
          </aside>

          {/* Results */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-brand-text">Suggested for you</h1>
                <p className="text-xs sm:text-sm text-brand-muted mt-0.5">
                  Ranked by proximity, shared interests and fame.
                  {orientation && !orientation.gender_required && (
                    <> Showing matches for your <span className="font-semibold text-brand-text">{orientation.preference}</span> preference.</>
                  )}
                </p>
              </div>

              <SortControl
                sortBy={sortBy}
                sortOrder={sortOrder}
                onSortByChange={handleSortByChange}
                onSortOrderChange={handleSortOrderChange}
                disabled={loading && !data}
              />
            </div>

            {/* Rows per page */}
            <div className="flex items-center justify-between gap-3 mb-4">
              <p className="text-xs text-brand-muted font-semibold hidden sm:block">
                {loading
                  ? 'Loading suggestions…'
                  : `${suggestions.length} shown · ${data?.pagination.total ?? 0} total`}
              </p>
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-xs text-brand-muted font-semibold">Per page</span>
                {LIMIT_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setLimit(option);
                      setPage(1);
                    }}
                    className={`min-w-[38px] h-8 px-2 rounded-full text-xs font-bold transition-colors ${
                      limit === option
                        ? 'bg-brand-accent text-white'
                        : 'bg-brand-surface border border-brand-border text-brand-muted hover:text-brand-accent hover:border-brand-accent'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <ErrorBanner message={error} onDismiss={() => setError(null)} />

            {/* Grid: 1 column on phones, 2 on tablets, 3 on desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
              {loading ? (
                <SuggestionSkeleton count={Math.min(limit, 6)} />
              ) : suggestions.length > 0 ? (
                suggestions.map((suggestion) => (
                  <SuggestionCard key={suggestion.id} suggestion={suggestion} />
                ))
              ) : (
                <BrowseEmptyState
                  variant={emptyVariant}
                  onClearFilters={handleResetFilters}
                />
              )}
            </div>

            {!loading && data && data.pagination.total > 0 && (
              <div className="mt-8">
                <Pagination
                  pagination={data.pagination}
                  onPageChange={handlePageChange}
                  disabled={loading}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Mobile slide-out filter drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Close filters"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Filter suggestions"
            className="relative ml-auto h-full w-[88%] max-w-sm bg-brand-surface shadow-2xl overflow-y-auto p-5"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-black text-brand-text">Filters</h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close filters"
                className="w-9 h-9 rounded-full bg-brand-bg text-brand-muted hover:text-brand-text flex items-center justify-center transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {filterPanel}
          </div>
        </div>
      )}
    </div>
  );
};
