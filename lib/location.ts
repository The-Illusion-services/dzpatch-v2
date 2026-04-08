export type LatLng = {
  latitude: number;
  longitude: number;
};

type GeoJsonPoint = {
  type?: string;
  coordinates?: [number, number] | number[];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parsePostgisPoint(point: unknown): LatLng | null {
  if (!point || typeof point !== 'object') return null;

  const maybePoint = point as GeoJsonPoint;
  const coordinates = maybePoint.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    return null;
  }

  const [longitude, latitude] = coordinates;
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) {
    return null;
  }

  return { latitude, longitude };
}

export function distanceMeters(start: LatLng, end: LatLng): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const dLat = toRad(end.latitude - start.latitude);
  const dLng = toRad(end.longitude - start.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(start.latitude)) *
      Math.cos(toRad(end.latitude)) *
      Math.sin(dLng / 2) ** 2;

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
