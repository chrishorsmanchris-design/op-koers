'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { cn, formatDuur } from '@/lib/utils'
import {
  CheckCircle2, XCircle, MapPin, Timer, Sparkles,
  RefreshCw, Plus, ChevronRight, Dumbbell, MoveRight, X, Zap, Bell,
  ChevronDown, SquareCheckBig, CalendarDays,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Goal, PhysioExercise, TrainingSession, Profile, RecurringActivity } from '@/types/database'
import { FeedbackModal } from '@/components/training/FeedbackModal'
import { WorkoutModal } from '@/components/training/WorkoutModal'
import { RaceCountdownHero } from '@/components/training/RaceCountdownHero'
import { ConsistencyRing } from '@/components/training/ConsistencyRing'
import { WeerBadge } from '@/components/training/WeerBadge'

interface Props {
  profiel: Profile | null
  sessies: (TrainingSession & { session_feedback: unknown[] })[]
  alleSessies: { voltooid: boolean; overgeslagen: boolean; datum: string }[]
  fysioOefeningen: PhysioExercise[]
  fysioSessies: { id: string; datum: string; voltooid: boolean }[]
  doel: Goal | null
  vandaag: string
  weekStart: string
  activiteiten: RecurringActivity[]
}

// ── Kleur per trainingstype/intensiteit ───────────────────────────────────────
function trainingsGradient(sessie: TrainingSession | null): string {
  if (!sessie) return 'linear-gradient(to bottom, #2d2d3e, #2d2d3e)'
  if (sessie.type === 'core') return 'linear-gradient(to bottom, #0891b2, #06b6d4)'
  if (sessie.type === 'krachttraining' || sessie.type === 'cross')
    return 'linear-gradient(to bottom, #1d4ed8, #3b82f6)'
  switch (sessie.intensiteit) {
    case 'herstel':
    case 'makkelijk': return 'linear-gradient(to bottom, #4ade80, #ca8a04)'
    case 'interval':
    case 'zwaar':     return 'linear-gradient(to bottom, #f97316, #ef4444)'
    case 'gemiddeld': return 'linear-gradient(to bottom, #9333ea, #a855f7)'
    default:          return 'linear-gradient(to bottom, #4ade80, #ca8a04)'
  }
}

function trainingsHeroKleur(sessie: TrainingSession | null): { from: string; to: string } {
  if (!sessie) return { from: '#1b1b27', to: '#111118' }
  if (sessie.type === 'core') return { from: '#0891b2', to: '#0e7490' }
  if (sessie.type === 'krachttraining' || sessie.type === 'cross')
    return { from: '#1d4ed8', to: '#1e3a8a' }
  switch (sessie.intensiteit) {
    case 'herstel':
    case 'makkelijk': return { from: '#166534', to: '#14532d' }
    case 'interval':
    case 'zwaar':     return { from: '#c2410c', to: '#7c2d12' }
    case 'gemiddeld': return { from: '#7e22ce', to: '#581c87' }
    default:          return { from: '#166534', to: '#14532d' }
  }
}

function trainingsDotKleur(sessie: TrainingSession | null): string {
  if (!sessie) return 'transparent'
  if (sessie.type === 'core') return '#06b6d4'
  if (sessie.type === 'krachttraining' || sessie.type === 'cross') return '#3b82f6'
  switch (sessie.intensiteit) {
    case 'herstel':
    case 'makkelijk': return '#4ade80'
    case 'interval':
    case 'zwaar':     return '#f97316'
    case 'gemiddeld': return '#a855f7'
    default:          return '#4ade80'
  }
}

function trainingsTypeLabel(sessie: TrainingSession): string {
  if (sessie.type === 'core' && sessie.beschrijving?.toLowerCase().includes('fysio')) return 'Fysio'
  if (sessie.type === 'core') return 'Core stability'
  if (sessie.type === 'krachttraining') return 'Kracht'
  if (sessie.type === 'cross') return 'Cross'
  if (sessie.type === 'hardlopen') {
    switch (sessie.intensiteit) {
      case 'herstel': return 'Herstelloop'
      case 'makkelijk': return 'Rustige loop'
      case 'gemiddeld': return 'Tempoloop'
      case 'zwaar': return 'Lange loop'
      case 'interval': return 'Intervallen'
      default: return 'Hardlopen'
    }
  }
  return 'Rust'
}

const DAG_LABELS = ['MA', 'DI', 'WO', 'DO', 'VR', 'ZA', 'ZO']

function weekDagen(startDatum: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startDatum + 'T12:00:00')
    d.setDate(d.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

function isoWeeknummer(datum: string): number {
  const d = new Date(datum + 'T12:00:00')
  const dag = d.getDay() || 7
  d.setDate(d.getDate() + 4 - dag)
  const jaarStart = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - jaarStart.getTime()) / 86400000 + 1) / 7)
}

// ── Verplaatsen bottom sheet ───────────────────────────────────────────────────
function VerplaatsenSheet({
  sessie, alleSessies, onVerplaatsen, onSluiten,
}: {
  sessie: TrainingSession
  alleSessies: TrainingSession[]
  onVerplaatsen: (id: string, datum: string) => void
  onSluiten: () => void
}) {
  const bezet = new Set(
    alleSessies
      .filter(s => s.id !== sessie.id && s.type !== 'rust' && !s.overgeslagen)
      .map(s => s.datum)
  )
  const kandidaten: string[] = []
  const vandaag = new Date(); vandaag.setHours(0, 0, 0, 0)
  for (let i = 1; i <= 21; i++) {
    const d = new Date(vandaag); d.setDate(d.getDate() + i)
    const dow = d.getDay()
    if (dow === 2 || dow === 0) continue
    const datum = d.toISOString().split('T')[0]
    if (bezet.has(datum)) continue
    kandidaten.push(datum)
    if (kandidaten.length >= 6) break
  }
  const fmt = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60" onClick={onSluiten} />
      <div className="relative w-full bg-[#1b1b27] rounded-t-3xl shadow-2xl overflow-hidden border-t border-[#2d2d3e]">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-[#2d2d3e] rounded-full" />
        </div>
        <div className="px-5 pb-10">
          <div className="flex justify-between items-start mb-4 mt-1">
            <div>
              <h3 className="font-bold text-white">Verplaatsen</h3>
              <p className="text-sm text-[#8888a8] mt-0.5">{sessie.beschrijving}</p>
            </div>
            <button onClick={onSluiten} className="text-[#55556a] p-1"><X size={18} /></button>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#55556a] mb-2">Naar</p>
          {kandidaten.length === 0
            ? <p className="text-sm text-[#55556a] mb-4">Geen vrije dagen gevonden.</p>
            : (
              <div className="flex flex-col gap-2 mb-4">
                {kandidaten.map(datum => (
                  <button key={datum} onClick={() => onVerplaatsen(sessie.id, datum)}
                    className="flex items-center justify-between px-4 py-3 rounded-2xl bg-[#222230] border border-[#2d2d3e] text-sm font-medium text-white active:scale-[0.98] transition-transform capitalize">
                    <span>{fmt(datum)}</span>
                    <MoveRight size={15} className="text-[#55556a]" />
                  </button>
                ))}
              </div>
            )}
          <button onClick={onSluiten}
            className="w-full py-3 rounded-2xl text-sm font-medium text-[#8888a8] border border-[#2d2d3e]">
            Annuleren
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Run loggen bottom sheet ────────────────────────────────────────────────────
function RunLogSheet({
  vandaag, onOpgeslagen, onSluiten,
}: {
  vandaag: string
  onOpgeslagen: (sessie: TrainingSession) => void
  onSluiten: () => void
}) {
  const supabase = createClient()
  const [afstand, setAfstand] = useState('')
  const [duur, setDuur] = useState('')
  const [intensiteit, setIntensiteit] = useState<'herstel' | 'makkelijk' | 'gemiddeld' | 'zwaar' | 'interval'>('makkelijk')
  const [laden, setLaden] = useState(false)

  async function opslaan() {
    const km = parseFloat(afstand.replace(',', '.'))
    const min = parseInt(duur)
    if (!km || !min) return
    setLaden(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLaden(false); return }
    const { data } = await supabase.from('training_sessions').insert({
      user_id: user.id, datum: vandaag, type: 'hardlopen',
      beschrijving: `Spontane run — ${km} km`, duur_minuten: min,
      afstand_km: km, intensiteit, voltooid: true, overgeslagen: false,
      week_nummer: isoWeeknummer(vandaag), volgorde: 0,
    } as never).select('*, session_feedback(*)').single()
    if (data) onOpgeslagen(data as TrainingSession)
    setLaden(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60" onClick={onSluiten} />
      <div className="relative w-full bg-[#1b1b27] rounded-t-3xl shadow-2xl overflow-hidden border-t border-[#2d2d3e]">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-[#2d2d3e] rounded-full" />
        </div>
        <div className="px-5 pb-10">
          <div className="flex justify-between items-start mb-5 mt-1">
            <h3 className="font-bold text-white">🏃 Run loggen</h3>
            <button onClick={onSluiten} className="text-[#55556a] p-1"><X size={18} /></button>
          </div>
          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <label className="text-xs text-[#55556a] mb-1 block">Afstand (km)</label>
              <input type="number" inputMode="decimal" placeholder="8.5" value={afstand}
                onChange={e => setAfstand(e.target.value)}
                className="w-full border border-[#2d2d3e] bg-[#222230] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#f97316]" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-[#55556a] mb-1 block">Duur (min)</label>
              <input type="number" inputMode="numeric" placeholder="45" value={duur}
                onChange={e => setDuur(e.target.value)}
                className="w-full border border-[#2d2d3e] bg-[#222230] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#f97316]" />
            </div>
          </div>
          <div className="flex gap-1.5 mb-5">
            {([
              { v: 'herstel', l: 'Rustig' }, { v: 'makkelijk', l: 'Duurloop' },
              { v: 'gemiddeld', l: 'Tempo' }, { v: 'zwaar', l: 'Lang' }, { v: 'interval', l: 'Interval' },
            ] as const).map(opt => (
              <button key={opt.v} onClick={() => setIntensiteit(opt.v)}
                className={cn('flex-1 py-2 rounded-xl text-xs font-medium border transition-all',
                  intensiteit === opt.v ? 'bg-[#f97316] text-white border-[#f97316]' : 'bg-[#222230] text-[#8888a8] border-[#2d2d3e]'
                )}>
                {opt.l}
              </button>
            ))}
          </div>
          <button onClick={opslaan} disabled={!afstand || !duur || laden}
            className={cn('w-full py-3.5 rounded-2xl text-sm font-bold transition-all',
              afstand && duur && !laden ? 'bg-[#f97316] text-white' : 'bg-[#2d2d3e] text-[#55556a] cursor-not-allowed'
            )}>
            {laden ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Hoofdcomponent ─────────────────────────────────────────────────────────────
export function DashboardClient({
  profiel, sessies: initSessies, alleSessies, fysioOefeningen,
  fysioSessies, doel, vandaag, weekStart, activiteiten,
}: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [sessies, setSessies] = useState(initSessies)
  const [feedbackSessie, setFeedbackSessie] = useState<TrainingSession | null>(null)
  const [verplaatsenSessie, setVerplaatsenSessie] = useState<TrainingSession | null>(null)
  const [workoutSessie, setWorkoutSessie] = useState<TrainingSession | null>(null)
  const [toonRunLog, setToonRunLog] = useState(false)
  const [coachBericht, setCoachBericht] = useState<string | null>(null)
  const [coachLaden, setCoachLaden] = useState(false)
  const [stravaSync, setStravaSync] = useState<'idle' | 'bezig' | 'klaar'>('idle')
  const [planAangepast, setPlanAangepast] = useState<string | null>(null)
  const [spreekt, setSpreekt] = useState(false)
  const [geselecteerdeDag, setGeselecteerdeDag] = useState(vandaag)

  // Strava auto-sync
  useEffect(() => {
    const heeftStrava = !!(profiel as Record<string, unknown>)?.strava_refresh_token
    if (!heeftStrava) return
    const nu = Date.now()
    const laatste = parseInt(localStorage.getItem('strava-last-sync-ts') ?? '0', 10)
    if (nu - laatste < 30 * 60 * 1000) return
    fetch('/api/strava/sync', { method: 'POST' })
      .then(() => { localStorage.setItem('strava-last-sync-ts', String(nu)); router.refresh() })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Coach bericht
  useEffect(() => {
    const key = `coach-${vandaag}`
    const cached = sessionStorage.getItem(key)
    if (cached) { setCoachBericht(cached); return }
    setCoachLaden(true)
    fetch('/api/coach/bericht')
      .then(r => r.json())
      .then(d => { if (d.bericht) { setCoachBericht(d.bericht); sessionStorage.setItem(key, d.bericht) } })
      .finally(() => setCoachLaden(false))
  }, [vandaag])

  // ── Berekeningen ──────────────────────────────────────────────────────────────
  const dagen = weekDagen(weekStart)

  const geselecteerdeSessies = sessies.filter(s => s.datum === geselecteerdeDag && !s.overgeslagen && s.type !== 'core')
  const geselecteerdeSessie = geselecteerdeSessies.find(s => s.type !== 'rust') ?? null

  const coreSessieVandaag = sessies.find(s => s.datum === vandaag && s.type === 'core' && s.voltooid)
  const fysioSessieVandaag = fysioSessies.find(s => s.datum === vandaag && s.voltooid)
  const activiteitenVandaag = activiteiten.filter(a => {
    const dow = new Date(vandaag + 'T12:00:00').getDay()
    const idx = dow === 0 ? 6 : dow - 1
    return a.dag_van_week === idx
  })

  const dagenTotDoel = doel
    ? Math.ceil((new Date(doel.datum).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null

  const procentPlanVoltooid = useMemo(() => {
    if (alleSessies.length === 0) return 0
    const voltooid = alleSessies.filter(s => s.voltooid).length
    return (voltooid / alleSessies.length) * 100
  }, [alleSessies])

  // Week voortgang voor header label "Week X/Y"
  const planWeekNummer = doel && geselecteerdeSessie?.week_nummer
    ? geselecteerdeSessie.week_nummer
    : (sessies.find(s => s.datum === vandaag)?.week_nummer ?? null)

  const totaalWeken = 16 // standaard marathon plan

  const weekVoortgang = useMemo(() => {
    const weekSessies = sessies.filter(s =>
      s.datum >= weekStart &&
      s.datum <= dagen[6] &&
      s.type !== 'rust' &&
      s.type !== 'core'
    )
    const voltooid = weekSessies.filter(s => s.voltooid).length
    const totaalKm = weekSessies.reduce((sum, s) => sum + (s.afstand_km ?? 0), 0)
    const voltooideKm = weekSessies.filter(s => s.voltooid).reduce((sum, s) => sum + (s.afstand_km ?? 0), 0)
    return { totaal: weekSessies.length, voltooid, totaalKm, voltooideKm }
  }, [sessies, weekStart, dagen])

  const aantalGemistDezeWeek = useMemo(() => {
    return sessies.filter(s =>
      s.datum >= weekStart && s.datum < vandaag &&
      s.type !== 'rust' && !s.voltooid && !s.overgeslagen
    ).length
  }, [sessies, weekStart, vandaag])

  async function sessieVerwijderen(id: string) {
    setSessies(prev => prev.filter(s => s.id !== id))
    await supabase.from('training_sessions').delete().eq('id', id)
  }

  async function sessieAfgerond(id: string) {
    const sessie = sessies.find(s => s.id === id)
    await supabase.from('training_sessions').update({ voltooid: true } as never).eq('id', id)
    setSessies(prev => prev.map(s => s.id === id ? { ...s, voltooid: true } : s))
    if (sessie) setFeedbackSessie(sessie)
  }

  async function sessieOvergeslagen(id: string) {
    await supabase.from('training_sessions').update({ overgeslagen: true } as never).eq('id', id)
    setSessies(prev => prev.map(s => s.id === id ? { ...s, overgeslagen: true } : s))
    const res = await fetch('/api/training/aanpassen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessie_id: id, rating: 'overgeslagen' }),
    })
    const data = await res.json()
    if (data.aangepast && data.uitleg) {
      setPlanAangepast(data.uitleg)
      setTimeout(() => setPlanAangepast(null), 5000)
    }
  }

  async function sessieVerplaatsen(id: string, nieuwDatum: string) {
    const maandag = new Date(nieuwDatum + 'T12:00:00')
    const dow = maandag.getDay()
    maandag.setDate(maandag.getDate() - (dow === 0 ? 6 : dow - 1))
    const zondag = new Date(maandag); zondag.setDate(zondag.getDate() + 6)
    const weekNr = sessies.find(s =>
      s.datum >= maandag.toISOString().split('T')[0] &&
      s.datum <= zondag.toISOString().split('T')[0]
    )?.week_nummer ?? isoWeeknummer(nieuwDatum)

    await supabase.from('training_sessions')
      .update({ datum: nieuwDatum, week_nummer: weekNr } as never).eq('id', id)
    setSessies(prev => prev.map(s => s.id === id ? { ...s, datum: nieuwDatum, week_nummer: weekNr } : s))
    setVerplaatsenSessie(null)
  }

  async function syncStrava() {
    setStravaSync('bezig')
    try {
      await fetch('/api/strava/sync', { method: 'POST' })
      setStravaSync('klaar')
      setTimeout(() => { setStravaSync('idle'); window.location.reload() }, 1500)
    } catch { setStravaSync('idle') }
  }

  function handleFeedbackGesloten(aangepast?: string) {
    setFeedbackSessie(null)
    if (aangepast) {
      setPlanAangepast(aangepast)
      setTimeout(() => setPlanAangepast(null), 5000)
    }
  }

  const naam = profiel?.naam?.split(' ')[0] ?? 'atleet'
  const heeftStrava = !!(profiel as Record<string, unknown>)?.strava_refresh_token
  const heroKleur = trainingsHeroKleur(geselecteerdeSessie)
  const gradient = trainingsGradient(geselecteerdeSessie)

  const isRaceWeek = dagenTotDoel !== null && dagenTotDoel >= 1 && dagenTotDoel <= 7
  const isTapering = dagenTotDoel !== null && dagenTotDoel >= 8 && dagenTotDoel <= 14
  const isRaceDay = dagenTotDoel === 0

  return (
    <div className="flex flex-col min-h-screen bg-[#111118]">

      {/* ── Top header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        {/* Avatar + naam */}
        <button className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-[#f97316] flex items-center justify-center shrink-0">
            <span className="text-white text-sm font-bold">{naam.charAt(0).toUpperCase()}</span>
          </div>
        </button>

        {/* Week indicator */}
        <button className="flex items-center gap-1.5">
          <span className="text-white font-semibold text-base">
            {planWeekNummer ? `Week ${planWeekNummer}/${totaalWeken}` : 'Overzicht'}
          </span>
          <ChevronDown size={16} className="text-[#8888a8]" />
        </button>

        {/* Acties */}
        <div className="flex items-center gap-2">
          <button onClick={() => setToonRunLog(true)}
            className="w-8 h-8 rounded-xl bg-[#1b1b27] border border-[#2d2d3e] flex items-center justify-center text-[#8888a8]">
            <Plus size={15} />
          </button>
          {heeftStrava && (
            <button onClick={syncStrava} disabled={stravaSync !== 'idle'}
              className="w-8 h-8 rounded-xl bg-[#1b1b27] border border-[#2d2d3e] flex items-center justify-center text-[#8888a8]">
              <RefreshCw size={14} className={stravaSync === 'bezig' ? 'animate-spin' : ''} />
            </button>
          )}
          <button className="w-8 h-8 rounded-xl bg-[#1b1b27] border border-[#2d2d3e] flex items-center justify-center text-[#8888a8]">
            <Bell size={15} />
          </button>
        </div>
      </div>

      {/* ── Week strip ──────────────────────────────────────────────────────── */}
      <div className="px-4 pb-3">
        <div className="flex justify-between">
          {dagen.map((datum, i) => {
            const sessie = sessies.find(s =>
              s.datum === datum && s.type !== 'rust' && s.type !== 'core' && !s.overgeslagen
            )
            const isVandaag = datum === vandaag
            const isGeselecteerd = datum === geselecteerdeDag
            const isGedaan = sessie?.voltooid
            const dotKleur = trainingsDotKleur(sessie ?? null)
            const dagNr = new Date(datum + 'T12:00:00').getDate()

            return (
              <button
                key={i}
                onClick={() => setGeselecteerdeDag(datum)}
                className="flex flex-col items-center gap-1.5 py-1"
              >
                <span className={cn(
                  'text-[10px] font-semibold tracking-wider',
                  isGeselecteerd ? 'text-white' : 'text-[#55556a]'
                )}>
                  {DAG_LABELS[i]}
                </span>
                <div className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center transition-all',
                  isGeselecteerd && isVandaag
                    ? 'bg-white'
                    : isGeselecteerd
                      ? 'bg-[#2d2d3e]'
                      : isVandaag
                        ? 'ring-1 ring-[#f97316]'
                        : ''
                )}>
                  <span className={cn(
                    'text-sm font-semibold',
                    isGeselecteerd && isVandaag ? 'text-black'
                    : isGeselecteerd ? 'text-white'
                    : isVandaag ? 'text-[#f97316]'
                    : 'text-[#8888a8]'
                  )}>
                    {dagNr}
                  </span>
                </div>
                {/* Gekleurde dot voor trainingstype */}
                <div className={cn(
                  'w-1.5 h-1.5 rounded-sm',
                  sessie ? '' : 'opacity-0'
                )}
                  style={{
                    backgroundColor: isGedaan ? '#22c55e' : dotKleur,
                  }}
                />
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Meldingen ───────────────────────────────────────────────────────── */}
      {planAangepast && (
        <div className="mx-4 mb-3 flex items-start gap-3 bg-green-950 border border-green-800 rounded-2xl p-3">
          <Zap size={16} className="text-green-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-green-400">Plan bijgesteld</p>
            <p className="text-xs text-green-500 mt-0.5">{planAangepast}</p>
          </div>
        </div>
      )}

      {aantalGemistDezeWeek >= 2 && (
        <div className="mx-4 mb-3 flex items-start gap-3 bg-amber-950 border border-amber-800 rounded-2xl p-3">
          <span className="text-base shrink-0">⚠️</span>
          <div className="flex-1">
            <p className="text-xs font-bold text-amber-400">{aantalGemistDezeWeek} trainingen gemist deze week</p>
            <button onClick={() => router.push('/schema')}
              className="text-xs text-amber-500 underline underline-offset-2 mt-0.5">
              Bekijk schema →
            </button>
          </div>
        </div>
      )}

      {/* ── Race countdown hero ──────────────────────────────────────────────── */}
      {isRaceDay && doel && (
        <div className="mx-4 mb-3 rounded-2xl bg-gradient-to-br from-[#f97316] to-[#ea6c0a] p-4 text-white text-center">
          <p className="text-3xl mb-1">🎉</p>
          <p className="text-lg font-bold">Vandaag is het zover!</p>
          <p className="font-semibold text-white/90">{doel.naam}</p>
        </div>
      )}
      {!isRaceDay && doel && dagenTotDoel !== null && dagenTotDoel > 0 && (
        <div className="mx-4 mb-3">
          <RaceCountdownHero
            naam={doel.naam}
            tijdsdoel={doel.tijdsdoel}
            dagenTotDoel={dagenTotDoel}
            procentVoltooid={procentPlanVoltooid}
            onClick={() => router.push('/doel')}
          />
          {isTapering && (
            <p className="mt-2 text-xs font-semibold text-blue-400">⚡ Tapering — bouw het volume nu af</p>
          )}
        </div>
      )}

      {/* ── Trainingen sectie ────────────────────────────────────────────────── */}
      <div className="px-4 mb-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Trainingen</h2>
          <div className="flex items-center gap-1.5 text-[#8888a8] text-xs">
            <CalendarDays size={13} />
            <span>
              {new Date(geselecteerdeDag + 'T12:00:00').toLocaleDateString('nl-NL', {
                weekday: 'long', day: 'numeric', month: 'long'
              }).toLowerCase()}
            </span>
          </div>
        </div>
      </div>

      {/* ── Hoofdtraining kaart ──────────────────────────────────────────────── */}
      <div className="px-4 mb-3">
        {geselecteerdeSessie ? (
          <div
            className={cn(
              'rounded-2xl bg-[#1b1b27] border border-[#2d2d3e] overflow-hidden',
              geselecteerdeSessie.voltooid && 'opacity-70'
            )}
          >
            <div className="flex">
              {/* Gekleurde linker border-gradient */}
              <div className="w-1.5 shrink-0 rounded-l-2xl" style={{ background: gradient }} />

              {/* Kaart inhoud */}
              <div className="flex-1 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={cn('flex-1 min-w-0', geselecteerdeSessie.type === 'hardlopen' && 'cursor-pointer')}
                    onClick={() => geselecteerdeSessie.type === 'hardlopen' && setWorkoutSessie(geselecteerdeSessie)}
                  >
                    <p className="font-bold text-white text-base leading-snug">
                      {geselecteerdeSessie.beschrijving}
                    </p>
                    <p className="text-xs text-[#8888a8] mt-0.5">
                      {new Date(geselecteerdeSessie.datum + 'T12:00:00').toLocaleDateString('nl-NL', {
                        weekday: 'long', day: 'numeric', month: 'short'
                      })}
                      {geselecteerdeSessie.duur_minuten != null &&
                        ` · ${geselecteerdeSessie.duur_minuten}m`}
                    </p>
                    <p className="text-xs text-[#8888a8] mt-0.5">
                      {trainingsTypeLabel(geselecteerdeSessie)}
                      {geselecteerdeSessie.afstand_km != null && geselecteerdeSessie.afstand_km > 0
                        ? ` · ${geselecteerdeSessie.afstand_km}km` : ''}
                    </p>
                  </div>

                  {/* Checkbox / status */}
                  <div className="shrink-0 mt-0.5">
                    {geselecteerdeSessie.voltooid ? (
                      <CheckCircle2 size={22} className="text-green-400" />
                    ) : geselecteerdeSessie.overgeslagen ? (
                      <XCircle size={22} className="text-[#55556a]" />
                    ) : (
                      <button
                        onClick={() => sessieAfgerond(geselecteerdeSessie.id)}
                        className="w-6 h-6 rounded-md border-2 border-[#3d3d50] hover:border-[#f97316] transition-colors"
                      />
                    )}
                  </div>
                </div>

                {/* Stats */}
                {(geselecteerdeSessie.duur_minuten != null || (geselecteerdeSessie.afstand_km ?? 0) > 0) && (
                  <div className="flex gap-2 mt-3">
                    {geselecteerdeSessie.duur_minuten != null && (
                      <div className="flex items-center gap-1.5 bg-[#222230] rounded-xl px-2.5 py-1.5">
                        <Timer size={12} className="text-[#f97316]" />
                        <span className="text-xs font-semibold text-white">{formatDuur(geselecteerdeSessie.duur_minuten)}</span>
                      </div>
                    )}
                    {(geselecteerdeSessie.afstand_km ?? 0) > 0 && (
                      <div className="flex items-center gap-1.5 bg-[#222230] rounded-xl px-2.5 py-1.5">
                        <MapPin size={12} className="text-[#f97316]" />
                        <span className="text-xs font-semibold text-white">{geselecteerdeSessie.afstand_km} km</span>
                      </div>
                    )}
                    {geselecteerdeDag === vandaag && !geselecteerdeSessie.voltooid && <WeerBadge />}
                  </div>
                )}
              </div>
            </div>

            {/* Actieknoppen */}
            {!geselecteerdeSessie.voltooid && !geselecteerdeSessie.overgeslagen && (
              <div className="flex border-t border-[#2d2d3e]">
                <button
                  onClick={() => sessieAfgerond(geselecteerdeSessie.id)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold text-[#f97316] active:bg-[#222230] transition-colors">
                  <SquareCheckBig size={15} /> Afgerond
                </button>
                <div className="w-px bg-[#2d2d3e]" />
                <button
                  onClick={() => setVerplaatsenSessie(geselecteerdeSessie)}
                  className="flex-1 flex items-center justify-center py-3 text-sm font-medium text-[#8888a8] active:bg-[#222230] transition-colors">
                  Verplaatsen
                </button>
                <div className="w-px bg-[#2d2d3e]" />
                <button
                  onClick={() => sessieOvergeslagen(geselecteerdeSessie.id)}
                  className="flex-1 flex items-center justify-center py-3 text-sm font-medium text-[#55556a] active:bg-[#222230] transition-colors">
                  Sla over
                </button>
              </div>
            )}
            {(geselecteerdeSessie.voltooid || geselecteerdeSessie.overgeslagen) && (
              <div className="flex border-t border-[#2d2d3e]">
                <button onClick={() => sessieVerwijderen(geselecteerdeSessie.id)}
                  className="flex-1 text-center text-xs text-red-500 py-3 active:bg-[#222230] transition-colors">
                  Verwijderen
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-[#1b1b27] border border-[#2d2d3e] p-4 flex items-center gap-3">
            <span className="text-2xl">😴</span>
            <div>
              <p className="font-semibold text-white">Rustdag</p>
              <p className="text-sm text-[#55556a]">Geen training gepland</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Vaste activiteiten ───────────────────────────────────────────────── */}
      {activiteitenVandaag.map(a => (
        <div key={a.id} className="mx-4 mb-3 flex items-center gap-3 bg-[#1b1b27] border border-[#2d2d3e] rounded-2xl px-4 py-3">
          <span className="text-xl">🏑</span>
          <div>
            <p className="text-sm font-semibold text-white">{a.naam}</p>
            <p className="text-xs text-[#55556a]">{a.tijdstip ? a.tijdstip.charAt(0).toUpperCase() + a.tijdstip.slice(1) : 'Vaste activiteit'}</p>
          </div>
        </div>
      ))}

      {/* ── Week overzicht kaart ─────────────────────────────────────────────── */}
      <div className="px-4 mb-3">
        <button
          onClick={() => router.push('/schema')}
          className="w-full bg-[#1b1b27] border border-[#2d2d3e] rounded-2xl p-4 text-left"
        >
          <div className="flex items-center gap-3">
            <ConsistencyRing voltooid={weekVoortgang.voltooid} totaal={Math.max(weekVoortgang.totaal, 0)} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-white">
                  Overzicht van week {planWeekNummer ?? '—'}
                </span>
                <ChevronRight size={16} className="text-[#55556a] shrink-0" />
              </div>
              {/* Voortgangsbalk met segmenten */}
              <div className="flex gap-1 mb-2.5">
                {Array.from({ length: Math.max(weekVoortgang.totaal, 1) }).map((_, i) => (
                  <div
                    key={i}
                    className={cn('flex-1 h-1 rounded-full transition-all', i < weekVoortgang.voltooid ? 'bg-[#f97316]' : 'bg-[#2d2d3e]')}
                  />
                ))}
              </div>
              <div className="flex justify-between text-xs text-[#8888a8]">
                <span>Trainingen: <span className="font-bold text-white">{weekVoortgang.voltooid}/{weekVoortgang.totaal}</span></span>
                {weekVoortgang.totaalKm > 0 && (
                  <span>Afstand: <span className="font-bold text-white">{Math.round(weekVoortgang.voltooideKm * 10) / 10}/{Math.round(weekVoortgang.totaalKm * 10) / 10}KM</span></span>
                )}
              </div>
            </div>
          </div>
        </button>
      </div>

      {/* ── Vandaag ook: Core & Fysio ────────────────────────────────────────── */}
      {(profiel?.wil_core || fysioOefeningen.length > 0) && (
        <div className="mx-4 mb-3 bg-[#1b1b27] border border-[#2d2d3e] rounded-2xl overflow-hidden">
          <div className="divide-y divide-[#2d2d3e]">
            {profiel?.wil_core && (
              <div className="flex items-center gap-3 px-4 py-3">
                <div className={cn(
                  'w-9 h-9 rounded-2xl flex items-center justify-center text-base shrink-0',
                  coreSessieVandaag ? 'bg-green-900' : 'bg-[#0891b2]/15'
                )}>🧘</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">Core stability</p>
                  <p className="text-xs text-[#55556a]">
                    {coreSessieVandaag ? 'Afgerond vandaag ✓' : '~25 min · kracht & stabiliteit'}
                  </p>
                </div>
                {coreSessieVandaag ? (
                  <CheckCircle2 size={18} className="text-green-400 shrink-0" />
                ) : (
                  <button onClick={() => router.push('/core/sessie')}
                    className="shrink-0 px-3 py-1.5 rounded-xl bg-[#0891b2]/15 text-[#06b6d4] text-xs font-bold">
                    Start
                  </button>
                )}
              </div>
            )}
            {fysioOefeningen.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-3">
                <div className={cn(
                  'w-9 h-9 rounded-2xl flex items-center justify-center shrink-0',
                  fysioSessieVandaag ? 'bg-green-900' : 'bg-[#f97316]/10'
                )}>
                  <Dumbbell size={16} className={fysioSessieVandaag ? 'text-green-400' : 'text-[#f97316]'} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">Fysiotherapie</p>
                  <p className="text-xs text-[#55556a]">
                    {fysioSessieVandaag ? 'Afgerond vandaag ✓'
                      : `${fysioOefeningen.length} oefening${fysioOefeningen.length !== 1 ? 'en' : ''} · blessurepreventie`}
                  </p>
                </div>
                {fysioSessieVandaag ? (
                  <CheckCircle2 size={18} className="text-green-400 shrink-0" />
                ) : (
                  <button onClick={() => router.push('/fysio/sessie')}
                    className="shrink-0 px-3 py-1.5 rounded-xl bg-[#f97316]/10 text-[#f97316] text-xs font-bold">
                    Start
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Coach bericht ────────────────────────────────────────────────────── */}
      {(coachBericht || coachLaden) && (
        <div className="mx-4 mb-6 bg-[#1b1b27] border border-[#2d2d3e] rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-[#f97316]/15 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles size={14} className="text-[#f97316]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-[#f97316] uppercase tracking-wide mb-1">Jouw coach</p>
              {coachLaden ? (
                <div className="flex gap-1 pt-1">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-1.5 h-1.5 bg-[#2d2d3e] rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 150}ms` }} />
                  ))}
                </div>
              ) : (
                <>
                  <p className="text-sm text-[#8888a8] leading-relaxed">{coachBericht}</p>
                  <button
                    onClick={() => {
                      if (!coachBericht) return
                      if (spreekt) {
                        window.speechSynthesis.cancel()
                        setSpreekt(false)
                        return
                      }
                      const utt = new SpeechSynthesisUtterance(coachBericht)
                      utt.lang = 'nl-NL'
                      utt.rate = 0.95
                      utt.onend = () => setSpreekt(false)
                      utt.onerror = () => setSpreekt(false)
                      setSpreekt(true)
                      window.speechSynthesis.speak(utt)
                    }}
                    className="mt-2 flex items-center gap-1.5 text-xs font-medium text-[#f97316]"
                  >
                    {spreekt ? '⏹ Stop' : '🎙️ Luister'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Overlays ──────────────────────────────────────────────────────────── */}
      {feedbackSessie && (
        <FeedbackModal sessie={feedbackSessie} onSluit={handleFeedbackGesloten} />
      )}
      {workoutSessie && (
        <WorkoutModal
          beschrijving={workoutSessie.beschrijving}
          duur_minuten={workoutSessie.duur_minuten}
          afstand_km={workoutSessie.afstand_km}
          intensiteit={workoutSessie.intensiteit}
          onSluiten={() => setWorkoutSessie(null)}
        />
      )}
      {verplaatsenSessie && (
        <VerplaatsenSheet
          sessie={verplaatsenSessie}
          alleSessies={sessies}
          onVerplaatsen={sessieVerplaatsen}
          onSluiten={() => setVerplaatsenSessie(null)}
        />
      )}
      {toonRunLog && (
        <RunLogSheet
          vandaag={vandaag}
          onOpgeslagen={sessie => {
            setSessies(prev => [...prev, sessie as typeof sessies[0]])
            setToonRunLog(false)
          }}
          onSluiten={() => setToonRunLog(false)}
        />
      )}
    </div>
  )
}
