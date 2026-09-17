import type { BrowsePagination, FilterDraft, OrientationContext, SortOrder, Suggestion } from './browse';

export type SearchSortField = 'age' | 'location' | 'fame' | 'commonTags';

export const SEARCH_SORT_OPTIONS: { value: SearchSortField; label: string; defaultOrder: SortOrder }[] = [
  { value: 'fame', label: 'Fame rating', defaultOrder: 'desc' },
  { value: 'age', label: 'Age', defaultOrder: 'asc' },
  { value: 'location', label: 'Distance', defaultOrder: 'asc' },
  { value: 'commonTags', label: 'Common tags', defaultOrder: 'desc' },
];

export interface SearchQuery {
  minAge?: number;
  maxAge?: number;
  location?: string;
  minFame?: number;
  maxFame?: number;
  tags?: string[];
  tagsMatch?: 'any' | 'all';
  sortBy?: SearchSortField;
  sortOrder?: SortOrder;
  page?: number;
  limit?: number;
}

export interface SearchResponse {
  results: Suggestion[];
  pagination: BrowsePagination;
  sort: { by: SearchSortField; order: SortOrder };
  orientation: OrientationContext;
}

export type SearchFilterDraft = FilterDraft;
