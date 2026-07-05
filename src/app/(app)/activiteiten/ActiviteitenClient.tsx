'use client'
import { useState, useMemo } from 'react'
import { cn, formatDuur } from '@/lib/utils'
import { ChevronDown, ChevronUp, MapPin, Timer, RefreshCw } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface Sessie {
  id: string
  datum: string
  type: string
  beschrijving: string
  duur_minuten: number | null
  afstand_km: number | null
  intensiteit: string | null
  voltooid: boolean
  overgeslagen: boolean
  week_nummer: number
}

interface FysioSessie { id: string; datum: string; voltooid: boolean }
interface CoreSessie  { id: string; datum: string; voltooid: boolean }

interface Props {
  sessies: Sessie[]
  fysioSessies: FysioSessie[]
  coreSessies: CoreSessie[]
  heeftStrava: boolean
}

const TYPE_EMOJI: Record<string, string> = {
  hardlopen: '🏃', krachttraining: '💪', cross: '🚴', core: '🧘',
}

const INTENSITEIT_KLEUR: Record<string, string> = {
  herstel: 'bg-blue-950 text-blue-400',
  makkelijk: 'bg-green-950 text-green-400',
  gemiddeld: 'bg-amber-950 text-amber-300',
  zwaar: 'bg-orange-950 text-orange-300',
  interval: 'bg-rose-950 text-rose-300',
}

function isoWeekLabel(datum: string): string {
  const d = new Date(datum + 'T12:00:00')
  const dag = d.getDay() || 7
  const ma = new Date(d); ma.setDate(d.getDate() + 1 - dag)
  const zo = new Date(ma); zo.setDate(ma.getDate() + 6)
  const fmt = (x: Date) => x.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
  return `${fmt(ma)} – ${fmt(zo)}`
}

function isoWeekKey(datum: string): string {
  const d = new Date(datum + 'T12:00:00')
  const dag = d.getDay() || 7
  d.setDate(d.getDate() + 4 - dag)
  const jaarStart = new Date(d.getFullYear(), 0, 1)
  const week = Math.ceil(((d.getTime() - jaarStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
}

function isVorigeWeek(datum: string): boolean {
  const vandaag = new Date(); vandaag.setHours(0, 0, 0, 0)
  const dag = vandaag.getDay() || 7
  const maDeze = new Date(vandaag); maDeze.setDate(vandaag.getDate() + 1 - dag)
  const maVorige = new Date(maDeze); maVorige.setDate(maDeze.getDate() - 7)
  const zoVorige = new Date(maDeze); zoVorige.setDate(maDeze.getDate() - 1)
  const d = new Date(datum + 'T12:00:00')
  return d >= maVorige && d <= zoVorige
}

function isDezWeek(datum: string): boolean {
  const vandaag = new Date(); vandaag.setHours(0, 0, 0, 0)
  const dag = vandaag.getDay() || 7
  const ma = new Date(vandaag); ma.setDate(vandaag.getDate() + 1 - dag)
  const zo = new Date(ma); zo.setDate(ma.getDate() + 6)
  const d = new Date(datum + 'T12:00:00')
  return d >= ma && d <= zo
}

export function ActiviteitenClient({ sessies, fysioSessies, coreSessies, heeftStrava }: Props) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(new Set())

  async function syncStrava() {
    setSyncing(true)
    await fetch('/api/strava/sync', { method: 'POST' })
    setSyncing(false)
    window.location.reload()
  }

  // Groepeer alle loopsessies per ISO-week
  const weken = useMemo(() => {
    const map = new Map<string, { label: string; sessies: Sessie[]; fysio: number; core: number }>()

    sessies.forEach(s => {
      const key = isoWeekKey(s.datum)
      if (!map.has(key)) {
        map.set(key, { label: isoWeekLabel(s.datum), sessies: [], fysio: 0, core: 0 })
      }
      map.get(key)!.sessies.push(s)
    })

    // Voeg fysio en core toe aan de juiste weken
    fysioSessies.forEach(f => {
      const key = isoWeekKey(f.datum)
      if (map.has(key)) map.get(key)!.fysio++
    })
    coreSessies.forEach(c => {
      const key = isoWeekKey(c.datum)
      if (map.has(key)) map.get(key)!.core++
    })

    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, data]) => ({
        key,
        ...data,
        sessies: data.sessies.sort((a, b) => b.datum.localeCompare(a.datum)),
      }))
  }, [sessies, fysioSessies, coreSessies])

  function toggleWeek(key: string) {
    setOpenWeeks(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Eerste week standaard open
  const eersteWeekKey = weken[0]?.key ?? ''

  function weekTitel(key: string, label: string): string {
    const first = weken[0]?.key
    const second = weken[1]?.key
    if (key === first) {
      const s = weken[0]?.sessies[0]?.datum
      if (s && isDezWeek(s)) return 'Deze week'
      if (s && isVorigeWeek(s)) return 'Vorige week'
    }
    if (key === second && weken[0]?.sessies[0]?.datum && isVorigeWeek(weken[0].sessies[0].datum)) return ''
    return label
  }

  if (sessies.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4 pt-8 pb-24">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">Activiteiten</h1>
          {heeftStrava && (
            <button onClick={syncStrava} disabled={syncing}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#1b1b27] border border-[#2d2d3e] text-[#55556a]">
              <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
        <div className="bg-[#1b1b27] rounded-3xl border border-[#2d2d3e] p-6 text-center">
          <p className="text-3xl mb-3">🏃</p>
          <p className="font-semibold text-white mb-1">Nog geen activiteiten</p>
          <p className="text-sm text-[#55556a] mb-4">Voltooi trainingen of verbind Strava om je geschiedenis te zien.</p>
          {!heeftStrava && (
            <button onClick={() => router.push('/instellingen')}
              className="text-sm font-semibold text-[#f97316] underline underline-offset-2">
              Verbind Strava →
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-4 pt-8 pb-24">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-white">Activiteiten</h1>
        {heeftStrava && (
          <button onClick={syncStrava} disabled={syncing}
            className={cn('w-9 h-9 flex items-center justify-center rounded-xl border transition-colors',
              syncing ? 'bg-[#222230] border-[#2d2d3e]' : 'bg-[#1b1b27] border-[#2d2d3e] text-[#55556a]'
            )}>
            <RefreshCw size={15} className={syncing ? 'animate-spin text-[#f97316]' : ''} />
          </button>
        )}
      </div>

      {weken.map(({ key, label, sessies: wSessies, fysio, core }) => {
        const isOpen = openWeeks.has(key) || key === eersteWeekKey
        const totalKm = wSessies.reduce((s, r) => s + (r.afstand_km ?? 0), 0)
        const totalMin = wSessies.reduce((s, r) => s + (r.duur_minuten ?? 0), 0)
        const titel = weekTitel(key, label) || label

        return (
          <div key={key} className="bg-[#1b1b27] rounded-3xl border border-[#2d2d3e] overflow-hidden">
            {/* Week header */}
            <button
              onClick={() => toggleWeek(key)}
              className="w-full flex items-start justify-between px-4 pt-4 pb-3"
            >
              <div className="text-left">
                <p className="text-xs font-bold uppercase tracking-widest text-[#55556a]">{titel}</p>
                <div className="flex gap-4 mt-1.5">
                  <div className="text-left">
                    <p className="text-[10px] text-[#55556a] uppercase tracking-wide font-medium">Activiteiten</p>
                    <p className="text-lg font-bold text-white">{wSessies.length}</p>
                  </div>
                  {totalMin > 0 && (
                    <div className="text-left">
                      <p className="text-[10px] text-[#55556a] uppercase tracking-wide font-medium">Tijd</p>
                      <p className="text-lg font-bold text-white">{formatDuur(totalMin)}</p>
                    </div>
                  )}
                  {totalKm > 0 && (
                    <div className="text-left">
                      <p className="text-[10px] text-[#55556a] uppercase tracking-wide font-medium">Afstand</p>
                      <p className="text-lg font-bold text-white">{totalKm.toFixed(1)} km</p>
                    </div>
                  )}
                </div>
                {(fysio > 0 || core > 0) && (
                  <div className="flex gap-1.5 mt-2">
                    {core > 0 && (
                      <span className="text-[10px] bg-[#06b6d4]/10 text-[#06b6d4] px-2 py-0.5 rounded-full font-medium">
                        🧘 {core}× core
                      </span>
                    )}
                    {fysio > 0 && (
                      <span className="text-[10px] bg-[#f97316]/10 text-[#f97316] px-2 py-0.5 rounded-full font-medium">
                        💊 {fysio}× fysio
                      </span>
                    )}
                  </div>
                )}
              </div>
              {isOpen
                ? <ChevronUp size={18} className="text-[#55556a] mt-1 shrink-0" />
                : <ChevronDown size={18} className="text-[#55556a] mt-1 shrink-0" />}
            </button>

            {/* Sessies */}
            {isOpen && (
              <div className="border-t border-[#2d2d3e] divide-y divide-[#2d2d3e]">
                {wSessies.map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-8 h-8 rounded-xl bg-[#222230] flex items-center justify-center text-base shrink-0">
                      {TYPE_EMOJI[s.type] ?? '🏃'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{s.beschrijving}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-[11px] text-[#55556a]">
                          {new Date(s.datum + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </p>
                        {s.duur_minuten != null && (
                          <span className="flex items-center gap-0.5 text-[11px] text-[#55556a]">
                            <Timer size={9} />{formatDuur(s.duur_minuten)}
                          </span>
                        )}
                        {s.afstand_km != null && s.afstand_km > 0 && (
                          <span className="flex items-center gap-0.5 text-[11px] text-[#55556a]">
                            <MapPin size={9} />{s.afstand_km} km
                          </span>
                        )}
                      </div>
                    </div>
                    {s.intensiteit && (
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0', INTENSITEIT_KLEUR[s.intensiteit] ?? '')}>
                        {s.intensiteit}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
