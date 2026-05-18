'use client'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { Profile, Goal } from '@/types/database'
import { TrendingUp, TrendingDown, Minus, Activity, Timer, MapPin, Zap, Heart, ChevronDown, ChevronUp } from 'lucide-react'

interface SessionFeedback {
  werkelijke_afstand: number | null
  werkelijke_duur: number | null
  hartslag_gem: number | null
  hartslag_max: number | null
  rating: string | null
}

interface Sessie {
  id: string
  datum: string
  type: string
  intensiteit: string | null
  voltooid: boolean
  overgeslagen: boolean
  afstand_km: number | null
  duur_minuten: number | null
  beschrijving: string | null
  week_nummer: number | null
  session_feedback: SessionFeedback[]
}

interface FysioSessie {
  datum: string
  voltooid: boolean
}

interface Props {
  sessies: Sessie[]
  fysioSessies: FysioSessie[]
  profiel: Profile | null
  doel: Goal | null
}

// ── helpers ──────────────────────────────────────────────────────────────────

function getMaandag(datum: string): string {
  const d = new Date(datum + 'T12:00:00')
  const dag = d.getDay()
  d.setDate(d.getDate() - (dag === 0 ? 6 : dag - 1))
  return d.toISOString().split('T')[0]
}

function weekLabel(maandag: string): string {
  return new Date(maandag + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

function formatPace(minPerKm: number): string {
  const min = Math.floor(minPerKm)
  const sec = Math.round((minPerKm % 1) * 60)
  return `${min}:${sec.toString().padStart(2, '0')}`
}

function berekenPace(s: Sessie): number | null {
  const fb = s.session_feedback?.[0]
  const afstand = fb?.werkelijke_afstand ?? s.afstand_km
  const duur = fb?.werkelijke_duur ?? s.duur_minuten
  if (!afstand || !duur || afstand < 0.5) return null
  return duur / afstand
}

function berekenAfstand(s: Sessie): number {
  return s.session_feedback?.[0]?.werkelijke_afstand ?? s.afstand_km ?? 0
}

function formatHMS(totalMinuten: number): string {
  const uren = Math.floor(totalMinuten / 60)
  const min = Math.floor(totalMinuten % 60)
  const sec = Math.round((totalMinuten % 1) * 60)
  if (uren > 0) return `${uren}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  return `${min}:${sec.toString().padStart(2, '0')}`
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
const TYPE_EMOJI: Record<string, string> = {
  hardlopen: '🏃',
  krachttraining: '💪',
  core: '🧘',
  cross: '🚴',
  rust: '😴',
  fysio: '🩺',
}
const INTENSITEIT_KLEUR: Record<string, string> = {
  herstel: '#3b82f6',
  makkelijk: '#22c55e',
  gemiddeld: '#f97316',
  zwaar: '#ef4444',
  interval: '#a855f7',
}
const INTENSITEIT_LABEL: Record<string, string> = {
  herstel: 'Herstel',
  makkelijk: 'Duurloop',
  gemiddeld: 'Tempo',
  zwaar: 'Lange duurloop',
  interval: 'Interval',
}

const RATING_KLEUR: Record<string, string> = {
  te_zwaar: '#ef4444',
  zwaar: '#f97316',
  goed: '#22c55e',
  beter: '#3b82f6',
  topdag: '#a855f7',
}

// ATL/CTL helpers
const INTENSITEIT_FACTOR: Record<string, number> = {
  herstel: 0.4, makkelijk: 0.55, gemiddeld: 0.7, zwaar: 0.85, interval: 1.0
}
function berekenTSS(s: Sessie): number {
  const factor = INTENSITEIT_FACTOR[s.intensiteit ?? 'makkelijk'] ?? 0.55
  return (s.duur_minuten ?? 0) / 60 * factor * 100
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatKaart({ label, waarde, sub, kleur, icon: Icon }: {
  label: string; waarde: string; sub?: string
  kleur: string; icon?: React.ElementType
}) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon size={14} style={{ color: kleur }} />}
        <p className="text-xs font-medium text-[#a09990]">{label}</p>
      </div>
      <p className="text-2xl font-bold" style={{ color: kleur }}>{waarde}</p>
      {sub && <p className="text-xs text-[#a09990] mt-0.5">{sub}</p>}
    </div>
  )
}

function Trendpijl({ huidig, vorig, eenheid = '' }: { huidig: number; vorig: number; eenheid?: string }) {
  if (!vorig) return null
  const diff = huidig - vorig
  const pct = Math.abs(Math.round((diff / vorig) * 100))
  if (pct < 2) return <span className="text-xs text-[#a09990] flex items-center gap-0.5"><Minus size={11} /> gelijk</span>
  if (diff > 0) return <span className="text-xs text-green-600 flex items-center gap-0.5"><TrendingUp size={11} /> +{Math.abs(diff).toFixed(1)}{eenheid}</span>
  return <span className="text-xs text-red-500 flex items-center gap-0.5"><TrendingDown size={11} /> -{Math.abs(diff).toFixed(1)}{eenheid}</span>
}

// Activiteiten heatmap — 12 weken terugkijkend
function Heatmap({ sessies, fysioSessies }: { sessies: Sessie[]; fysioSessies: FysioSessie[] }) {
  const weken = useMemo(() => {
    const result: { maandag: string; dagen: { datum: string; typen: string[] }[] }[] = []
    const nu = new Date()
    for (let w = 11; w >= 0; w--) {
      const ma = new Date(nu)
      ma.setDate(nu.getDate() - nu.getDay() + 1 - w * 7)
      const maandag = ma.toISOString().split('T')[0]
      const dagen = []
      for (let d = 0; d < 7; d++) {
        const dag = new Date(ma)
        dag.setDate(ma.getDate() + d)
        const datum = dag.toISOString().split('T')[0]
        const typen = [
          ...sessies.filter(s => s.datum === datum && s.voltooid).map(s => s.type),
          ...fysioSessies.filter(s => s.datum === datum && s.voltooid).map(() => 'fysio'),
        ]
        dagen.push({ datum, typen })
      }
      result.push({ maandag, dagen })
    }
    return result
  }, [sessies, fysioSessies])

  const TYPE_DOT: Record<string, string> = {
    hardlopen: '#f97316',
    krachttraining: '#8b5cf6',
    core: '#06b6d4',
    cross: '#10b981',
    fysio: '#f59e0b',
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider mb-3">Activiteiten — afgelopen 12 weken</p>
      <div className="flex gap-1 mb-2">
        {['Ma','Di','Wo','Do','Vr','Za','Zo'].map(d => (
          <div key={d} className="flex-1 text-center text-[9px] text-[#c8c3bc] font-medium">{d}</div>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {weken.map(({ maandag, dagen }) => (
          <div key={maandag} className="flex gap-1">
            {dagen.map(({ datum, typen }) => {
              const hoofdtype = typen[0]
              const bg = hoofdtype ? (TYPE_DOT[hoofdtype] ?? '#f97316') : '#f0ede8'
              const meerdere = typen.length > 1
              return (
                <div key={datum}
                  className="flex-1 aspect-square rounded-md relative"
                  style={{ backgroundColor: bg, opacity: hoofdtype ? 0.85 : 1 }}
                  title={typen.join(' + ') || datum}
                >
                  {meerdere && (
                    <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-white/70" />
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3">
        {[
          { kleur: '#f97316', label: 'Hardlopen' },
          { kleur: '#8b5cf6', label: 'Kracht' },
          { kleur: '#06b6d4', label: 'Core' },
          { kleur: '#10b981', label: 'Cross' },
          { kleur: '#f59e0b', label: 'Fysio' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.kleur, opacity: 0.85 }} />
            <span className="text-[10px] text-[#a09990]">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Eenvoudige balk-grafiek
function BarChart({ data, kleur, suffix = '' }: {
  data: { label: string; waarde: number; highlight?: boolean }[]
  kleur: string
  suffix?: string
}) {
  const max = Math.max(1, ...data.map(d => d.waarde))
  return (
    <div className="flex items-end gap-1.5" style={{ height: 80 }}>
      {data.map((d, i) => {
        const hoogte = Math.max(4, (d.waarde / max) * 72)
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[8px] text-[#a09990]">{d.waarde > 0 ? `${d.waarde.toFixed(d.waarde < 10 ? 1 : 0)}${suffix}` : ''}</span>
            <div
              className="w-full rounded-t-md transition-all"
              style={{ height: hoogte, backgroundColor: d.highlight ? kleur : kleur + '40' }}
            />
            <span className="text-[9px] text-[#a09990] leading-tight text-center truncate w-full text-center">{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// Pace sparkline voor looptrainingen
function PaceSparkline({ runs }: { runs: { datum: string; pace: number }[] }) {
  if (runs.length < 2) return null
  const maxPace = Math.max(...runs.map(r => r.pace))
  const minPace = Math.min(...runs.map(r => r.pace))
  const range = maxPace - minPace || 1
  const W = 280, H = 56, pad = 8
  const points = runs.map((r, i) => {
    const x = pad + (i / (runs.length - 1)) * (W - pad * 2)
    // Omgekeerd: snellere pace (lager getal) = hoger in grafiek
    const y = pad + ((r.pace - minPace) / range) * (H - pad * 2)
    return { x, y, ...r }
  })
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        <path d={path} fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" fill="#f97316" />
        ))}
        <text x={points[points.findIndex(p => p.pace === minPace)].x} y={points.find(p => p.pace === minPace)!.y - 5}
          fontSize="8" fill="#22c55e" textAnchor="middle">{formatPace(minPace)}</text>
        <text x={points[points.findIndex(p => p.pace === maxPace)].x} y={points.find(p => p.pace === maxPace)!.y + 12}
          fontSize="8" fill="#ef4444" textAnchor="middle">{formatPace(maxPace)}</text>
      </svg>
      <div className="flex justify-between text-[9px] text-[#c8c3bc] mt-1 px-1">
        <span>{new Date(runs[0].datum + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</span>
        <span>{new Date(runs[runs.length - 1].datum + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</span>
      </div>
    </div>
  )
}

// ATL/CTL/TSB chart — SVG lijn-grafiek over 12 weken
function ATLCTLChart({ sessies }: { sessies: Sessie[] }) {
  const data = useMemo(() => {
    const nu = new Date()
    const dagMap = new Map<string, number>()
    sessies.filter(s => s.voltooid).forEach(s => {
      const tss = berekenTSS(s)
      dagMap.set(s.datum, (dagMap.get(s.datum) ?? 0) + tss)
    })

    const lambdaATL = Math.exp(-1 / 7)
    const lambdaCTL = Math.exp(-1 / 42)
    let atl = 0, ctl = 0
    const punten: { datum: string; atl: number; ctl: number; tsb: number }[] = []

    // Start 12 weken terug, loop tot nu
    const start = new Date(nu)
    start.setDate(start.getDate() - 84)

    for (let i = 0; i <= 84; i++) {
      const dag = new Date(start)
      dag.setDate(start.getDate() + i)
      const datumStr = dag.toISOString().split('T')[0]
      const tss = dagMap.get(datumStr) ?? 0
      atl = atl * lambdaATL + tss * (1 - lambdaATL)
      ctl = ctl * lambdaCTL + tss * (1 - lambdaCTL)
      punten.push({ datum: datumStr, atl, ctl, tsb: ctl - atl })
    }
    return punten
  }, [sessies])

  if (data.length === 0) return null

  const W = 320, H = 100, pad = { t: 8, b: 20, l: 8, r: 8 }
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b

  const maxVal = Math.max(1, ...data.map(d => Math.max(d.atl, d.ctl)))
  const minTSB = Math.min(0, ...data.map(d => d.tsb))
  const maxTSB = Math.max(0, ...data.map(d => d.tsb))
  const tsbRange = Math.max(1, maxTSB - minTSB)

  const xOf = (i: number) => pad.l + (i / (data.length - 1)) * innerW
  const yOf = (v: number) => pad.t + (1 - v / maxVal) * innerH * 0.7
  const yTSB = (v: number) => pad.t + innerH * 0.7 + (1 - (v - minTSB) / tsbRange) * innerH * 0.25

  const atlPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOf(d.atl)}`).join(' ')
  const ctlPath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOf(d.ctl)}`).join(' ')

  // Week-tick labels (elke 2 weken)
  const ticks = [0, 14, 28, 42, 56, 70, 84].map(i => ({ i, datum: data[Math.min(i, data.length - 1)].datum }))

  const huidig = data[data.length - 1]

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider">Trainingsbelasting (ATL/CTL)</p>
      </div>
      <div className="flex gap-4 mb-3 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 rounded bg-[#f97316]" />
          <span className="text-[#6b6560]">ATL <span className="font-semibold text-[#1a1612]">{huidig.atl.toFixed(0)}</span></span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 rounded bg-[#3b82f6]" />
          <span className="text-[#6b6560]">CTL <span className="font-semibold text-[#1a1612]">{huidig.ctl.toFixed(0)}</span></span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 rounded" style={{ backgroundColor: huidig.tsb >= 0 ? '#22c55e40' : '#ef444440' }} />
          <span className="text-[#6b6560]">TSB <span className="font-semibold" style={{ color: huidig.tsb >= 0 ? '#22c55e' : '#ef4444' }}>{huidig.tsb >= 0 ? '+' : ''}{huidig.tsb.toFixed(0)}</span></span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {/* TSB bars */}
        {data.map((d, i) => {
          const barX = xOf(i)
          const zero = yTSB(0)
          const barY = yTSB(d.tsb)
          const barH = Math.abs(zero - barY)
          return (
            <rect key={i}
              x={barX - 1} y={Math.min(zero, barY)}
              width={2} height={Math.max(1, barH)}
              fill={d.tsb >= 0 ? '#22c55e' : '#ef4444'}
              opacity={0.35}
            />
          )
        })}
        {/* Scheidingslijn */}
        <line x1={pad.l} y1={pad.t + innerH * 0.72} x2={W - pad.r} y2={pad.t + innerH * 0.72}
          stroke="#e5e0d8" strokeWidth="0.5" strokeDasharray="2,2" />
        {/* CTL lijn */}
        <path d={ctlPath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {/* ATL lijn */}
        <path d={atlPath} fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4,2" />
        {/* Week ticks */}
        {ticks.map(t => (
          <text key={t.i} x={xOf(t.i)} y={H - 2} fontSize="7" fill="#c8c3bc" textAnchor="middle">
            {new Date(t.datum + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
          </text>
        ))}
      </svg>
      <p className="text-[10px] text-[#a09990] mt-2">
        TSB &gt; 0 = fris · TSB &lt; 0 = opbouw · ATL = vermoeidheid · CTL = conditie
      </p>
    </div>
  )
}

// Week vergelijking
function WeekVergelijking({ dezeWeek, vorigeWeek }: {
  dezeWeek: { km: number; sessies: number; duur: number; consistentie: number }
  vorigeWeek: { km: number; sessies: number; duur: number; consistentie: number }
}) {
  const rijen = [
    { label: 'Km gelopen', deze: dezeWeek.km, vorige: vorigeWeek.km, fmt: (v: number) => `${v.toFixed(1)} km`, eenheid: ' km' },
    { label: 'Sessies', deze: dezeWeek.sessies, vorige: vorigeWeek.sessies, fmt: (v: number) => String(v), eenheid: '' },
    { label: 'Trainingstijd', deze: dezeWeek.duur, vorige: vorigeWeek.duur, fmt: (v: number) => `${Math.floor(v / 60)}u ${v % 60}m`, eenheid: ' min' },
    { label: 'Consistentie', deze: dezeWeek.consistentie, vorige: vorigeWeek.consistentie, fmt: (v: number) => `${v}%`, eenheid: '%' },
  ]
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider mb-3">Week vergelijking</p>
      <div className="grid grid-cols-3 gap-1 mb-2 text-[10px] text-[#a09990]">
        <span>Onderdeel</span>
        <span className="text-center font-semibold text-[#f97316]">Deze week</span>
        <span className="text-center">Vorige week</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {rijen.map(r => {
          const diff = r.deze - r.vorige
          const pct = r.vorige ? Math.abs(Math.round((diff / r.vorige) * 100)) : 0
          const toon = pct >= 2
          return (
            <div key={r.label} className="grid grid-cols-3 gap-1 items-center">
              <span className="text-xs text-[#6b6560]">{r.label}</span>
              <div className="flex flex-col items-center">
                <span className="text-sm font-bold text-[#1a1612]">{r.fmt(r.deze)}</span>
                {toon && (
                  <span className="text-[9px]" style={{ color: diff > 0 ? '#22c55e' : '#ef4444' }}>
                    {diff > 0 ? '▲' : '▼'} {pct}%
                  </span>
                )}
              </div>
              <span className="text-sm text-[#a09990] text-center">{r.fmt(r.vorige)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Race predictor (Riegel formule)
function RacePredictor({ loopSessies }: { loopSessies: Sessie[] }) {
  const predictor = useMemo(() => {
    const achtWekenGeleden = new Date(); achtWekenGeleden.setDate(achtWekenGeleden.getDate() - 56)
    const achtWekenStr = achtWekenGeleden.toISOString().split('T')[0]

    // Zoek meest recente run met >= 5km en bekende pace, binnen 8 weken
    const kandidaten = loopSessies
      .filter(s => {
        const afstand = berekenAfstand(s)
        const pace = berekenPace(s)
        return afstand >= 5 && pace !== null && s.datum >= achtWekenStr
      })
      .sort((a, b) => b.datum.localeCompare(a.datum))

    if (kandidaten.length === 0) return null

    const run = kandidaten[0]
    const d1 = berekenAfstand(run)
    const pace = berekenPace(run)!
    const t1 = pace * d1 // totale minuten

    const predict = (d2: number) => t1 * Math.pow(d2 / d1, 1.06)

    return {
      datum: run.datum,
      d1,
      t1,
      voorspellingen: [
        { label: '5 km', afstand: 5 },
        { label: '10 km', afstand: 10 },
        { label: 'Halve marathon', afstand: 21.0975 },
        { label: 'Marathon', afstand: 42.195 },
      ].filter(v => v.afstand > d1 * 0.5).map(v => ({
        label: v.label,
        tijd: predict(v.afstand),
        relevant: v.afstand >= d1,
      })),
    }
  }, [loopSessies])

  if (!predictor) return null

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider">Race Predictor</p>
      </div>
      <p className="text-[10px] text-[#a09990] mb-3">
        Op basis van je {predictor.d1.toFixed(1)} km run op{' '}
        {new Date(predictor.datum + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}
      </p>
      <div className="flex flex-col gap-2">
        {predictor.voorspellingen.map(v => (
          <div key={v.label} className="flex items-center justify-between">
            <span className="text-sm text-[#1a1612]" style={{ opacity: v.relevant ? 1 : 0.5 }}>{v.label}</span>
            <span className="text-sm font-bold" style={{ color: v.relevant ? '#f97316' : '#a09990' }}>
              {formatHMS(v.tijd)}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[#c8c3bc] mt-3">Riegel formule · t₂ = t₁ × (d₂/d₁)^1.06</p>
    </div>
  )
}

// Hartslag zones
function HartslagZones({ loopSessies, maxHR }: { loopSessies: Sessie[]; maxHR: number }) {
  const zones = [
    { label: 'Z1 Herstel', min: 0, max: 0.60, kleur: '#3b82f6' },
    { label: 'Z2 Vetverbranding', min: 0.60, max: 0.70, kleur: '#22c55e' },
    { label: 'Z3 Aerobisch', min: 0.70, max: 0.80, kleur: '#eab308' },
    { label: 'Z4 Drempel', min: 0.80, max: 0.90, kleur: '#f97316' },
    { label: 'Z5 Maximaal', min: 0.90, max: 1.0, kleur: '#ef4444' },
  ]

  const zoneCounts = useMemo(() => {
    const counts = new Array(5).fill(0)
    loopSessies.forEach(s => {
      const hr = s.session_feedback?.[0]?.hartslag_gem
      if (!hr) return
      const pct = hr / maxHR
      const idx = zones.findIndex(z => pct >= z.min && pct < z.max)
      if (idx >= 0) counts[idx]++
      else if (pct >= 0.90) counts[4]++
    })
    return counts
  }, [loopSessies, maxHR])

  const totaal = zoneCounts.reduce((a, b) => a + b, 0)
  if (totaal === 0) return null

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Heart size={14} className="text-red-400" />
        <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider">Hartslag zones</p>
        <span className="text-[10px] text-[#a09990] ml-auto">max {maxHR} bpm</span>
      </div>
      {/* Verdeling balk */}
      <div className="flex h-3 rounded-full overflow-hidden gap-px mb-3">
        {zones.map((z, i) => (
          zoneCounts[i] > 0 ? (
            <div key={z.label}
              style={{ width: `${Math.round((zoneCounts[i] / totaal) * 100)}%`, backgroundColor: z.kleur }}
            />
          ) : null
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {zones.map((z, i) => {
          const pct = totaal ? Math.round((zoneCounts[i] / totaal) * 100) : 0
          return (
            <div key={z.label} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: z.kleur }} />
              <span className="text-xs text-[#1a1612] flex-1">{z.label}</span>
              <span className="text-xs text-[#a09990]">{Math.round(z.min * maxHR)}–{Math.round(z.max * maxHR)} bpm</span>
              <span className="text-xs font-semibold text-[#1a1612] w-6 text-right">{zoneCounts[i]}</span>
              <span className="text-[10px] text-[#a09990] w-7 text-right">{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Trainingslog entry
function LogEntry({ sessie }: { sessie: Sessie }) {
  const [open, setOpen] = useState(false)
  const fb = sessie.session_feedback?.[0]
  const afstand = berekenAfstand(sessie)
  const pace = berekenPace(sessie)
  const duur = fb?.werkelijke_duur ?? sessie.duur_minuten
  const rating = fb?.rating

  return (
    <div className="border-b border-[#f0ede8] last:border-0 py-2.5">
      <button className="w-full text-left" onClick={() => setOpen(v => !v)}>
        <div className="flex items-center gap-2">
          <span className="text-base">{TYPE_EMOJI[sessie.type] ?? '🏃'}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-[#1a1612] truncate">
                {TYPE_LABEL[sessie.type] ?? sessie.type}
                {sessie.intensiteit ? ` · ${INTENSITEIT_LABEL[sessie.intensiteit] ?? sessie.intensiteit}` : ''}
              </span>
              {rating && (
                <span className="w-2 h-2 rounded-full shrink-0 inline-block"
                  style={{ backgroundColor: RATING_KLEUR[rating] ?? '#a09990' }}
                  title={rating}
                />
              )}
            </div>
            <div className="flex items-center gap-2 text-[10px] text-[#a09990] mt-0.5 flex-wrap">
              <span>{new Date(sessie.datum + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              {afstand > 0 && <span>{afstand.toFixed(1)} km</span>}
              {duur && <span>{Math.floor(duur / 60)}u {duur % 60}m</span>}
              {pace && <span>{formatPace(pace)} /km</span>}
            </div>
          </div>
          {open ? <ChevronUp size={14} className="text-[#a09990] shrink-0" /> : <ChevronDown size={14} className="text-[#a09990] shrink-0" />}
        </div>
      </button>
      {open && (
        <div className="mt-2 pl-7 text-xs text-[#6b6560] flex flex-col gap-1">
          {sessie.beschrijving && <p>{sessie.beschrijving}</p>}
          {fb?.hartslag_gem && <p>Hartslag: {fb.hartslag_gem} bpm gem{fb.hartslag_max ? `, ${fb.hartslag_max} bpm max` : ''}</p>}
          {fb?.werkelijke_afstand != null && sessie.afstand_km != null && Math.abs(fb.werkelijke_afstand - sessie.afstand_km) > 0.1 && (
            <p>Gepland: {sessie.afstand_km.toFixed(1)} km · Werkelijk: {fb.werkelijke_afstand.toFixed(1)} km</p>
          )}
          {rating && <p>Gevoel: <span className="font-medium" style={{ color: RATING_KLEUR[rating] }}>{rating.replace('_', ' ')}</span></p>}
        </div>
      )}
    </div>
  )
}

// Trainingslog gegroepeerd per week
function TrainingsLog({ sessies }: { sessies: Sessie[] }) {
  const gegroepeerd = useMemo(() => {
    const voltooid = sessies.filter(s => s.voltooid).sort((a, b) => b.datum.localeCompare(a.datum))
    const map = new Map<string, Sessie[]>()
    voltooid.forEach(s => {
      const ma = getMaandag(s.datum)
      const arr = map.get(ma) ?? []
      arr.push(s)
      map.set(ma, arr)
    })
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([ma, items]) => ({ maandag: ma, sessies: items }))
  }, [sessies])

  if (gegroepeerd.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-3xl mb-2">📋</p>
        <p className="text-[#6b6560]">Nog geen voltooide sessies</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {gegroepeerd.map(({ maandag, sessies: weekSessies }) => {
        const zo = new Date(maandag + 'T12:00:00'); zo.setDate(zo.getDate() + 6)
        const weekKm = weekSessies.filter(s => s.type === 'hardlopen').reduce((sum, s) => sum + berekenAfstand(s), 0)
        return (
          <div key={maandag} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-baseline justify-between mb-2">
              <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider">
                Week van {new Date(maandag + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}
              </p>
              <div className="flex items-center gap-3 text-[10px] text-[#a09990]">
                {weekKm > 0 && <span>{weekKm.toFixed(1)} km</span>}
                <span>{weekSessies.length} sessies</span>
              </div>
            </div>
            {weekSessies.map(s => <LogEntry key={s.id} sessie={s} />)}
          </div>
        )
      })}
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export function AnalyticsClient({ sessies, fysioSessies, profiel, doel }: Props) {
  const [tab, setTab] = useState<'overzicht' | 'hardlopen' | 'log' | 'herstel'>('overzicht')

  const maxHartslag = (profiel as Record<string, unknown>)?.max_hartslag as number | null

  const voltooid = sessies.filter(s => s.voltooid)
  const loopSessies = voltooid.filter(s => s.type === 'hardlopen')
  const krachtSessies = voltooid.filter(s => s.type === 'krachttraining')
  const coreSessies = voltooid.filter(s => s.type === 'core')
  const crossSessies = voltooid.filter(s => s.type === 'cross')
  const fysioVoltooid = fysioSessies.filter(s => s.voltooid)

  // Huidige & vorige week
  const nu = new Date()
  const huidigeWeekMa = getMaandag(nu.toISOString().split('T')[0])
  const vorigeWeekMa = (() => {
    const d = new Date(huidigeWeekMa + 'T12:00:00'); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0]
  })()
  const vorigeWeekZo = (() => {
    const d = new Date(huidigeWeekMa + 'T12:00:00'); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0]
  })()

  // ── Overzicht stats ────────────────────────────────────────────────────────
  const totaalKm = loopSessies.reduce((s, r) => s + berekenAfstand(r), 0)
  const totaalDuur = voltooid.reduce((s, r) => s + (r.duur_minuten ?? 0), 0)
  const consistentie = (() => {
    const gepland = sessies.filter(s => !s.overgeslagen).length
    return gepland > 0 ? Math.round((voltooid.length / gepland) * 100) : 0
  })()
  const streak = (() => {
    let count = 0
    for (let i = 0; i < 26; i++) {
      const ma = new Date(huidigeWeekMa + 'T12:00:00'); ma.setDate(ma.getDate() - i * 7)
      const maStr = ma.toISOString().split('T')[0]
      const zo = new Date(ma); zo.setDate(ma.getDate() + 6); const zoStr = zo.toISOString().split('T')[0]
      const heeftSessie = voltooid.some(s => s.datum >= maStr && s.datum <= zoStr) ||
        fysioVoltooid.some(s => s.datum >= maStr && s.datum <= zoStr)
      if (heeftSessie) count++
      else if (i > 0) break
    }
    return count
  })()

  const typeVerdeling = useMemo(() => {
    const map = new Map<string, number>()
    voltooid.forEach(s => map.set(s.type, (map.get(s.type) ?? 0) + 1))
    fysioVoltooid.forEach(() => map.set('fysio', (map.get('fysio') ?? 0) + 1))
    const totaal = Array.from(map.values()).reduce((a, b) => a + b, 0) || 1
    return Array.from(map.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([type, count]) => ({ type, count, pct: Math.round((count / totaal) * 100) }))
  }, [voltooid, fysioVoltooid])

  // ── Week vergelijking data ─────────────────────────────────────────────────
  const dezeWeekData = useMemo(() => {
    const sessiesDezeWeek = voltooid.filter(s => s.datum >= huidigeWeekMa)
    const km = loopSessies.filter(s => s.datum >= huidigeWeekMa).reduce((s, r) => s + berekenAfstand(r), 0)
    const duur = sessiesDezeWeek.reduce((s, r) => s + (r.duur_minuten ?? 0), 0)
    const geplande = sessies.filter(s => s.datum >= huidigeWeekMa && !s.overgeslagen).length
    return {
      km,
      sessies: sessiesDezeWeek.length,
      duur,
      consistentie: geplande > 0 ? Math.round((sessiesDezeWeek.length / geplande) * 100) : 0,
    }
  }, [voltooid, loopSessies, sessies, huidigeWeekMa])

  const vorigeWeekData = useMemo(() => {
    const sessiesVorigeWeek = voltooid.filter(s => s.datum >= vorigeWeekMa && s.datum <= vorigeWeekZo)
    const km = loopSessies.filter(s => s.datum >= vorigeWeekMa && s.datum <= vorigeWeekZo).reduce((s, r) => s + berekenAfstand(r), 0)
    const duur = sessiesVorigeWeek.reduce((s, r) => s + (r.duur_minuten ?? 0), 0)
    const geplande = sessies.filter(s => s.datum >= vorigeWeekMa && s.datum <= vorigeWeekZo && !s.overgeslagen).length
    return {
      km,
      sessies: sessiesVorigeWeek.length,
      duur,
      consistentie: geplande > 0 ? Math.round((sessiesVorigeWeek.length / geplande) * 100) : 0,
    }
  }, [voltooid, loopSessies, sessies, vorigeWeekMa, vorigeWeekZo])

  // ── Hardlopen stats ────────────────────────────────────────────────────────
  const loopMeetPace = loopSessies.filter(s => berekenPace(s) !== null)
  const paceRuns = loopMeetPace.map(s => ({ datum: s.datum, pace: berekenPace(s)! })).slice(-12)

  const gemPace = paceRuns.length
    ? paceRuns.reduce((s, r) => s + r.pace, 0) / paceRuns.length
    : null

  const vierWekenGeleden = (() => { const d = new Date(); d.setDate(d.getDate() - 28); return d.toISOString().split('T')[0] })()
  const achtWekenGeleden = (() => { const d = new Date(); d.setDate(d.getDate() - 56); return d.toISOString().split('T')[0] })()
  const paceDeze4Weken = paceRuns.filter(r => r.datum >= vierWekenGeleden)
  const paceVorige4Weken = paceRuns.filter(r => r.datum >= achtWekenGeleden && r.datum < vierWekenGeleden)
  const gemPaceDeze = paceDeze4Weken.length ? paceDeze4Weken.reduce((s, r) => s + r.pace, 0) / paceDeze4Weken.length : null
  const gemPaceVorige = paceVorige4Weken.length ? paceVorige4Weken.reduce((s, r) => s + r.pace, 0) / paceVorige4Weken.length : null

  const kmPerWeek = useMemo(() => {
    const map = new Map<string, number>()
    loopSessies.forEach(s => {
      const ma = getMaandag(s.datum)
      map.set(ma, (map.get(ma) ?? 0) + berekenAfstand(s))
    })
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-10)
      .map(([ma, km]) => ({ label: weekLabel(ma), waarde: km, highlight: ma === huidigeWeekMa }))
  }, [loopSessies, huidigeWeekMa])

  const kmDezeWeek = loopSessies.filter(s => s.datum >= huidigeWeekMa).reduce((s, r) => s + berekenAfstand(r), 0)
  const kmVorigeWeek = loopSessies.filter(s => s.datum >= vorigeWeekMa && s.datum <= vorigeWeekZo).reduce((s, r) => s + berekenAfstand(r), 0)
  const langsteRun = Math.max(0, ...loopSessies.map(s => berekenAfstand(s)))

  const pacePerIntensiteit = useMemo(() => {
    const map = new Map<string, number[]>()
    loopSessies.forEach(s => {
      const pace = berekenPace(s)
      if (pace && s.intensiteit) {
        const arr = map.get(s.intensiteit) ?? []
        arr.push(pace)
        map.set(s.intensiteit, arr)
      }
    })
    const volgorde = ['herstel', 'makkelijk', 'gemiddeld', 'zwaar', 'interval']
    return volgorde.filter(v => map.has(v)).map(intensiteit => {
      const paces = map.get(intensiteit)!
      const gem = paces.reduce((a, b) => a + b, 0) / paces.length
      return { intensiteit, count: paces.length, gemPace: gem }
    })
  }, [loopSessies])

  const hartslagStats = useMemo(() => {
    const metHartslag = loopSessies.filter(s => s.session_feedback?.[0]?.hartslag_gem)
    if (!metHartslag.length) return null
    const gem = Math.round(metHartslag.reduce((s, r) => s + r.session_feedback[0].hartslag_gem!, 0) / metHartslag.length)
    const max = Math.max(...metHartslag.map(r => r.session_feedback[0].hartslag_max ?? 0))
    return { gem, max, aantalSessies: metHartslag.length }
  }, [loopSessies])

  // ── Herstel stats ──────────────────────────────────────────────────────────
  const corePerWeek = useMemo(() => {
    const map = new Map<string, number>()
    coreSessies.forEach(s => {
      const ma = getMaandag(s.datum)
      map.set(ma, (map.get(ma) ?? 0) + 1)
    })
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-8)
      .map(([ma, count]) => ({ label: weekLabel(ma), waarde: count, highlight: ma === huidigeWeekMa }))
  }, [coreSessies, huidigeWeekMa])

  const fysioPerWeek = useMemo(() => {
    const map = new Map<string, number>()
    fysioVoltooid.forEach(s => {
      const ma = getMaandag(s.datum)
      map.set(ma, (map.get(ma) ?? 0) + 1)
    })
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-8)
      .map(([ma, count]) => ({ label: weekLabel(ma), waarde: count, highlight: ma === huidigeWeekMa }))
  }, [fysioVoltooid, huidigeWeekMa])

  const gemCorePerWeek = corePerWeek.length
    ? (corePerWeek.reduce((s, d) => s + d.waarde, 0) / corePerWeek.length).toFixed(1)
    : '0'
  const gemFysioPerWeek = fysioPerWeek.length
    ? (fysioPerWeek.reduce((s, d) => s + d.waarde, 0) / fysioPerWeek.length).toFixed(1)
    : '0'

  // ── leeg scherm ────────────────────────────────────────────────────────────
  if (voltooid.length === 0 && fysioVoltooid.length === 0) {
    return (
      <div className="p-4 pb-24 text-center pt-12">
        <p className="text-4xl mb-3">📊</p>
        <p className="font-semibold text-[#1a1612]">Nog geen data</p>
        <p className="text-sm text-[#6b6560] mt-1">Zodra je trainingen afrondt verschijnen hier je statistieken</p>
      </div>
    )
  }

  return (
    <div className="pb-24">
      {/* Tab navigatie */}
      <div className="sticky top-0 bg-[#f5f3f0] z-10 px-4 pt-4 pb-2">
        <div className="flex gap-1 bg-white rounded-2xl p-1 shadow-sm">
          {([
            { id: 'overzicht', label: 'Overzicht' },
            { id: 'hardlopen', label: 'Lopen' },
            { id: 'log', label: 'Log' },
            { id: 'herstel', label: 'Herstel' },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn('flex-1 py-2 rounded-xl text-sm font-medium transition-all',
                tab === t.id ? 'bg-[#f97316] text-white shadow-sm' : 'text-[#6b6560]')}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 flex flex-col gap-5 pt-4">

        {/* ── OVERZICHT ───────────────────────────────────────────────────── */}
        {tab === 'overzicht' && (
          <>
            {/* Stat grid */}
            <div className="grid grid-cols-2 gap-3">
              <StatKaart label="Km gelopen" waarde={`${totaalKm.toFixed(0)} km`}
                sub="afgelopen 6 mnd" kleur="#f97316" icon={MapPin} />
              <StatKaart label="Sessies" waarde={String(voltooid.length + fysioVoltooid.length)}
                sub={`${sessies.filter(s => s.overgeslagen).length} overgeslagen`} kleur="#8b5cf6" icon={Activity} />
              <StatKaart label="Consistentie" waarde={`${consistentie}%`}
                sub="voltooid van gepland" kleur="#10b981" icon={Zap} />
              <StatKaart label="Streak" waarde={`${streak} wk`}
                sub="weken actief op rij" kleur="#06b6d4" icon={Timer} />
            </div>

            {/* Trainingstijd */}
            {totaalDuur > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider mb-2">Totale trainingstijd</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-[#1a1612]">{Math.floor(totaalDuur / 60)}</span>
                  <span className="text-[#a09990]">uur</span>
                  <span className="text-2xl font-bold text-[#1a1612] ml-1">{totaalDuur % 60}</span>
                  <span className="text-[#a09990]">min</span>
                </div>
                <p className="text-xs text-[#a09990] mt-1">in {voltooid.length} sessies de afgelopen 6 maanden</p>
              </div>
            )}

            {/* Week vergelijking */}
            <WeekVergelijking dezeWeek={dezeWeekData} vorigeWeek={vorigeWeekData} />

            {/* ATL/CTL trainingsbelasting */}
            <ATLCTLChart sessies={sessies} />

            {/* Type verdeling */}
            {typeVerdeling.length > 0 && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider mb-3">Verdeling per activiteit</p>
                <div className="flex h-3 rounded-full overflow-hidden gap-px mb-4">
                  {typeVerdeling.map(({ type, pct }) => (
                    <div key={type} style={{ width: `${pct}%`, backgroundColor: TYPE_KLEUR[type] ?? '#f59e0b' }} />
                  ))}
                </div>
                <div className="flex flex-col gap-2.5">
                  {typeVerdeling.map(({ type, count, pct }) => (
                    <div key={type} className="flex items-center gap-2.5">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: type === 'fysio' ? '#f59e0b' : TYPE_KLEUR[type] ?? '#f59e0b' }} />
                      <span className="text-sm text-[#1a1612] flex-1">
                        {type === 'fysio' ? 'Fysio' : TYPE_LABEL[type] ?? type}
                      </span>
                      <div className="flex items-center gap-1">
                        <div className="w-20 h-1.5 bg-[#f0ede8] rounded-full overflow-hidden">
                          <div className="h-full rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: type === 'fysio' ? '#f59e0b' : TYPE_KLEUR[type] ?? '#f59e0b' }} />
                        </div>
                        <span className="text-xs font-semibold text-[#1a1612] w-5 text-right">{count}</span>
                        <span className="text-xs text-[#a09990] w-7 text-right">{pct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Heatmap */}
            <Heatmap sessies={sessies} fysioSessies={fysioSessies} />
          </>
        )}

        {/* ── HARDLOPEN ───────────────────────────────────────────────────── */}
        {tab === 'hardlopen' && (
          <>
            {loopSessies.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-3xl mb-2">🏃</p>
                <p className="text-[#6b6560]">Nog geen looptrainingen voltooid</p>
              </div>
            ) : (
              <>
                {/* Snelle stats */}
                <div className="grid grid-cols-2 gap-3">
                  <StatKaart label="Totaal km" waarde={`${totaalKm.toFixed(0)} km`}
                    sub="afgelopen 6 mnd" kleur="#f97316" icon={MapPin} />
                  <StatKaart label="Langste run" waarde={`${langsteRun.toFixed(1)} km`}
                    sub="beste prestatie" kleur="#ef4444" icon={TrendingUp} />
                  <div className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity size={14} className="text-[#f97316]" />
                      <p className="text-xs font-medium text-[#a09990]">Deze week</p>
                    </div>
                    <p className="text-2xl font-bold text-[#f97316]">{kmDezeWeek.toFixed(1)} <span className="text-sm font-normal text-[#a09990]">km</span></p>
                    <div className="mt-1">
                      <Trendpijl huidig={kmDezeWeek} vorig={kmVorigeWeek} eenheid=" km" />
                    </div>
                  </div>
                  {gemPace && (
                    <div className="bg-white rounded-2xl p-4 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <Timer size={14} className="text-[#f97316]" />
                        <p className="text-xs font-medium text-[#a09990]">Gem. tempo</p>
                      </div>
                      <p className="text-2xl font-bold text-[#f97316]">{formatPace(gemPace)} <span className="text-sm font-normal text-[#a09990]">/km</span></p>
                      {gemPaceDeze && gemPaceVorige && (
                        <div className="mt-1 text-xs text-[#a09990] flex items-center gap-1">
                          {gemPaceDeze < gemPaceVorige
                            ? <><TrendingUp size={11} className="text-green-500" /><span className="text-green-600">{(gemPaceVorige - gemPaceDeze).toFixed(1)} sec sneller</span></>
                            : gemPaceDeze > gemPaceVorige
                              ? <><TrendingDown size={11} className="text-orange-400" /><span className="text-orange-500">{(gemPaceDeze - gemPaceVorige).toFixed(1)} sec langzamer</span></>
                              : <><Minus size={11} /><span>gelijk aan vorige periode</span></>
                          }
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Race predictor */}
                <RacePredictor loopSessies={loopSessies} />

                {/* Tempo trend */}
                {paceRuns.length >= 3 && (
                  <div className="bg-white rounded-2xl p-4 shadow-sm">
                    <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider mb-3">Tempo — laatste {paceRuns.length} runs</p>
                    <PaceSparkline runs={paceRuns} />
                    <p className="text-xs text-[#a09990] mt-2 text-center">Lager = sneller</p>
                  </div>
                )}

                {/* Km per week */}
                {kmPerWeek.length > 1 && (
                  <div className="bg-white rounded-2xl p-4 shadow-sm">
                    <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider mb-4">Km per week</p>
                    <BarChart data={kmPerWeek} kleur="#f97316" suffix=" km" />
                  </div>
                )}

                {/* Intensiteit × pace */}
                {pacePerIntensiteit.length > 0 && (
                  <div className="bg-white rounded-2xl p-4 shadow-sm">
                    <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider mb-3">Tempo per trainingstype</p>
                    <div className="flex flex-col gap-3">
                      {pacePerIntensiteit.map(({ intensiteit, count, gemPace }) => (
                        <div key={intensiteit} className="flex items-center gap-3">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: INTENSITEIT_KLEUR[intensiteit] }} />
                          <div className="flex-1">
                            <div className="flex justify-between items-baseline mb-1">
                              <span className="text-sm font-medium text-[#1a1612]">{INTENSITEIT_LABEL[intensiteit]}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-[#a09990]">{count}×</span>
                                <span className="text-sm font-bold text-[#1a1612]">{formatPace(gemPace)} /km</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hartslag zones (als max_hartslag ingesteld) */}
                {maxHartslag && maxHartslag > 0 && (
                  <HartslagZones loopSessies={loopSessies} maxHR={maxHartslag} />
                )}

                {/* Hartslag gem/max stats */}
                {hartslagStats && (
                  <div className="bg-white rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <Heart size={14} className="text-red-400" />
                      <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider">Hartslag statistieken</p>
                    </div>
                    <div className="flex gap-6">
                      <div>
                        <p className="text-2xl font-bold text-red-400">{hartslagStats.gem}</p>
                        <p className="text-xs text-[#a09990]">gem. bpm</p>
                      </div>
                      <div className="w-px bg-[#f0ede8]" />
                      <div>
                        <p className="text-2xl font-bold text-[#1a1612]">{hartslagStats.max}</p>
                        <p className="text-xs text-[#a09990]">max bpm</p>
                      </div>
                      <div className="w-px bg-[#f0ede8]" />
                      <div>
                        <p className="text-2xl font-bold text-[#1a1612]">{hartslagStats.aantalSessies}</p>
                        <p className="text-xs text-[#a09990]">runs</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Cross-training & kracht */}
                {(krachtSessies.length > 0 || crossSessies.length > 0) && (
                  <div className="bg-white rounded-2xl p-4 shadow-sm">
                    <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider mb-3">Aanvullende training</p>
                    <div className="flex gap-4">
                      {krachtSessies.length > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center text-sm">💪</div>
                          <div>
                            <p className="text-lg font-bold text-[#8b5cf6]">{krachtSessies.length}</p>
                            <p className="text-xs text-[#a09990]">kracht</p>
                          </div>
                        </div>
                      )}
                      {crossSessies.length > 0 && (
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-green-100 flex items-center justify-center text-sm">🚴</div>
                          <div>
                            <p className="text-lg font-bold text-[#10b981]">{crossSessies.length}</p>
                            <p className="text-xs text-[#a09990]">cross</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── LOG ─────────────────────────────────────────────────────────── */}
        {tab === 'log' && (
          <TrainingsLog sessies={sessies} />
        )}

        {/* ── HERSTEL ─────────────────────────────────────────────────────── */}
        {tab === 'herstel' && (
          <>
            {coreSessies.length === 0 && fysioVoltooid.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-3xl mb-2">🧘</p>
                <p className="text-[#6b6560]">Nog geen herstel-sessies voltooid</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <StatKaart label="Core sessies" waarde={String(coreSessies.length)}
                    sub={`~${gemCorePerWeek}× per week`} kleur="#06b6d4" />
                  <StatKaart label="Fysio sessies" waarde={String(fysioVoltooid.length)}
                    sub={`~${gemFysioPerWeek}× per week`} kleur="#f59e0b" />
                </div>

                {/* Core per week */}
                {corePerWeek.length > 1 && (
                  <div className="bg-white rounded-2xl p-4 shadow-sm">
                    <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider mb-4">Core sessies per week</p>
                    <BarChart data={corePerWeek} kleur="#06b6d4" />
                  </div>
                )}

                {/* Fysio per week */}
                {fysioPerWeek.length > 1 && (
                  <div className="bg-white rounded-2xl p-4 shadow-sm">
                    <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider mb-4">Fysio sessies per week</p>
                    <BarChart data={fysioPerWeek} kleur="#f59e0b" />
                  </div>
                )}

                {/* Consistentie tabel */}
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider mb-3">Consistentie herstel</p>
                  <div className="flex flex-col gap-3">
                    {coreSessies.length > 0 && (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-[#1a1612] font-medium flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#06b6d4] inline-block" />
                            Core stability
                          </span>
                          <span className="text-[#a09990]">{coreSessies.length} sessies</span>
                        </div>
                        <div className="text-xs text-[#6b6560]">
                          Ingesteld: {profiel?.core_per_week ?? 2}× per week
                          {' · '}gem. {gemCorePerWeek}× gedaan
                        </div>
                      </div>
                    )}
                    {fysioVoltooid.length > 0 && (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-[#1a1612] font-medium flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] inline-block" />
                            Fysio
                          </span>
                          <span className="text-[#a09990]">{fysioVoltooid.length} sessies</span>
                        </div>
                        <div className="text-xs text-[#6b6560]">
                          Ingesteld: {profiel?.fysio_per_week ?? 3}× per week
                          {' · '}gem. {gemFysioPerWeek}× gedaan
                        </div>
                      </div>
                    )}
                    {krachtSessies.length > 0 && (
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-[#1a1612] font-medium flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6] inline-block" />
                            Krachttraining
                          </span>
                          <span className="text-[#a09990]">{krachtSessies.length} sessies</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Heatmap herstel */}
                <div className="bg-white rounded-2xl p-4 shadow-sm">
                  <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider mb-3">Activiteiten — afgelopen 12 weken</p>
                  <div className="flex gap-1 mb-2">
                    {['Ma','Di','Wo','Do','Vr','Za','Zo'].map(d => (
                      <div key={d} className="flex-1 text-center text-[9px] text-[#c8c3bc] font-medium">{d}</div>
                    ))}
                  </div>
                  {(() => {
                    const nu2 = new Date()
                    const weken2 = []
                    for (let w = 11; w >= 0; w--) {
                      const ma = new Date(nu2)
                      ma.setDate(nu2.getDate() - nu2.getDay() + 1 - w * 7)
                      const dagen = []
                      for (let d = 0; d < 7; d++) {
                        const dag = new Date(ma); dag.setDate(ma.getDate() + d)
                        const datum = dag.toISOString().split('T')[0]
                        const heeftCore = coreSessies.some(s => s.datum === datum)
                        const heeftFysio = fysioVoltooid.some(s => s.datum === datum)
                        const heeftKracht = krachtSessies.some(s => s.datum === datum)
                        dagen.push({ datum, heeftCore, heeftFysio, heeftKracht })
                      }
                      weken2.push(dagen)
                    }
                    return (
                      <div className="flex flex-col gap-1">
                        {weken2.map((dagen, wi) => (
                          <div key={wi} className="flex gap-1">
                            {dagen.map(({ datum, heeftCore, heeftFysio, heeftKracht }) => {
                              const bg = heeftCore ? '#06b6d4' : heeftFysio ? '#f59e0b' : heeftKracht ? '#8b5cf6' : '#f0ede8'
                              const actief = heeftCore || heeftFysio || heeftKracht
                              return (
                                <div key={datum} className="flex-1 aspect-square rounded-md"
                                  style={{ backgroundColor: bg, opacity: actief ? 0.8 : 1 }} />
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3">
                    {[
                      { kleur: '#06b6d4', label: 'Core' },
                      { kleur: '#f59e0b', label: 'Fysio' },
                      { kleur: '#8b5cf6', label: 'Kracht' },
                    ].map(l => (
                      <div key={l.label} className="flex items-center gap-1">
                        <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: l.kleur, opacity: 0.8 }} />
                        <span className="text-[10px] text-[#a09990]">{l.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
