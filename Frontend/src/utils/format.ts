/**
 * Formats a distance for display, hiding it when coordinates are unknown.
 * The API reports `distance_km` as a whole number of kilometres (minimum 1),
 * deliberately coarse so it never reveals a precise position.
 */
export const formatDistance = (km: number | null | undefined): string | null => {
  if (km === null || km === undefined || !Number.isFinite(km)) return null;
  return `${Math.max(1, Math.round(km))} km away`;
};
