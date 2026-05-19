'use client'
import { useState, useEffect } from 'react'

interface Props {
  morgenSessie: { beschrijving: string; duur_minuten: number | null; intensiteit: string | null } | null
  overmorgenSessie: { beschrijving: string } | null
}

interface WeerData {
  maxTemp: number
  minTemp: number
  regenMm: number
  windKmh: number
  weatherCode: number
}

function weerInfo(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: '☀️', label: 'Zonnig' }
  if (code <= 2) return { emoji: '⛅', label: 'Bewolkt' }
  if (code <= 3) return { emoji: '☁️', label: 'Bewolkt' }
  if (code <= 49) return { emoji: '🌫️', label: 'Mist' }
  if (code <= 59) return { emoji: '🌦️', label: 'Lichte regen' }
  if (code <= 69) return { emoji: '🌧️', label: 'Regen' }
  if (code <= 79) return { emoji: '❄️', label: 'Sneeuw' }
  if (code <= 99) return { emoji: '⛈️', label: 'Onweer' }
  return { emoji: '🌤️', label: 'Wisselvallig' }
}

function trainingsAdvies(maxTemp: number, regenMm: number, windKmh: number): string | null {
  if (maxTemp < 5) return 'Koud: extra warming-up'
  if (maxTemp > 25) return 'Warm: extra hydratatie'
  if (regenMm > 5) return 'Regen: pas kleding aan'
  if (windKmh > 30) return 'Harde wind: pas tempo aan'
  return null
}

export function WeerWidget({ morgenSessie }: Props) {
  const [weerData, setWeerData] = useState<WeerData | null>(null)
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState(false)

  useEffect(() => {
    if (!morgenSessie) return

    function fetchWeer(lat: number, lon: number) {
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,weathercode&timezone=Europe/Amsterdam&forecast_days=3`
      )
        .then(r => r.json())
        .then(data => {
          // Index 0 = vandaag, index 1 = morgen
          const i = 1
          setWeerData({
            maxTemp: Math.round(data.daily.temperature_2m_max[i]),
            minTemp: Math.round(data.daily.temperature_2m_min[i]),
            regenMm: Math.round((data.daily.precipitation_sum[i] ?? 0) * 10) / 10,
            windKmh: Math.round(data.daily.windspeed_10m_max[i]),
            weatherCode: data.daily.weathercode[i],
          })
          setLaden(false)
        })
        .catch(() => {
          setFout(true)
          setLaden(false)
        })
    }

    if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        pos => fetchWeer(pos.coords.latitude, pos.coords.longitude),
        () => fetchWeer(52.3676, 4.9041)
      )
    } else {
      fetchWeer(52.3676, 4.9041)
    }
  }, [morgenSessie])

  if (!morgenSessie) return null
  if (fout) return null

  if (laden) {
    return (
      <div className="bg-white rounded-2xl p-4 shadow-sm">
        <div className="h-3 bg-[#e8e3dc] rounded-full w-40 mb-3 animate-pulse" />
        <div className="h-8 bg-[#e8e3dc] rounded-full w-24 animate-pulse" />
      </div>
    )
  }

  if (!weerData) return null

  const { emoji: weatherEmoji, label: conditionLabel } = weerInfo(weerData.weatherCode)
  const adviesText = trainingsAdvies(weerData.maxTemp, weerData.regenMm, weerData.windKmh)

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider mb-1">
            Morgen — {morgenSessie.beschrijving}
          </p>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{weatherEmoji}</span>
            <div>
              <p className="text-xl font-bold text-[#1a1612]">{weerData.maxTemp}°C</p>
              <p className="text-xs text-[#6b6560]">{conditionLabel}</p>
            </div>
          </div>
        </div>
        <div className="text-right text-xs text-[#6b6560] space-y-1">
          <p>🌧️ {weerData.regenMm} mm</p>
          <p>💨 {weerData.windKmh} km/u</p>
          {adviesText && (
            <p className="text-[#f97316] font-medium mt-1">{adviesText}</p>
          )}
        </div>
      </div>
    </div>
  )
}
