'use client'
import { useEffect, useState } from 'react'
import { Cloud, CloudRain, CloudSnow, CloudLightning, Sun, CloudSun } from 'lucide-react'

interface WeerData {
  temperatuur: number
  code: number
}

// Open-Meteo WMO weather codes → icoon + label (verkort)
function iconVoorCode(code: number) {
  if (code === 0) return { Icon: Sun, label: 'Helder' }
  if ([1, 2].includes(code)) return { Icon: CloudSun, label: 'Licht bewolkt' }
  if (code === 3) return { Icon: Cloud, label: 'Bewolkt' }
  if ([45, 48].includes(code)) return { Icon: Cloud, label: 'Mist' }
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { Icon: CloudRain, label: 'Regen' }
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { Icon: CloudSnow, label: 'Sneeuw' }
  if ([95, 96, 99].includes(code)) return { Icon: CloudLightning, label: 'Onweer' }
  return { Icon: Cloud, label: 'Bewolkt' }
}

/**
 * Compacte weer-badge voor de training van vandaag. Gebruikt de browser-geolocatie
 * en de gratis Open-Meteo API (geen key nodig) om het actuele weer te tonen.
 */
export function WeerBadge() {
  const [weer, setWeer] = useState<WeerData | null>(null)
  const [fout, setFout] = useState(false)

  useEffect(() => {
    if (!('geolocation' in navigator)) { setFout(true); return }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code`)
          .then(r => r.json())
          .then(d => {
            if (d?.current) {
              setWeer({ temperatuur: Math.round(d.current.temperature_2m), code: d.current.weather_code })
            } else {
              setFout(true)
            }
          })
          .catch(() => setFout(true))
      },
      () => setFout(true),
      { timeout: 5000 }
    )
  }, [])

  if (fout || !weer) return null

  const { Icon, label } = iconVoorCode(weer.code)

  return (
    <div className="flex items-center gap-1.5 bg-[#222230] rounded-xl px-2.5 py-1.5" title={label}>
      <Icon size={12} className="text-[#f97316]" />
      <span className="text-xs font-semibold text-white">{weer.temperatuur}°C</span>
    </div>
  )
}
