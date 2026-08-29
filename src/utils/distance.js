// =============================================
// DISTANCE UTILITY
// =============================================
// Calculates distance between two GPS coordinates
// using the Haversine formula.
//
// Return value: kilometers
// =============================================

export function calculateDistance(
  lat1,
  lng1,
  lat2,
  lng2
) {
  const latitude1 = Number(lat1);
  const longitude1 = Number(lng1);
  const latitude2 = Number(lat2);
  const longitude2 = Number(lng2);

  if (
    !Number.isFinite(latitude1) ||
    !Number.isFinite(longitude1) ||
    !Number.isFinite(latitude2) ||
    !Number.isFinite(longitude2)
  ) {
    return Infinity;
  }

  const EARTH_RADIUS_KM = 6371;

  const dLat =
    ((latitude2 - latitude1) * Math.PI) / 180;

  const dLng =
    ((longitude2 - longitude1) * Math.PI) / 180;

  const lat1Rad =
    (latitude1 * Math.PI) / 180;

  const lat2Rad =
    (latitude2 * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) *
      Math.sin(dLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return EARTH_RADIUS_KM * c;
}
