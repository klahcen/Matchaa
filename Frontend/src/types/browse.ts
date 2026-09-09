/**
 * Types for the Browsing / Suggestions feature.
 * Mirrors the GET /api/browse/suggestions response contract.
 */

export type SortField = 'relevance' | 'age' | 'location' | 'fame' | 'commonTags';
export type SortOrder = 'asc' | 'desc';

/** Sort labels + default directions, matching the backend's DEFAULT_SORT_ORDER. */
export const SORT_OPTIONS: { value: SortField; label: string; defaultOrder: SortOrder }[] = [
  { value: 'relevance', label: 'Relevance', defaultOrder: 'desc' },
  { value: 'age', label: 'Age', defaultOrder: 'asc' },
  { value: 'location', label: 'Distance', defaultOrder: 'asc' },
  { value: 'fame', label: 'Fame rating', defaultOrder: 'desc' },
  { value: 'commonTags', label: 'Common tags', defaultOrder: 'desc' },
];

export const LIMIT_OPTIONS = [12, 24, 48] as const;

/** One suggested profile, as returned by the API. */
export interface Suggestion {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  /** Computed from birthdate server-side; null when the user never set one. */
  age: number | null;
  gender: string | null;
  /** Relative URL served by Express, e.g. "/uploads/photos/abc.jpg". */
  photo_url: string | null;
  location_text: string | null;
  fame_rating: number;
  shared_tag_count: number;
  shared_tags: string[];
  /** Haversine km, or null when either side has no GPS coordinates. */
  distance_km: number | null;
  /** True when within 5 km or location_text matches exactly. */
  same_area: boolean;
  /** Weighted 0–100 match score (see services/matchScoringService.ts). */
  relevance_score: number;
}

export interface BrowsePagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

export interface OrientationContext {
  preference: 'heterosexual' | 'homosexual' | 'bisexual';
  gender: string | null;
  /**
   * True when a heterosexual/homosexual viewer has not set their own gender, so
   * orientation cannot be evaluated. The API returns zero rows plus this flag
   * rather than silently widening the filter to bisexual.
   */
  gender_required: boolean;
}

export interface SuggestionsResponse {
  suggestions: Suggestion[];
  pagination: BrowsePagination;
  sort: { by: SortField; order: SortOrder };
  orientation: OrientationContext;
}

/** Query params for GET /api/browse/suggestions (all optional). */
export interface BrowseQuery {
  minAge?: number;
  maxAge?: number;
  location?: string;
  minFame?: number;
  maxFame?: number;
  tags?: string[];
  sortBy?: SortField;
  sortOrder?: SortOrder;
  page?: number;
  limit?: number;
}

/** Values held by the filter panel before they are applied. */
export interface FilterDraft {
  minAge: string;
  maxAge: string;
  location: string;
  minFame: string;
  maxFame: string;
  tags: string[];
}

export const EMPTY_FILTER_DRAFT: FilterDraft = {
  minAge: '',
  maxAge: '',
  location: '',
  minFame: '',
  maxFame: '',
  tags: [],
};

export const AGE_MIN = 18;
export const AGE_MAX = 120;
export const FAME_MAX = 1_000_000;
