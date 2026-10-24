// Distancia sobre la Tierra entre dos coordenadas (fórmula de haversine). La usa lib/alerts para
// elegir el oficial más cercano a la cámara (docs/04 §6). A escala de una ciudad el error frente
// a un elipsoide es muy inferior a lo que importa para ALERT_RADIUS_METERS.

export interface LatLng {
  lat: number;
  lng: number;
}

/** Radio medio de la Tierra (IUGG), en metros. */
export const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  // min(1, …) evita NaN por redondeo cuando los puntos son casi antípodas
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function isWithinRadius(a: LatLng, b: LatLng, radiusM: number): boolean {
  return haversineMeters(a, b) <= radiusM;
}
