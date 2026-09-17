import React, { useCallback, useEffect, useState } from 'react';
import { fetchSearchResults } from '../api/search';
import { BrowseEmptyState } from '../components/browse/BrowseEmptyState';
import { FilterPanel } from '../components/browse/FilterPanel';
import { Pagination } from '../components/browse/Pagination';
import { SuggestionCard } from '../components/browse/SuggestionCard';
import { SuggestionSkeleton } from '../components/browse/SuggestionSkeleton';
import { ErrorBanner } from '../components/common/ErrorBanner';
import {
  EMPTY_FILTER_DRAFT,
  LIMIT_OPTIONS,
  type FilterDraft,
  type SortOrder,
} from '../types/browse';
import {
  SEARCH_SORT_OPTIONS,
  type SearchQuery,
  type SearchResponse,
  type SearchSortField,
} from '../types/search';

const draftToQuery = (draft: FilterDraft): Partial<SearchQuery> => {
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
    ...(draft.tags.length > 0 ? { tags: draft.tags, tagsMatch: 'any' } : {}),
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

export const ResearchPage: React.FC = () => {
  const [draft, setDraft] = useState<FilterDraft>({ ...EMPTY_FILTER_DRAFT });
  const [applied, setApplied] = useState<FilterDraft>({ ...EMPTY_FILTER_DRAFT });
  const [sortBy, setSortBy] = useState<SearchSortField>('fame');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(LIMIT_OPTIONS[0]);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const requestKey = JSON.stringify({ applied, sortBy, sortOrder, page, limit });
  const [fetchedKey, setFetchedKey] = useState<string | null>(null);

  if (fetchedKey !== requestKey) {
    setFetchedKey(requestKey);
    setLoading(true);
  }

  useEffect(() => {
    const controller = new AbortController();

    const run = async () => {
      try {
        const result = await fetchSearchResults(
          { ...draftToQuery(applied), sortBy, sortOrder, page, limit },
          { signal: controller.signal }
        );
        setData(result);
        setError(null);
      } catch (err: any) {
        if (controller.signal.aborted) return;
        setData(null);
        setError(err?.message || 'Failed to load research results');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void run();
    return () => controller.abort();
    // requestKey captures every value that should retrigger the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const handlePageChange = useCallback((next: number) => {
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleApplyFilters = () => {
    setApplied({ ...draft });
    setPage(1);
    setDrawerOpen(false);
  };

  const handleResetFilters = () => {
    setDraft({ ...EMPTY_FILTER_DRAFT });
    setApplied({ ...EMPTY_FILTER_DRAFT });
    setPage(1);
  };

  const handleSortByChange = (field: SearchSortField) => {
    const option = SEARCH_SORT_OPTIONS.find((item) => item.value === field);
    setSortBy(field);
    setSortOrder(option?.defaultOrder ?? 'desc');
    setPage(1);
  };

  const activeCount = countActiveFilters(applied);
  const results = data?.results ?? [];
  const hasFilters = activeCount > 0;

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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="lg:hidden mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-full bg-brand-surface border border-brand-border text-sm font-bold text-brand-text hover:border-brand-accent hover:text-brand-accent transition-colors"
          >
            Filters
            {activeCount > 0 && (
              <span className="ml-0.5 min-w-[20px] h-5 px-1.5 rounded-full bg-brand-accent text-white text-[11px] font-black flex items-center justify-center">
                {activeCount}
              </span>
            )}
          </button>
          <p className="text-xs text-brand-muted font-semibold">
            {loading ? 'Searching…' : `${data?.pagination.total ?? 0} results`}
          </p>
        </div>

        <div className="flex gap-6 items-start">
          <aside className="hidden lg:block w-72 shrink-0 sticky top-24">
            <div className="bg-brand-surface rounded-3xl shadow-md border border-brand-border p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-black uppercase tracking-wider text-brand-text">Research filters</h2>
                {activeCount > 0 && (
                  <span className="min-w-[22px] h-5 px-1.5 rounded-full bg-brand-accent text-white text-[11px] font-black flex items-center justify-center">
                    {activeCount}
                  </span>
                )}
              </div>
              {filterPanel}
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-brand-text">Research members</h1>
                <p className="text-xs sm:text-sm text-brand-muted mt-0.5">
                  Advanced search over eligible profiles. Results still respect gender preference, blocks, verified accounts, and profile photos.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={sortBy}
                  onChange={(event) => handleSortByChange(event.target.value as SearchSortField)}
                  disabled={loading && !data}
                  className="min-h-[44px] px-4 rounded-full bg-brand-surface border border-brand-border text-sm font-bold text-brand-text outline-none focus:border-brand-accent focus:ring-3 focus:ring-brand-accent/20"
                  aria-label="Sort research results"
                >
                  {SEARCH_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
                    setPage(1);
                  }}
                  disabled={loading && !data}
                  className="min-h-[44px] px-4 rounded-full bg-brand-surface border border-brand-border text-sm font-bold text-brand-text hover:border-brand-accent hover:text-brand-accent transition-colors disabled:opacity-50"
                >
                  {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 mb-4">
              <p className="text-xs text-brand-muted font-semibold hidden sm:block">
                {loading ? 'Loading research results…' : `${results.length} shown · ${data?.pagination.total ?? 0} total`}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
              {loading ? (
                <SuggestionSkeleton count={Math.min(limit, 6)} />
              ) : results.length > 0 ? (
                results.map((result) => <SuggestionCard key={result.id} suggestion={result} />)
              ) : (
                <BrowseEmptyState
                  variant={hasFilters ? 'filtered' : 'no-candidates'}
                  onClearFilters={handleResetFilters}
                />
              )}
            </div>

            {!loading && data && data.pagination.total > 0 && (
              <div className="mt-8">
                <Pagination pagination={data.pagination} onPageChange={handlePageChange} disabled={loading} />
              </div>
            )}
          </div>
        </div>
      </main>

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
            aria-label="Research filters"
            className="relative ml-auto h-full w-[88%] max-w-sm bg-brand-surface shadow-2xl overflow-y-auto p-5"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-black text-brand-text">Research filters</h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close filters"
                className="w-9 h-9 rounded-full bg-brand-bg text-brand-muted hover:text-brand-text flex items-center justify-center transition-colors"
              >
                ×
              </button>
            </div>
            {filterPanel}
          </div>
        </div>
      )}
    </div>
  );
};
