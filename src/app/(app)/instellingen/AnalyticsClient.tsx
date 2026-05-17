'use client'
import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { Profile, Goal } from '@/types/database'

interface Sessie {
  datum: string
  type: string
  intensiteit: string
  voltooid: boolean
  overgeslagen: boolean
  afstand_km: number | null
  duur_minuten: number | null
  week_nummer: number | null
  session_feedback: unknown[]
}

interface Props {
  sessies: Sessie[]
  profiel: Profile | null
  doel: Goal | null
}

function maandNaam(datum: string): string {
  return new Date(datum + 'T12:00:00').toLocaleDateString('nl-NL', { month: 'short' })
}

function weekLabel(maandag: Date): string {
  return maandag.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

function getMaandag(datum: string): string {
  const d = new Date(datum + 'T12:00:00')
  const dag = d.getDay()
  d.setDate(d.getDate() - (dag === 0 ? 6 : dag - 1))
  return d.toISOString().split('T')[0]
}

const TYPE_KLEUR: Record<string, string> = {
  hardlopen: '#f97316',
  krachttraining: '#8b5cf6',
  core: '#06b6d4',
  cross: '#10b981',
  rust: '#e5e7eb',
}

const TYPE_LABEL: Record<string, string> = {
  hardlopen: 'Hardlopen',
  krachttraining: 'Kracht',
  core: 'Core',
  cross: 'Cross',
  rust: 'Rust',
}

const INTENSITEIT_LABEL: Record<string, string> = {
  herstel: 'Herstel',
  makkelijk: 'Makkelijk',
  gemiddeld: 'Tempo',
  zwaar: 'Lang',
  interval: 'Interval',
}

export function AnalyticsClient({ sessies, profiel, doel }: Props) {
  const voltooid = sessies.filter(s => s.voltooid)
  const overgeslagen = sessies.filter(s => s.overgeslagen)
  const gepland = sessies.filter(s => !s.voltooid && !s.overgeslagen)

  const stats = useMemo(() => {
    const kmTotaal = voltooid.reduce((sum, s) => sum + (s.afstand_km ?? 0), 0)
    const duurTotaal = voltooid.reduce((sum, s) => sum + (s.duur_minuten ?? 0), 0)
    const langsteRun = Math.max(0, ...voltooid.filter(s => s.type === 'hardlopen').map(s => s.afstand_km ?? 0))
    const consistentie = (voltooid.length + overgeslagen.length) > 0
      ? Math.round((voltooid.length / (voltooid.length + overgeslagen.length)) * 100)
      : 0

    // Deze maand
    const nu = new Date()
    const maandStart = new Date(nu.getFullYear(), nu.getMonth(), 1).toISOString().split('T')[0]
    const dezeMonthSessies = voltooid.filter(s => s.datum >= maandStart)
    const kmDezeMaand = dezeMonthSessies.reduce((sum, s) => sum + (s.afstand_km ?? 0), 0)

    return { kmTotaal, duurTotaal, langsteRun, consistentie, kmDezeMaand, aantalDezeMaand: dezeMonthSessies.length }
  }, [voltooid, overgeslagen])

  // Weken (laatste 10)
  const wekenData = useMemo(() => {
    const weekMap = new Map<string, { km: number; count: number }>()
    voltooid.forEach(s => {
      const maandag = getMaandag(s.datum)
      const prev = weekMap.get(maandag) ?? { km: 0, count: 0 }
      weekMap.set(maandag, { km: prev.km + (s.afstand_km ?? 0), count: prev.count + 1 })
    })
    const sorted = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-10)
    return sorted
  }, [voltooid])

  const maxKm = Math.max(1, ...wekenData.map(([, d]) => d.km))

  // Verdeling per type
  const typeVerdeling = useMemo(() => {
    const map = new Map<string, number>()
    voltooid.forEach(s => map.set(s.type, (map.get(s.type) ?? 0) + 1))
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([type, count]) => ({ type, count, pct: Math.round((count / voltooid.length) * 100) }))
  }, [voltooid])

  // Intensiteitsverdeling (hardlopen)
  const intensiteitVerdeling = useMemo(() => {
    const runs = voltooid.filter(s => s.type === 'hardlopen')
    const map = new Map<string, number>()
    runs.forEach(s => map.set(s.intensiteit, (map.get(s.intensiteit) ?? 0) + 1))
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([intensiteit, count]) => ({ intensiteit, count, pct: Math.round((count / Math.max(1, runs.length)) * 100) }))
  }, [voltooid])

  // Streak (weken op rij met ≥1 voltooide sessie)
  const streak = useMemo(() => {
    const now = new Date()
    let count = 0
    for (let i = 0; i < 52; i++) {
      const d = new Date(now)
      d.setDate(d.getDate() - i * 7)
      const maandag = getMaandag(d.toISOString().split('T')[0])
      const zondag = new Date(maandag + 'T12:00:00')
      zondag.setDate(zondag.getDate() + 6)
      const zondagStr = zondag.toISOString().split('T')[0]
      const heeftSessie = voltooid.some(s => s.datum >= maandag && s.datum <= zondagStr)
      if (heeftSessie) count++
      else if (i > 0) break
    }
    return count
  }, [voltooid])

  if (sessies.length === 0) {
    return (
      <div className="p-4 pb-24 text-center pt-12">
        <p className="text-4xl mb-3">📊</p>
        <p className="font-semibold text-[#1a1612]">Nog geen data</p>
        <p className="text-sm text-[#6b6560] mt-1">Zodra je trainingen afrondt verschijnen hier je statistieken</p>
      </div>
    )
  }

  return (
    <div className="p-4 pb-24 flex flex-col gap-5 pt-5">

      {/* Hoofd stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatKaart label="Km totaal" waarde={`${stats.kmTotaal.toFixed(0)} km`} sub="laatste 6 maanden" kleur="orange" />
        <StatKaart label="Trainingen" waarde={String(voltooid.length)} sub={`${overgeslagen.length} overgeslagen`} kleur="purple" />
        <StatKaart label="Consistentie" waarde={`${stats.consistentie}%`} sub="voltooid / gepland" kleur="green" />
        <StatKaart label="Streak" waarde={`${streak} wk`} sub="weken op rij" kleur="cyan" />
      </div>

      {/* Deze maand */}
      <div className="bg-white rounded-3xl p-4 shadow-sm">
        <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider mb-3">
          Deze maand — {new Date().toLocaleDateString('nl-NL', { month: 'long' })}
        </p>
        <div className="flex gap-4">
          <div>
            <p className="text-2xl font-bold text-[#f97316]">{stats.kmDezeMaand.toFixed(0)}<span className="text-sm font-normal text-[#6b6560] ml-1">km</span></p>
            <p className="text-xs text-[#a09990]">gelopen</p>
          </div>
          <div className="w-px bg-[#f0ede8]" />
          <div>
            <p className="text-2xl font-bold text-[#1a1612]">{stats.aantalDezeMaand}<span className="text-sm font-normal text-[#6b6560] ml-1">sessies</span></p>
            <p className="text-xs text-[#a09990]">afgerond</p>
          </div>
          {stats.langsteRun > 0 && (
            <>
              <div className="w-px bg-[#f0ede8]" />
              <div>
                <p className="text-2xl font-bold text-[#1a1612]">{stats.langsteRun.toFixed(1)}<span className="text-sm font-normal text-[#6b6560] ml-1">km</span></p>
                <p className="text-xs text-[#a09990]">langste run</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Wekelijkse km grafiek */}
      {wekenData.length > 1 && (
        <div className="bg-white rounded-3xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider mb-4">Km per week</p>
          <div className="flex items-end gap-1.5 h-24">
            {wekenData.map(([maandag, data]) => {
              const hoogte = Math.max(4, (data.km / maxKm) * 96)
              const isHuidig = maandag === getMaandag(new Date().toISOString().split('T')[0])
              return (
                <div key={maandag} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={cn('w-full rounded-t-lg transition-all', isHuidig ? 'bg-[#f97316]' : 'bg-[#f97316]/30')}
                    style={{ height: hoogte }}
                    title={`${data.km.toFixed(1)} km`}
                  />
                  <span className="text-[9px] text-[#a09990] leading-tight text-center">
                    {weekLabel(new Date(maandag + 'T12:00:00'))}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Trainingstype verdeling */}
      {typeVerdeling.length > 0 && (
        <div className="bg-white rounded-3xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider mb-3">Verdeling trainingstypes</p>
          <div className="flex gap-1 h-2.5 rounded-full overflow-hidden mb-3">
            {typeVerdeling.map(({ type, pct }) => (
              <div key={type} style={{ width: `${pct}%`, backgroundColor: TYPE_KLEUR[type] ?? '#e5e7eb' }} />
            ))}
          </div>
          <div className="flex flex-col gap-2">
            {typeVerdeling.map(({ type, count, pct }) => (
              <div key={type} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: TYPE_KLEUR[type] ?? '#e5e7eb' }} />
                <span className="text-sm text-[#1a1612] flex-1">{TYPE_LABEL[type] ?? type}</span>
                <span className="text-sm font-semibold text-[#1a1612]">{count}×</span>
                <span className="text-xs text-[#a09990] w-8 text-right">{pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loopintensiteit verdeling */}
      {intensiteitVerdeling.length > 0 && (
        <div className="bg-white rounded-3xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider mb-3">Loopintensiteit</p>
          <div className="flex flex-col gap-2.5">
            {intensiteitVerdeling.map(({ intensiteit, count, pct }) => (
              <div key={intensiteit}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[#1a1612] font-medium">{INTENSITEIT_LABEL[intensiteit] ?? intensiteit}</span>
                  <span className="text-[#a09990]">{count}× · {pct}%</span>
                </div>
                <div className="h-1.5 bg-[#f0ede8] rounded-full overflow-hidden">
                  <div className="h-full bg-[#f97316] rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Totale uren */}
      {stats.duurTotaal > 0 && (
        <div className="bg-white rounded-3xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider mb-2">Totale trainingstijd</p>
          <p className="text-3xl font-bold text-[#1a1612]">
            {Math.floor(stats.duurTotaal / 60)}<span className="text-base font-normal text-[#6b6560]"> uur </span>
            {stats.duurTotaal % 60}<span className="text-base font-normal text-[#6b6560]"> min</span>
          </p>
          <p className="text-xs text-[#a09990] mt-1">in {voltooid.length} sessies de afgelopen 6 maanden</p>
        </div>
      )}
    </div>
  )
}

function StatKaart({ label, waarde, sub, kleur }: { label: string; waarde: string; sub: string; kleur: 'orange' | 'purple' | 'green' | 'cyan' }) {
  const kleurMap = {
    orange: 'text-[#f97316] bg-[#f97316]/10',
    purple: 'text-[#8b5cf6] bg-[#8b5cf6]/10',
    green: 'text-[#10b981] bg-[#10b981]/10',
    cyan: 'text-[#06b6d4] bg-[#06b6d4]/10',
  }
  return (
    <div className={cn('rounded-3xl p-4', kleurMap[kleur])}>
      <p className="text-xs font-medium text-[#6b6560] mb-1">{label}</p>
      <p className={cn('text-2xl font-bold', kleurMap[kleur].split(' ')[0])}>{waarde}</p>
      <p className="text-xs text-[#a09990] mt-0.5">{sub}</p>
    </div>
  )
}
