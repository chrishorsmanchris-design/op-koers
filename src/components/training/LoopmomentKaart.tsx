'use client'
import { useEffect, useState } from 'react'
import { Thermometer, CloudRain, Clock } from 'lucide-react'
import {
  beoordeelLooptijd, uurTekst, vensterVoorDatum,
  type LooptijdAdvies, type Looptijden, type UurWeer,
} from '@/lib/looptijd'
import { cn } from '@/lib/utils'

interface Props {
  sessie: { datum: string; duur_minuten: number | null }
  vandaag: string
  /** Wanneer deze gebruiker per weekdag kan lopen; null = het ruime standaardvenster. */
  looptijden: Looptijden | null
}

/** Zelfde vaste punt als het tankplan: geen locatiepopup voor één temperatuur. */
const LAT = 52.3676
const LON = 4.9041

const KLEUR: Record<string, string> = {
  geen: 'text-[#22c55e]',
  let_op: 'text-[#38bdf8]',
  zwaar: 'text-amber-400',
  gevaarlijk: 'text-red-400',
}

export function LoopmomentKaart({ sessie, vandaag, looptijden }: Props) {
  const [advies, setAdvies] = useState<LooptijdAdvies | null>(null)
  const [nu, setNu] = useState<number | null>(null)

  const { datum, duur_minuten: duur } = sessie

  useEffect(() => {
    let afgebroken = false

    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}` +
      `&hourly=apparent_temperature,precipitation_probability&timezone=Europe/Amsterdam&forecast_days=16`
    )
      .then(r => r.json())
      .then((data: { hourly?: { time?: string[]; apparent_temperature?: number[]; precipitation_probability?: number[] } }) => {
        if (afgebroken) return
        const tijden = data.hourly?.time
        const gevoelens = data.hourly?.apparent_temperature
        if (!tijden || !gevoelens) return

        const uren: UurWeer[] = []
        tijden.forEach((t, i) => {
          if (!t.startsWith(datum)) return
          const gevoel = gevoelens[i]
          if (typeof gevoel !== 'number') return
          uren.push({
            uur: Number(t.slice(11, 13)),
            gevoel,
            regenKans: data.hourly?.precipitation_probability?.[i] ?? 0,
          })
        })
        if (uren.length === 0) return

        // Voor vandaag geen momenten adviseren die al voorbij zijn. Het huidige
        // uur telt nog mee: je kunt over vijf minuten de deur uit.
        const huidigUur = datum === vandaag ? new Date().getHours() : 0
        setNu(uren.find(u => u.uur === huidigUur)?.gevoel ?? null)
        setAdvies(beoordeelLooptijd(uren, duur, huidigUur, vensterVoorDatum(looptijden, datum)))
      })
      .catch(() => {})

    return () => { afgebroken = true }
  }, [datum, duur, vandaag, looptijden])

  if (!advies) return null

  const { beste, slechtste, maaktUit, vensterTeKrap, waarschuwing } = advies
  const kleur = KLEUR[beste.hitte] ?? 'text-[#8888a8]'

  return (
    <div className="mt-3 bg-[#222230] rounded-2xl p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <Clock size={13} className={kleur} />
        <p className="text-xs font-bold text-white">
          {vensterTeKrap
            ? `Binnen jouw tijden: ${uurTekst(beste.startUur)}–${uurTekst(beste.eindUur)}`
            : maaktUit
              ? `Beste moment: ${uurTekst(beste.startUur)}–${uurTekst(beste.eindUur)}`
              : 'Het tijdstip maakt weinig uit'}
        </p>
      </div>

      <div className="flex items-center gap-3 text-[11px] text-[#8888a8]">
        <span className="flex items-center gap-1">
          <Thermometer size={11} className={kleur} />
          voelt als {beste.gevoel}°
          {maaktUit && <span className="text-[#55556a]"> · later {slechtste.gevoel}°</span>}
        </span>
        {beste.regenKans >= 30 && (
          <span className="flex items-center gap-1">
            <CloudRain size={11} className="text-[#38bdf8]" />
            {beste.regenKans}%
          </span>
        )}
        {nu !== null && (
          <span className="text-[#55556a] ml-auto">nu {Math.round(nu)}°</span>
        )}
      </div>

      {waarschuwing && (
        <p className={cn('text-[11px] leading-relaxed mt-2', kleur)}>{waarschuwing}</p>
      )}
    </div>
  )
}
