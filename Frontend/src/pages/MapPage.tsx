import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Navigation, RefreshCw } from 'lucide-react';
import { fetchSearchResults } from '../api/search';
import { resolveMediaUrl } from '../api/profile';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { FameBadge } from '../components/profile/FameBadge';
import type { Suggestion } from '../types/browse';

interface MapPoint extends Suggestion {
  map_latitude: number;
  map_longitude: number;
}

interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

interface PositionedMapPoint extends MapPoint {
  screenX: number;
  screenY: number;
  offsetX: number;
  offsetY: number;
  spreadIndex: number;
  spreadCount: number;
}

const isMappable = (profile: Suggestion): profile is MapPoint =>
  typeof profile.map_latitude === 'number' &&
  Number.isFinite(profile.map_latitude) &&
  typeof profile.map_longitude === 'number' &&
  Number.isFinite(profile.map_longitude);

const formatDistance = (km: number | null): string | null => {
  if (km === null || !Number.isFinite(km)) return null;
  if (km < 1) return `${Math.round(km * 1000)} m away`;
  if (km < 10) return `${km.toFixed(1)} km away`;
  return `${Math.round(km)} km away`;
};

const initialsFor = (profile: Suggestion): string =>
  `${profile.first_name?.[0] ?? ''}${profile.last_name?.[0] ?? ''}`.toUpperCase() || '?';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const projectPoint = (point: MapPoint, bounds: MapBounds) => {
  const x = ((point.map_longitude - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
  const y = ((bounds.maxLat - point.map_latitude) / (bounds.maxLat - bounds.minLat)) * 100;

  return {
    screenX: clamp(x, 5, 95),
    screenY: clamp(y, 8, 92),
  };
};

const spreadDenseMapPoints = (points: MapPoint[], bounds: MapBounds | null): PositionedMapPoint[] => {
  if (!bounds) {
    return points.map((point) => ({
      ...point,
      screenX: 50,
      screenY: 50,
      offsetX: 0,
      offsetY: 0,
      spreadIndex: 0,
      spreadCount: 1,
    }));
  }

  const projected = points.map((point) => ({
    point,
    ...projectPoint(point, bounds),
  }));

  const groups: typeof projected[] = [];
  const groupDistance = 7;

  projected.forEach((candidate) => {
    const group = groups.find((items) => {
      const centerX = items.reduce((sum, item) => sum + item.screenX, 0) / items.length;
      const centerY = items.reduce((sum, item) => sum + item.screenY, 0) / items.length;
      return Math.hypot(candidate.screenX - centerX, candidate.screenY - centerY) < groupDistance;
    });

    if (group) {
      group.push(candidate);
    } else {
      groups.push([candidate]);
    }
  });

  const positioned = new Map<number, PositionedMapPoint>();

  groups.forEach((group) => {
    const ordered = [...group].sort((a, b) => a.point.id - b.point.id);
    const columns = Math.ceil(Math.sqrt(ordered.length));
    const rows = Math.ceil(ordered.length / columns);
    const markerGap = ordered.length > 16 ? 46 : 52;

    ordered.forEach((item, index) => {
      const shouldSpread = ordered.length > 1;
      const column = index % columns;
      const row = Math.floor(index / columns);

      positioned.set(item.point.id, {
        ...item.point,
        screenX: item.screenX,
        screenY: item.screenY,
        offsetX: shouldSpread ? (column - (columns - 1) / 2) * markerGap : 0,
        offsetY: shouldSpread ? (row - (rows - 1) / 2) * markerGap : 0,
        spreadIndex: index,
        spreadCount: ordered.length,
      });
    });
  });

  return projected.map((item) => positioned.get(item.point.id)).filter(Boolean) as PositionedMapPoint[];
};

export const MapPage: React.FC = () => {
  const [profiles, setProfiles] = useState<Suggestion[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProfiles = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSearchResults({ sortBy: 'location', sortOrder: 'asc', limit: 48 });
      setProfiles(data.results);
      setSelectedId((current) => (data.results.some((profile) => profile.id === current) ? current : null));
    } catch (err: any) {
      setError(err?.message || 'Failed to load map users');
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProfiles();
  }, []);

  const points = useMemo(() => profiles.filter(isMappable), [profiles]);

  const bounds = useMemo(() => {
    if (points.length === 0) return null;
    const latitudes = points.map((point) => point.map_latitude);
    const longitudes = points.map((point) => point.map_longitude);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);
    const latSpread = Math.max(maxLat - minLat, 0.02);
    const lngSpread = Math.max(maxLng - minLng, 0.02);
    return {
      minLat: minLat - latSpread * 0.15,
      maxLat: maxLat + latSpread * 0.15,
      minLng: minLng - lngSpread * 0.15,
      maxLng: maxLng + lngSpread * 0.15,
    };
  }, [points]);

  const positionedPoints = useMemo(() => spreadDenseMapPoints(points, bounds), [points, bounds]);
  const selected = positionedPoints.find((profile) => profile.id === selectedId) ?? positionedPoints[0] ?? null;

  const markerStyle = (point: PositionedMapPoint, active: boolean): React.CSSProperties => ({
    left: `${point.screenX}%`,
    top: `${point.screenY}%`,
    transform: `translate(calc(-50% + ${point.offsetX}px), calc(-100% + ${point.offsetY}px)) scale(${active ? 1.08 : 1})`,
    zIndex: active ? 100 : 20 + Math.min(point.spreadIndex, 20),
    willChange: 'transform',
  });

  return (
    <div className="min-h-screen w-full bg-brand-bg">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-brand-text">Map nearby members</h1>
            <p className="text-sm text-brand-muted mt-1 max-w-3xl">
              Neighborhood-level pins for eligible profiles only. Exact GPS coordinates stay private; markers are intentionally shifted slightly.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadProfiles()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 rounded-full bg-brand-surface border border-brand-border text-sm font-black uppercase tracking-wider text-brand-text hover:border-brand-accent hover:text-brand-accent transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        <ErrorBanner message={error} onDismiss={() => setError(null)} />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
          <div className="space-y-3">
            <div className="rounded-2xl bg-brand-surface border border-brand-border shadow-sm px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-xs font-black uppercase tracking-wider text-brand-text flex items-center gap-2">
                <Navigation className="w-4 h-4 text-brand-accent" /> Matcha Map
              </p>
              <p className="text-xs text-brand-muted">{points.length} users with GPS area</p>
            </div>

            <section className="relative min-h-[560px] rounded-3xl overflow-hidden border border-brand-border bg-brand-surface shadow-md">
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.65)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.65)_1px,transparent_1px)] bg-[size:42px_42px]" />
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-100 via-sky-100 to-pink-100" />
              <div className="absolute inset-0 opacity-50 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.9),transparent_24%),radial-gradient(circle_at_80%_35%,rgba(255,255,255,0.85),transparent_22%),radial-gradient(circle_at_45%_80%,rgba(255,255,255,0.75),transparent_28%)]" />

            {loading ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <div className="w-12 h-12 border-4 border-white/70 border-t-brand-accent rounded-full animate-spin" />
              </div>
            ) : points.length === 0 ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center">
                <div className="bg-white/90 backdrop-blur rounded-3xl border border-white/70 shadow-md p-6 max-w-md">
                  <MapPin className="w-10 h-10 mx-auto text-brand-muted mb-3" />
                  <h2 className="font-black text-brand-text">No mappable users yet</h2>
                  <p className="text-sm text-brand-muted mt-1">
                    Users need GPS-based location enabled to appear on the map. Research and Browse still show text-location users.
                  </p>
                </div>
              </div>
            ) : (
              positionedPoints.map((point) => {
                const active = selected?.id === point.id;
                return (
                  <button
                    key={point.id}
                    type="button"
                    onClick={() => setSelectedId(point.id)}
                    style={markerStyle(point, active)}
                    className="absolute focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-accent/30 rounded-full transition-transform"
                    aria-label={`Show ${point.first_name} on map${point.spreadCount > 1 ? `, ${point.spreadCount} nearby users spread out` : ''}`}
                  >
                    <span className={`relative flex items-center justify-center w-11 h-11 rounded-full shadow-lg border-2 ${active ? 'bg-brand-accent text-white border-white' : 'bg-white text-brand-accent border-brand-accent/30'}`}>
                      <MapPin className="w-6 h-6" fill="currentColor" />
                    </span>
                  </button>
                );
              })
            )}
            </section>
          </div>

          <aside className="bg-brand-surface rounded-3xl shadow-md border border-brand-border p-5 sticky top-[92px]">
            {selected ? (
              <div>
                <div className="aspect-[4/5] rounded-3xl overflow-hidden bg-brand-bg mb-4">
                  {selected.photo_url ? (
                    <img
                      src={resolveMediaUrl(selected.photo_url) ?? ''}
                      alt={`${selected.first_name}'s profile picture`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-brand-start/15 via-brand-mid/15 to-brand-end/15">
                      <span className="text-5xl font-black text-brand-accent/60">{initialsFor(selected)}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-xl font-black text-brand-text truncate">
                      {selected.first_name}{selected.age !== null ? `, ${selected.age}` : ''}
                    </h2>
                    <p className="text-sm text-brand-muted truncate">@{selected.username}</p>
                  </div>
                  <FameBadge rating={selected.fame_rating} showLabel={false} />
                </div>

                <div className="mt-4 space-y-2 text-sm text-brand-muted">
                  {selected.location_text && <p>📍 {selected.location_text}</p>}
                  {formatDistance(selected.distance_km) && <p>↗ {formatDistance(selected.distance_km)}</p>}
                  {selected.shared_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {selected.shared_tags.slice(0, 5).map((tag) => (
                        <span key={tag} className="px-2.5 py-1 rounded-full bg-brand-accent/10 text-brand-accent text-[11px] font-semibold border border-brand-accent/15">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <Link
                  to={`/profile/${selected.id}`}
                  className="mt-5 inline-flex w-full items-center justify-center min-h-[46px] rounded-full bg-gradient-to-br from-brand-start via-brand-mid to-brand-end text-white text-sm font-black uppercase tracking-wider shadow-lg shadow-brand-accent/20 hover:brightness-105 transition-all"
                >
                  View profile
                </Link>
              </div>
            ) : (
              <div className="text-center py-8">
                <MapPin className="w-10 h-10 mx-auto text-brand-muted mb-3" />
                <h2 className="font-black text-brand-text">Select a marker</h2>
                <p className="text-sm text-brand-muted mt-1">Click a map pin to see their profile preview.</p>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
};
