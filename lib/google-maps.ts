const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ??
  process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY ??
  '';

export function getGoogleMapsApiKey(): string {
  return GOOGLE_MAPS_API_KEY;
}

export function createPlacesSessionToken(prefix = 'places'): string {
  return `dzpatch-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
