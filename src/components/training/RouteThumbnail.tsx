'use client'
import { decodePolyline } from '@/lib/polyline'

interface Props {
  polyline: string
  className?: string
}

/**
 * Tekent een klein route-silhouet (geen kaart-tiles, alleen de lijnvorm) op
 * basis van een Strava encoded-polyline. Schaalt automatisch naar een vast
 * viewBox zodat elke route netjes binnen de thumbnail past.
 */
export function RouteThumbnail({ polyline, className }: Props) {
  const punten = decodePolyline(polyline)
  if (punten.length < 2) return null

  const lats = punten.map(p => p.lat)
  const lngs = punten.map(p => p.lng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)
  const breedte = maxLng - minLng || 1
  const hoogte = maxLat - minLat || 1
  const pad = 6
  const vw = 100, vh = 60

  // Lat/lng → SVG-coördinaten, met behoud van aspect ratio (geo-noord = boven)
  const schaal = Math.min((vw - pad * 2) / breedte, (vh - pad * 2) / hoogte)
  const offsetX = (vw - breedte * schaal) / 2
  const offsetY = (vh - hoogte * schaal) / 2

  const pathData = punten
    .map((p, i) => {
      const x = offsetX + (p.lng - minLng) * schaal
      const y = vh - (offsetY + (p.lat - minLat) * schaal) // y-as omdraaien
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg viewBox={`0 0 ${vw} ${vh}`} className={className} preserveAspectRatio="xMidYMid meet">
      <path d={pathData} fill="none" stroke="#f97316" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
