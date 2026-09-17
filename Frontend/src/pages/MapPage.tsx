import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Minus, Navigation, Plus, RefreshCw } from 'lucide-react';
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

interface MapView {
  centerLat: number;
  centerLng: number;
  zoom: number;
}

interface MapSize {
  width: number;
  height: number;
}

interface RenderViewport extends MapView, MapSize {
  startX: number;
  startY: number;
  centerX: number;
  centerY: number;
}

interface MapTile {
  key: string;
  url: string;
  left: number;
  top: number;
}

interface PositionedMapPoint extends MapPoint {
  screenX: number;
  screenY: number;
  offsetX: number;
  offsetY: number;
  spreadIndex: number;
  spreadCount: number;
}

interface MapCluster {
  id: string;
  screenX: number;
  screenY: number;
  points: PositionedMapPoint[];
}

interface DragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startCenterX: number;
  startCenterY: number;
}

const TILE_SIZE = 256;
const MIN_ZOOM = 5;
const MAX_ZOOM = 16;
const DEFAULT_MAP_VIEW: MapView = {
  centerLat: 33.5731,
  centerLng: -7.5898,
  zoom: 8,
};

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

const lonToTileX = (longitude: number, zoom: number): number => ((longitude + 180) / 360) * 2 ** zoom;

const latToTileY = (latitude: number, zoom: number): number => {
  const safeLatitude = clamp(latitude, -85.05112878, 85.05112878);
  const radians = (safeLatitude * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * 2 ** zoom;
};

const lngLatToWorldPixel = (longitude: number, latitude: number, zoom: number) => ({
  x: lonToTileX(longitude, zoom) * TILE_SIZE,
  y: latToTileY(latitude, zoom) * TILE_SIZE,
});

const worldPixelToLngLat = (x: number, y: number, zoom: number) => {
  const scale = TILE_SIZE * 2 ** zoom;
  const longitude = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const latitude = (Math.atan(Math.sinh(n)) * 180) / Math.PI;
  return {
    latitude: clamp(latitude, -85.05112878, 85.05112878),
    longitude: ((((longitude + 180) % 360) + 360) % 360) - 180,
  };
};

const createRenderViewport = (view: MapView, size: MapSize): RenderViewport | null => {
  if (size.width <= 0 || size.height <= 0) return null;

  const center = lngLatToWorldPixel(view.centerLng, view.centerLat, view.zoom);
  return {
    ...view,
    ...size,
    centerX: center.x,
    centerY: center.y,
    startX: center.x - size.width / 2,
    startY: center.y - size.height / 2,
  };
};

const createMapTiles = (viewport: RenderViewport | null): MapTile[] => {
  if (!viewport) return [];

  const minTileX = Math.floor(viewport.startX / TILE_SIZE);
  const maxTileX = Math.floor((viewport.startX + viewport.width) / TILE_SIZE);
  const minTileY = Math.floor(viewport.startY / TILE_SIZE);
  const maxTileY = Math.floor((viewport.startY + viewport.height) / TILE_SIZE);
  const tileCount = 2 ** viewport.zoom;
  const tiles: MapTile[] = [];

  for (let x = minTileX; x <= maxTileX; x += 1) {
    for (let y = minTileY; y <= maxTileY; y += 1) {
      if (y < 0 || y >= tileCount) continue;
      const wrappedX = ((x % tileCount) + tileCount) % tileCount;
      tiles.push({
        key: `${viewport.zoom}-${x}-${y}`,
        url: `https://tile.openstreetmap.org/${viewport.zoom}/${wrappedX}/${y}.png`,
        left: x * TILE_SIZE - viewport.startX,
        top: y * TILE_SIZE - viewport.startY,
      });
    }
  }

  return tiles;
};

const fitBoundsToSize = (bounds: MapBounds | null, size: MapSize): MapView => {
  if (!bounds || size.width <= 0 || size.height <= 0) return DEFAULT_MAP_VIEW;

  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const centerLng = (bounds.minLng + bounds.maxLng) / 2;
  const usableWidth = Math.max(size.width - 120, 280);
  const usableHeight = Math.max(size.height - 120, 280);

  for (let zoom = MAX_ZOOM; zoom >= MIN_ZOOM; zoom -= 1) {
    const northWest = lngLatToWorldPixel(bounds.minLng, bounds.maxLat, zoom);
    const southEast = lngLatToWorldPixel(bounds.maxLng, bounds.minLat, zoom);
    if (Math.abs(southEast.x - northWest.x) <= usableWidth && Math.abs(southEast.y - northWest.y) <= usableHeight) {
      return { centerLat, centerLng, zoom };
    }
  }

  return { centerLat, centerLng, zoom: MIN_ZOOM };
};

const projectPoint = (point: MapPoint, viewport: RenderViewport) => {
  const projected = lngLatToWorldPixel(point.map_longitude, point.map_latitude, viewport.zoom);
  return {
    screenX: projected.x - viewport.startX,
    screenY: projected.y - viewport.startY,
  };
};

const positionMapPoints = (points: MapPoint[], viewport: RenderViewport | null): PositionedMapPoint[] => {
  if (!viewport) {
    return points.map((point) => ({
      ...point,
      screenX: 0,
      screenY: 0,
      offsetX: 0,
      offsetY: 0,
      spreadIndex: 0,
      spreadCount: 1,
    }));
  }

  return points.map((point, index) => ({
    ...point,
    ...projectPoint(point, viewport),
    offsetX: 0,
    offsetY: 0,
    spreadIndex: index,
    spreadCount: 1,
  }));
};

const getClusterRadius = (zoom: number): number => {
  if (zoom <= 7) return 72;
  if (zoom <= 9) return 56;
  if (zoom <= 11) return 42;
  if (zoom <= 13) return 32;
  return 24;
};

const clusterMapPoints = (points: PositionedMapPoint[], zoom: number): MapCluster[] => {
  const radius = getClusterRadius(zoom);
  const clusters: MapCluster[] = [];

  points.forEach((point) => {
    const cluster = clusters.find((candidate) => Math.hypot(point.screenX - candidate.screenX, point.screenY - candidate.screenY) < radius);

    if (!cluster) {
      clusters.push({
        id: `cluster-${point.id}`,
        screenX: point.screenX,
        screenY: point.screenY,
        points: [point],
      });
      return;
    }

    cluster.points.push(point);
    cluster.screenX = cluster.points.reduce((sum, item) => sum + item.screenX, 0) / cluster.points.length;
    cluster.screenY = cluster.points.reduce((sum, item) => sum + item.screenY, 0) / cluster.points.length;
    cluster.id = `cluster-${cluster.points.map((item) => item.id).sort((a, b) => a - b).join('-')}`;
  });

  return clusters;
};

export const MapPage: React.FC = () => {
  const [profiles, setProfiles] = useState<Suggestion[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapSize, setMapSize] = useState<MapSize>({ width: 0, height: 0 });
  const [mapView, setMapView] = useState<MapView>(DEFAULT_MAP_VIEW);
  const mapRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const fittedSignatureRef = useRef<string>('');

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

  useEffect(() => {
    const element = mapRef.current;
    if (!element) return undefined;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setMapSize({ width: rect.width, height: rect.height });
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
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

  const pointSignature = useMemo(
    () => points.map((point) => `${point.id}:${point.map_latitude.toFixed(5)}:${point.map_longitude.toFixed(5)}`).join('|'),
    [points],
  );

  useEffect(() => {
    const fitSignature = `${pointSignature}:${Math.round(mapSize.width)}x${Math.round(mapSize.height)}`;
    if (fittedSignatureRef.current === fitSignature) return;
    fittedSignatureRef.current = fitSignature;
    setMapView(fitBoundsToSize(bounds, mapSize));
  }, [bounds, mapSize, pointSignature]);

  const renderViewport = useMemo(() => createRenderViewport(mapView, mapSize), [mapView, mapSize]);
  const mapTiles = useMemo(() => createMapTiles(renderViewport), [renderViewport]);
  const positionedPoints = useMemo(() => positionMapPoints(points, renderViewport), [points, renderViewport]);
  const mapClusters = useMemo(() => clusterMapPoints(positionedPoints, mapView.zoom), [positionedPoints, mapView.zoom]);
  const selected = positionedPoints.find((profile) => profile.id === selectedId) ?? positionedPoints[0] ?? null;

  const setViewFromCenterPixel = useCallback((centerX: number, centerY: number, zoom: number) => {
    const center = worldPixelToLngLat(centerX, centerY, zoom);
    setMapView({ centerLat: center.latitude, centerLng: center.longitude, zoom });
  }, []);

  const zoomAtPoint = useCallback(
    (nextZoom: number, anchorX?: number, anchorY?: number) => {
      if (!renderViewport) return;
      const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
      if (zoom === renderViewport.zoom) return;

      const x = anchorX ?? renderViewport.width / 2;
      const y = anchorY ?? renderViewport.height / 2;
      const anchorWorldX = renderViewport.startX + x;
      const anchorWorldY = renderViewport.startY + y;
      const anchorLatLng = worldPixelToLngLat(anchorWorldX, anchorWorldY, renderViewport.zoom);
      const nextAnchorWorld = lngLatToWorldPixel(anchorLatLng.longitude, anchorLatLng.latitude, zoom);
      const nextCenterX = nextAnchorWorld.x - (x - renderViewport.width / 2);
      const nextCenterY = nextAnchorWorld.y - (y - renderViewport.height / 2);
      setViewFromCenterPixel(nextCenterX, nextCenterY, zoom);
    },
    [renderViewport, setViewFromCenterPixel],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (!renderViewport) return;
    const target = event.target as HTMLElement;
    if (target.closest('button,a')) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCenterX: renderViewport.centerX,
      startCenterY: renderViewport.centerY,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startClientX;
    const deltaY = event.clientY - drag.startClientY;
    setViewFromCenterPixel(drag.startCenterX - deltaX, drag.startCenterY - deltaY, mapView.zoom);
  };

  const handlePointerEnd = (event: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLElement>) => {
    if (!renderViewport) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const nextZoom = renderViewport.zoom + (event.deltaY < 0 ? 1 : -1);
    zoomAtPoint(nextZoom, event.clientX - rect.left, event.clientY - rect.top);
  };

  const markerStyle = (point: PositionedMapPoint, active: boolean): React.CSSProperties => ({
    left: `${point.screenX}px`,
    top: `${point.screenY}px`,
    transform: `translate(-50%, -100%) scale(${active ? 1.08 : 1})`,
    zIndex: active ? 100 : 20 + Math.min(point.spreadIndex, 20),
    willChange: 'transform',
  });

  const clusterStyle = (cluster: MapCluster): React.CSSProperties => ({
    left: `${cluster.screenX}px`,
    top: `${cluster.screenY}px`,
    transform: 'translate(-50%, -50%)',
    zIndex: 90,
  });

  const focusCluster = (cluster: MapCluster) => {
    if (cluster.points.length === 1) {
      setSelectedId(cluster.points[0].id);
      return;
    }

    const centerLat = cluster.points.reduce((sum, point) => sum + point.map_latitude, 0) / cluster.points.length;
    const centerLng = cluster.points.reduce((sum, point) => sum + point.map_longitude, 0) / cluster.points.length;

    if (mapView.zoom >= MAX_ZOOM) {
      setSelectedId(cluster.points[0].id);
      return;
    }

    setMapView({
      centerLat,
      centerLng,
      zoom: Math.min(MAX_ZOOM, mapView.zoom + 2),
    });
  };

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
              <p className="text-xs text-brand-muted">{points.length} users with GPS area · zoom {mapView.zoom}</p>
            </div>

            <section
              ref={mapRef}
              className="relative h-[560px] rounded-3xl overflow-hidden border border-brand-border bg-slate-100 shadow-md touch-none cursor-grab active:cursor-grabbing select-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={handlePointerEnd}
              onWheel={handleWheel}
              onDoubleClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                zoomAtPoint(mapView.zoom + 1, event.clientX - rect.left, event.clientY - rect.top);
              }}
              aria-label="Interactive map of nearby Matcha members"
            >
              <div className="absolute inset-0 bg-slate-100" />
              {mapTiles.length > 0 ? (
                <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
                  {mapTiles.map((tile) => (
                    <img
                      key={tile.key}
                      src={tile.url}
                      alt=""
                      draggable={false}
                      className="absolute max-w-none select-none"
                      style={{
                        left: `${tile.left}px`,
                        top: `${tile.top}px`,
                        width: `${TILE_SIZE}px`,
                        height: `${TILE_SIZE}px`,
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-100 via-sky-100 to-pink-100" />
              )}

              <div className="absolute left-4 top-4 z-[120] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md">
                <button
                  type="button"
                  onClick={() => zoomAtPoint(mapView.zoom + 1)}
                  className="flex h-11 w-11 items-center justify-center text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  disabled={mapView.zoom >= MAX_ZOOM}
                  aria-label="Zoom in"
                >
                  <Plus className="h-5 w-5" />
                </button>
                <div className="h-px bg-slate-200" />
                <button
                  type="button"
                  onClick={() => zoomAtPoint(mapView.zoom - 1)}
                  className="flex h-11 w-11 items-center justify-center text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  disabled={mapView.zoom <= MIN_ZOOM}
                  aria-label="Zoom out"
                >
                  <Minus className="h-5 w-5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setMapView(fitBoundsToSize(bounds, mapSize))}
                className="absolute left-4 top-[112px] z-[120] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-wider text-slate-700 shadow-md hover:bg-slate-50"
              >
                Fit
              </button>

              <div className="absolute bottom-2 right-3 z-[120] rounded bg-white/90 px-2 py-1 text-[10px] font-semibold text-slate-600 shadow-sm">
                © OpenStreetMap contributors
              </div>

              {loading ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/20">
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
                mapClusters.map((cluster) => {
                  if (cluster.points.length > 1) {
                    return (
                      <button
                        key={cluster.id}
                        type="button"
                        onClick={() => focusCluster(cluster)}
                        style={clusterStyle(cluster)}
                        className="absolute flex h-12 min-w-12 items-center justify-center rounded-full border-4 border-white bg-brand-accent px-3 text-sm font-black text-white shadow-lg transition-transform hover:scale-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-accent/30"
                        aria-label={`Zoom into ${cluster.points.length} nearby members`}
                      >
                        {cluster.points.length}
                      </button>
                    );
                  }

                  const point = cluster.points[0];
                  const active = selected?.id === point.id;
                  return (
                    <button
                      key={point.id}
                      type="button"
                      onClick={() => setSelectedId(point.id)}
                      style={markerStyle(point, active)}
                      className="absolute rounded-full transition-transform focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-accent/30"
                      aria-label={`Show ${point.first_name} on map`}
                    >
                      <span className={`relative flex items-center justify-center w-12 h-12 rounded-full shadow-lg border-4 ${active ? 'bg-brand-accent text-white border-white' : 'bg-white text-brand-accent border-brand-accent/30'}`}>
                        <MapPin className="w-7 h-7" fill="currentColor" />
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
