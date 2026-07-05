// ─── Google encoded-polyline decoder ─────────────────────────────────────────
// Strava levert routes als "encoded polyline" (het algoritme van Google Maps).
// We hebben hier geen kaart-tiles nodig — alleen de losse lat/lng punten om er
// een simpele SVG-silhouet van de route mee te tekenen.

export interface LatLng {
  lat: number
  lng: number
}

export function decodePolyline(encoded: string): LatLng[] {
  const punten: LatLng[] = []
  let index = 0, lat = 0, lng = 0

  while (index < encoded.length) {
    let shift = 0, result = 0, byte: number
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lat += (result & 1) ? ~(result >> 1) : (result >> 1)

    shift = 0; result = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    lng += (result & 1) ? ~(result >> 1) : (result >> 1)

    punten.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }

  return punten
}
