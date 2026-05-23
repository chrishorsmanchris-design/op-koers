'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { cn, formatDuur } from '@/lib/utils'
import {
  CheckCircle2, XCircle, MapPin, Timer, Sparkles,
  RefreshCw, Plus, ChevronRight, Dumbbell, MoveRight, X, Zap, Settings,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Goal, PhysioExercise, TrainingSession, Profile, RecurringActivity } from '@/types/database'
import { FeedbackModal } from '@/components/training/FeedbackModal'

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

// ── Kleuren consistent met SchemaClient ────────────────────────────────────────
const INTENSITEIT_KLEUR: Record<string, { bar: string; badge: string }> = {
  herstel:   { bar: '#93c5fd', badge: 'bg-blue-50 text-blue-700' },
  makkelijk: { bar: '#4ade80', badge: 'bg-green-50 text-green-700' },
  gemiddeld: { bar: '#fbbf24', badge: 'bg-amber-50 text-amber-800' },
  zwaar:     { bar: '#f97316', badge: 'bg-orange-50 text-orange-700' },
  interval:  { bar: '#f43f5e', badge: 'bg-rose-50 text-rose-700' },
}

const TYPE_EMOJI: Record<string, string> = {
  hardlopen: '🏃', rust: '😴', krachttraining: '💪', cross: '🚴', core: '🧘',
}

const DAG_LABELS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

function weekDagen(startDatum: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startDatum + 'T12:00:00')
    d.setDate(d.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

function datumToDagIndex(datum: string): number {
  const dow = new Date(datum + 'T12:00:00').getDay()
  return dow === 0 ? 6 : dow - 1
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
    if (dow === 2 || dow === 0) continue // hockey
    const datum = d.toISOString().split('T')[0]
    if (bezet.has(datum)) continue
    kandidaten.push(datum)
    if (kandidaten.length >= 6) break
  }
  const fmt = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/40" onClick={onSluiten} />
      <div className="relative w-full bg-white rounded-t-3xl shadow-2xl overflow-hidden">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-[#e8e3dc] rounded-full" />
        </div>
        <div className="px-5 pb-10">
          <div className="flex justify-between items-start mb-4 mt-1">
            <div>
              <h3 className="font-bold text-[#1a1612]">Verplaatsen</h3>
              <p className="text-sm text-[#6b6560] mt-0.5">{sessie.beschrijving}</p>
            </div>
            <button onClick={onSluiten} className="text-[#a09990] p-1"><X size={18} /></button>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#a09990] mb-2">Naar</p>
          {kandidaten.length === 0
            ? <p className="text-sm text-[#a09990] mb-4">Geen vrije dagen gevonden.</p>
            : (
              <div className="flex flex-col gap-2 mb-4">
                {kandidaten.map(datum => (
                  <button key={datum} onClick={() => onVerplaatsen(sessie.id, datum)}
                    className="flex items-center justify-between px-4 py-3 rounded-2xl bg-[#f5f3f0] border border-[#e8e3dc] text-sm font-medium text-[#1a1612] active:scale-[0.98] transition-transform capitalize">
                    <span>{fmt(datum)}</span>
                    <MoveRight size={15} className="text-[#a09990]" />
                  </button>
                ))}
              </div>
            )}
          <button onClick={onSluiten}
            className="w-full py-3 rounded-2xl text-sm font-medium text-[#a09990] border border-[#e8e3dc]">
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
      <div className="absolute inset-0 bg-black/40" onClick={onSluiten} />
      <div className="relative w-full bg-white rounded-t-3xl shadow-2xl overflow-hidden">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-[#e8e3dc] rounded-full" />
        </div>
        <div className="px-5 pb-10">
          <div className="flex justify-between items-start mb-5 mt-1">
            <h3 className="font-bold text-[#1a1612]">🏃 Run loggen</h3>
            <button onClick={onSluiten} className="text-[#a09990] p-1"><X size={18} /></button>
          </div>
          <div className="flex gap-3 mb-4">
            <div className="flex-1">
              <label className="text-xs text-[#a09990] mb-1 block">Afstand (km)</label>
              <input type="number" inputMode="decimal" placeholder="8.5" value={afstand}
                onChange={e => setAfstand(e.target.value)}
                className="w-full border border-[#e8e3dc] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#f97316]" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-[#a09990] mb-1 block">Duur (min)</label>
              <input type="number" inputMode="numeric" placeholder="45" value={duur}
                onChange={e => setDuur(e.target.value)}
                className="w-full border border-[#e8e3dc] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#f97316]" />
            </div>
          </div>
          <div className="flex gap-1.5 mb-5">
            {([
              { v: 'herstel', l: 'Rustig' }, { v: 'makkelijk', l: 'Duurloop' },
              { v: 'gemiddeld', l: 'Tempo' }, { v: 'zwaar', l: 'Lang' }, { v: 'interval', l: 'Interval' },
            ] as const).map(opt => (
              <button key={opt.v} onClick={() => setIntensiteit(opt.v)}
                className={cn('flex-1 py-2 rounded-xl text-xs font-medium border transition-all',
                  intensiteit === opt.v ? 'bg-[#f97316] text-white border-[#f97316]' : 'bg-[#f5f3f0] text-[#6b6560] border-[#e8e3dc]'
                )}>
                {opt.l}
              </button>
            ))}
          </div>
          <button onClick={opslaan} disabled={!afstand || !duur || laden}
            className={cn('w-full py-3.5 rounded-2xl text-sm font-bold transition-all',
              afstand && duur && !laden ? 'bg-[#f97316] text-white' : 'bg-[#e8e3dc] text-[#a09990] cursor-not-allowed'
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
  const [toonRunLog, setToonRunLog] = useState(false)
  const [coachBericht, setCoachBericht] = useState<string | null>(null)
  const [coachLaden, setCoachLaden] = useState(false)
  const [stravaSync, setStravaSync] = useState<'idle' | 'bezig' | 'klaar'>('idle')
  const [planAangepast, setPlanAangepast] = useState<string | null>(null)

  // Strava auto-sync — elke 30 minuten
  useEffect(() => {
    const heeftStrava = !!(profiel as Record<string, unknown>)?.strava_refresh_token
    if (!heeftStrava) return
    const nu = Date.now()
    const laatste = parseInt(localStorage.getItem('strava-last-sync-ts') ?? '0', 10)
    if (nu - laatste < 30 * 60 * 1000) return // 30 minuten wachten
    fetch('/api/strava/sync', { method: 'POST' })
      .then(() => { localStorage.setItem('strava-last-sync-ts', String(nu)); router.refresh() })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Coach bericht (gecached per dag)
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

  const vandaagSessies = sessies.filter(s => s.datum === vandaag && !s.overgeslagen && s.type !== 'core')
  const vandaagSessie = vandaagSessies.find(s => s.type !== 'rust') ?? null

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

  const planVoortgang = useMemo(() => {
    if (!alleSessies.length) return null
    const voltooid = alleSessies.filter(s => s.voltooid).length
    const totaal = alleSessies.filter(s => !s.overgeslagen).length || alleSessies.length
    return { voltooid, totaal, pct: Math.round((voltooid / totaal) * 100) }
  }, [alleSessies])

  // Gemiste trainingen check voor alert
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

  // ── Acties ────────────────────────────────────────────────────────────────────
  async function sessieAfgerond(id: string) {
    const sessie = sessies.find(s => s.id === id)
    await supabase.from('training_sessions').update({ voltooid: true } as never).eq('id', id)
    setSessies(prev => prev.map(s => s.id === id ? { ...s, voltooid: true } : s))
    if (sessie) setFeedbackSessie(sessie)
  }

  async function sessieOvergeslagen(id: string) {
    await supabase.from('training_sessions').update({ overgeslagen: true } as never).eq('id', id)
    setSessies(prev => prev.map(s => s.id === id ? { ...s, overgeslagen: true } : s))
    // Plan aanpassen op basis van gemiste training
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

  // ── Render ────────────────────────────────────────────────────────────────────
  const naam = profiel?.naam?.split(' ')[0] ?? 'atleet'
  const uur = new Date().getHours()
  const begroeting = uur < 12 ? 'Goedemorgen' : uur < 18 ? 'Goedemiddag' : 'Goedenavond'
  const datumLabel = new Date(vandaag + 'T12:00:00').toLocaleDateString('nl-NL', {
    weekday: 'long', day: 'numeric', month: 'long',
  })

  const kleur = INTENSITEIT_KLEUR[vandaagSessie?.intensiteit ?? 'makkelijk'] ?? INTENSITEIT_KLEUR.makkelijk
  const heeftStrava = !!(profiel as Record<string, unknown>)?.strava_refresh_token

  // Race week / tapering
  const isRaceWeek = dagenTotDoel !== null && dagenTotDoel >= 1 && dagenTotDoel <= 7
  const isTapering = dagenTotDoel !== null && dagenTotDoel >= 8 && dagenTotDoel <= 14
  const isRaceDay = dagenTotDoel === 0

  return (
    <div className="flex flex-col gap-4 p-4 pt-8 pb-24">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-[#a09990] capitalize">{datumLabel}</p>
          <h1 className="text-2xl font-bold text-[#1a1612]">{begroeting}, {naam} 👋</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setToonRunLog(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-[#e8e3dc] text-[#a09990] hover:border-[#f97316] hover:text-[#f97316] transition-colors"
            title="Run loggen">
            <Plus size={16} />
          </button>
          {heeftStrava && (
            <button onClick={syncStrava} disabled={stravaSync !== 'idle'}
              className={cn('w-9 h-9 flex items-center justify-center rounded-xl border transition-colors',
                stravaSync === 'klaar' ? 'bg-green-50 border-green-200 text-green-600'
                : 'bg-white border-[#e8e3dc] text-[#a09990] hover:border-[#f97316] hover:text-[#f97316]'
              )} title="Sync Strava">
              <RefreshCw size={15} className={stravaSync === 'bezig' ? 'animate-spin' : ''} />
            </button>
          )}
          <button onClick={() => router.push('/instellingen')}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-[#e8e3dc] text-[#a09990] hover:border-[#f97316] hover:text-[#f97316] transition-colors"
            title="Instellingen">
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* ── Plan aangepast melding ───────────────────────────────────────────── */}
      {planAangepast && (
        <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-2xl p-3">
          <Zap size={16} className="text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-green-700">Plan bijgesteld</p>
            <p className="text-xs text-green-600 mt-0.5">{planAangepast}</p>
          </div>
        </div>
      )}

      {/* ── Alert: veel trainingen gemist ───────────────────────────────────── */}
      {aantalGemistDezeWeek >= 2 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-3">
          <span className="text-lg shrink-0">⚠️</span>
          <div className="flex-1">
            <p className="text-xs font-bold text-amber-800">{aantalGemistDezeWeek} trainingen gemist deze week</p>
            <button onClick={() => router.push('/schema')}
              className="text-xs text-amber-700 underline underline-offset-2 mt-0.5">
              Bekijk schema →
            </button>
          </div>
        </div>
      )}

      {/* ── Race / tapering kaart ────────────────────────────────────────────── */}
      {isRaceDay && doel && (
        <div className="rounded-3xl bg-gradient-to-br from-[#f97316] to-[#ea6c0a] p-5 text-white text-center shadow-md">
          <p className="text-4xl mb-2">🎉</p>
          <p className="text-xl font-bold">Vandaag is het zover!</p>
          <p className="font-semibold mt-1 text-white/90">{doel.naam}</p>
          {doel.tijdsdoel && <p className="text-sm text-white/70 mt-2">Tijdsdoel: <span className="text-white font-bold">{doel.tijdsdoel}</span></p>}
        </div>
      )}

      {isRaceWeek && !isRaceDay && doel && (
        <div className="rounded-3xl bg-gradient-to-br from-[#f97316] to-[#ea6c0a] p-4 text-white shadow-md">
          <p className="text-xs font-bold text-white/70 uppercase tracking-wide mb-1">🏁 Race week</p>
          <p className="font-bold">Nog {dagenTotDoel} {dagenTotDoel === 1 ? 'dag' : 'dagen'} — {doel.naam}</p>
          {doel.tijdsdoel && <p className="text-sm text-white/80 mt-1">Tijdsdoel: <span className="text-white font-semibold">{doel.tijdsdoel}</span></p>}
        </div>
      )}

      {isTapering && !isRaceWeek && (
        <div className="rounded-3xl bg-gradient-to-br from-blue-500 to-blue-600 p-4 text-white shadow-md">
          <p className="text-xs font-bold text-white/70 uppercase tracking-wide mb-1">⚡ Tapering</p>
          <p className="font-bold">Nog {dagenTotDoel} dagen — bouw volume af</p>
          <p className="text-sm text-white/80 mt-1">Behoud intensiteit, minder km.</p>
        </div>
      )}

      {/* ── Vandaag: hoofdtraining ───────────────────────────────────────────── */}
      {vandaagSessie ? (
        <div className={cn(
          'rounded-3xl bg-white border border-[#f0ede8] overflow-hidden shadow-sm',
          vandaagSessie.voltooid && 'opacity-60',
        )}>
          {/* Intensiteitsbar (Ren-stijl) */}
          <div className="h-2 w-full" style={{ backgroundColor: kleur.bar }} />

          <div className="p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#a09990] mb-2">Vandaag</p>

            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex-1">
                <p className="text-lg font-bold text-[#1a1612] leading-tight">
                  {TYPE_EMOJI[vandaagSessie.type]} {vandaagSessie.beschrijving}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {vandaagSessie.intensiteit && (
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold', kleur.badge)}>
                    {vandaagSessie.intensiteit}
                  </span>
                )}
                {vandaagSessie.voltooid && <CheckCircle2 size={16} className="text-green-500" />}
                {vandaagSessie.overgeslagen && <XCircle size={16} className="text-[#a09990]" />}
              </div>
            </div>

            {/* Stats */}
            <div className="flex gap-3 mb-4">
              {vandaagSessie.duur_minuten != null && (
                <div className="flex items-center gap-1.5 bg-[#f5f3f0] rounded-xl px-3 py-2">
                  <Timer size={13} className="text-[#f97316]" />
                  <span className="text-sm font-semibold text-[#1a1612]">{formatDuur(vandaagSessie.duur_minuten)}</span>
                </div>
              )}
              {vandaagSessie.afstand_km != null && vandaagSessie.afstand_km > 0 && (
                <div className="flex items-center gap-1.5 bg-[#f5f3f0] rounded-xl px-3 py-2">
                  <MapPin size={13} className="text-[#f97316]" />
                  <span className="text-sm font-semibold text-[#1a1612]">{vandaagSessie.afstand_km} km</span>
                </div>
              )}
            </div>

            {/* Actieknoppen */}
            {!vandaagSessie.voltooid && !vandaagSessie.overgeslagen && (
              <div className="flex gap-2">
                <button onClick={() => sessieAfgerond(vandaagSessie.id)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-[#f97316] text-white text-sm font-bold active:scale-[0.98] transition-transform shadow-sm">
                  <CheckCircle2 size={16} /> Afgerond
                </button>
                <button onClick={() => setVerplaatsenSessie(vandaagSessie)}
                  className="px-4 py-3 rounded-2xl bg-[#f5f3f0] text-[#6b6560] text-sm font-medium border border-[#e8e3dc] active:scale-[0.98] transition-transform">
                  Verplaatsen
                </button>
                <button onClick={() => sessieOvergeslagen(vandaagSessie.id)}
                  className="px-4 py-3 rounded-2xl bg-[#f5f3f0] text-[#a09990] text-sm font-medium border border-[#e8e3dc] active:scale-[0.98] transition-transform">
                  Sla over
                </button>
              </div>
            )}
            {(vandaagSessie.voltooid || vandaagSessie.overgeslagen) && !vandaagSessie.runkeeper_id && (
              <button onClick={() => sessieVerwijderen(vandaagSessie.id)}
                className="w-full text-center text-xs text-red-400 py-1.5 active:opacity-60 transition-opacity">
                Verwijderen
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-white border border-[#f0ede8] p-5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#a09990] mb-2">Vandaag</p>
          <div className="flex items-center gap-3">
            <span className="text-2xl">😴</span>
            <div>
              <p className="font-semibold text-[#1a1612]">Rustdag</p>
              <p className="text-sm text-[#a09990]">Geen training gepland — herstel goed</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Vaste activiteiten vandaag (bijv. hockey) ───────────────────────── */}
      {activiteitenVandaag.map(a => (
        <div key={a.id} className="flex items-center gap-3 bg-white border border-[#f0ede8] rounded-2xl px-4 py-3 shadow-sm">
          <span className="text-xl">🏑</span>
          <div>
            <p className="text-sm font-semibold text-[#1a1612]">{a.naam}</p>
            <p className="text-xs text-[#a09990]">{a.tijdstip ? a.tijdstip.charAt(0).toUpperCase() + a.tijdstip.slice(1) : 'Vaste activiteit'}</p>
          </div>
        </div>
      ))}

      {/* ── Week overzicht (dag-dots) ────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl p-4 shadow-sm">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#a09990] mb-3">Deze week</p>
        <div className="flex gap-1 justify-between">
          {dagen.map((datum, i) => {
            const sessie = sessies.find(s => s.datum === datum && s.type !== 'rust' && s.type !== 'core' && !s.overgeslagen)
            const isVandaagDag = datum === vandaag
            const isGedaan = sessie?.voltooid
            const isOvergeslagen = sessie?.overgeslagen
            const k = INTENSITEIT_KLEUR[sessie?.intensiteit ?? 'makkelijk'] ?? INTENSITEIT_KLEUR.makkelijk

            return (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <span className={cn(
                  'text-[10px] font-semibold',
                  isVandaagDag ? 'text-[#f97316]' : 'text-[#c8c3bc]'
                )}>
                  {DAG_LABELS[i]}
                </span>
                <div
                  className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center transition-all',
                    isVandaagDag && 'ring-2 ring-[#f97316] ring-offset-1',
                    isOvergeslagen && 'opacity-40',
                  )}
                  style={{
                    backgroundColor: sessie ? `${k.bar}25` : '#f5f3f0',
                    border: sessie ? `2px solid ${k.bar}` : '2px solid transparent',
                  }}
                >
                  {isGedaan ? <CheckCircle2 size={13} className="text-green-500" />
                  : isOvergeslagen ? <XCircle size={13} className="text-[#c8c3bc]" />
                  : sessie ? <span className="text-xs">{TYPE_EMOJI[sessie.type]}</span>
                  : null}
                </div>
                <span className={cn(
                  'text-[10px]',
                  isVandaagDag ? 'font-bold text-[#f97316]' : 'text-[#c8c3bc]'
                )}>
                  {new Date(datum + 'T12:00:00').getDate()}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Doel + voortgang ────────────────────────────────────────────────── */}
      {doel ? (
        <div className="bg-white rounded-3xl p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#a09990] mb-1">Jouw doel</p>
              <p className="font-bold text-[#1a1612] truncate">{doel.naam}</p>
              <div className="flex items-center gap-3 mt-1">
                {dagenTotDoel !== null && dagenTotDoel > 0 && (
                  <span className="text-sm font-semibold text-[#f97316]">{dagenTotDoel} dagen</span>
                )}
                {doel.tijdsdoel && (
                  <span className="text-sm text-[#6b6560]">🎯 {doel.tijdsdoel}</span>
                )}
              </div>
            </div>
            <div className="text-3xl shrink-0">🏁</div>
          </div>
          {planVoortgang && planVoortgang.totaal > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-[#a09990] mb-1.5">
                <span>Trainingsplan</span>
                <span>{planVoortgang.voltooid}/{planVoortgang.totaal} · {planVoortgang.pct}%</span>
              </div>
              <div className="h-1.5 bg-[#f0ede8] rounded-full overflow-hidden">
                <div className="h-full bg-[#f97316] rounded-full transition-all" style={{ width: `${planVoortgang.pct}%` }} />
              </div>
            </div>
          )}
        </div>
      ) : (
        <button onClick={() => router.push('/doel')}
          className="flex items-center gap-3 bg-white border-2 border-dashed border-[#e8e3dc] rounded-3xl p-4 text-left shadow-sm">
          <span className="text-2xl">🎯</span>
          <div>
            <p className="font-semibold text-[#1a1612]">Stel een doel in</p>
            <p className="text-sm text-[#a09990]">Marathon, halve marathon of anders</p>
          </div>
          <ChevronRight size={16} className="text-[#c8c3bc] ml-auto" />
        </button>
      )}

      {/* ── Vandaag ook: Core & Fysio ────────────────────────────────────────── */}
      {(profiel?.wil_core || fysioOefeningen.length > 0) && (
        <div className="bg-white rounded-3xl border border-[#f0ede8] overflow-hidden shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#a09990] px-4 pt-3 pb-2">
            Vandaag ook
          </p>
          <div className="divide-y divide-[#f5f3f0]">
            {profiel?.wil_core && (
              <div className="flex items-center gap-3 px-4 py-3">
                <div className={cn(
                  'w-9 h-9 rounded-2xl flex items-center justify-center text-base shrink-0',
                  coreSessieVandaag ? 'bg-green-100' : 'bg-[#06b6d4]/10'
                )}>🧘</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1a1612]">Core stability</p>
                  <p className="text-xs text-[#a09990]">
                    {coreSessieVandaag ? 'Afgerond vandaag' : '~25 min · kracht & stabiliteit'}
                  </p>
                </div>
                {coreSessieVandaag ? (
                  <CheckCircle2 size={18} className="text-green-500 shrink-0" />
                ) : (
                  <button
                    onClick={() => router.push('/core/sessie')}
                    className="shrink-0 px-3 py-1.5 rounded-xl bg-[#06b6d4]/10 text-[#06b6d4] text-xs font-bold active:scale-95 transition-transform"
                  >
                    Start
                  </button>
                )}
              </div>
            )}
            {fysioOefeningen.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-3">
                <div className={cn(
                  'w-9 h-9 rounded-2xl flex items-center justify-center shrink-0',
                  fysioSessieVandaag ? 'bg-green-100' : 'bg-[#f97316]/10'
                )}>
                  <Dumbbell size={16} className={fysioSessieVandaag ? 'text-green-600' : 'text-[#f97316]'} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1a1612]">Fysiotherapie</p>
                  <p className="text-xs text-[#a09990]">
                    {fysioSessieVandaag
                      ? 'Afgerond vandaag'
                      : `${fysioOefeningen.length} oefening${fysioOefeningen.length !== 1 ? 'en' : ''} · blessurepreventie`}
                  </p>
                </div>
                {fysioSessieVandaag ? (
                  <CheckCircle2 size={18} className="text-green-500 shrink-0" />
                ) : (
                  <button
                    onClick={() => router.push('/fysio/sessie')}
                    className="shrink-0 px-3 py-1.5 rounded-xl bg-[#f97316]/10 text-[#f97316] text-xs font-bold active:scale-95 transition-transform"
                  >
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
        <div className="bg-white border border-[#e8e3dc] rounded-3xl p-4 flex gap-3 shadow-sm">
          <div className="w-8 h-8 bg-[#f97316]/10 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles size={14} className="text-[#f97316]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-[#f97316] uppercase tracking-wide mb-1">Coach</p>
            {coachLaden ? (
              <div className="flex gap-1 pt-1">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 bg-[#d0cbc4] rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#6b6560] leading-relaxed">{coachBericht}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Overlays ──────────────────────────────────────────────────────────── */}
      {feedbackSessie && (
        <FeedbackModal
          sessie={feedbackSessie}
          onSluit={handleFeedbackGesloten}
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
