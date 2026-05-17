'use client'
import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { formatDuur, cn } from '@/lib/utils'
import { CheckCircle2, ChevronRight, ChevronLeft, Dumbbell, Timer, MapPin, XCircle, Sparkles, Bell, Trash2, Plus, RefreshCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Goal, PhysioExercise, TrainingSession, Profile, RecurringActivity } from '@/types/database'
import { FeedbackModal } from '@/components/training/FeedbackModal'

interface Props {
  profiel: Profile | null
  sessies: (TrainingSession & { session_feedback: unknown[] })[]
  alleSessies: { voltooid: boolean; overgeslagen: boolean; datum: string }[]
  fysioOefeningen: PhysioExercise[]
  doel: Goal | null
  vandaag: string
  weekStart: string
  activiteiten: RecurringActivity[]
}

const TYPE_KLEUR: Record<string, string> = {
  hardlopen: '#f97316',
  krachttraining: '#8b5cf6',
  core: '#06b6d4',
  cross: '#10b981',
  rust: '#e5e7eb',
}

const TYPE_LABEL: Record<string, string> = {
  hardlopen: '🏃',
  krachttraining: '💪',
  core: '🧘',
  cross: '🚴',
  rust: '😴',
}

const INTENSITEIT_LABEL: Record<string, string> = {
  herstel: 'Herstelloop',
  makkelijk: 'Duurloop',
  gemiddeld: 'Tempo',
  zwaar: 'Lange duurloop',
  interval: 'Interval',
}

const INTENSITEIT_KLEUR: Record<string, string> = {
  herstel: 'bg-blue-100 text-blue-700',
  makkelijk: 'bg-green-100 text-green-700',
  gemiddeld: 'bg-yellow-100 text-yellow-700',
  zwaar: 'bg-orange-100 text-orange-700',
  interval: 'bg-red-100 text-red-700',
}

const DAGEN_KORT = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

function weekDagen(startDatum: string): string[] {
  const dagen: string[] = []
  const start = new Date(startDatum + 'T12:00:00')
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    dagen.push(d.toISOString().split('T')[0])
  }
  return dagen
}

// dag_van_week 0=ma..6=zo → JS 1=ma..0=zo
function dagVanWeekVoorDatum(datum: string, dagVanWeek: number): boolean {
  const d = new Date(datum + 'T12:00:00')
  const jsDag = d.getDay() // 0=zo, 1=ma...
  const onzeDag = jsDag === 0 ? 6 : jsDag - 1 // 0=ma..6=zo
  return onzeDag === dagVanWeek
}

export function DashboardClient({ profiel, sessies, alleSessies, fysioOefeningen, doel, vandaag, weekStart, activiteiten }: Props) {
  const supabase = createClient()
  const [feedbackSessie, setFeedbackSessie] = useState<TrainingSession | null>(null)
  const [lokaaleSessies, setLokaaleSessies] = useState(sessies)
  const [weekOffset, setWeekOffset] = useState(0)
  const [geselecteerdeDag, setGeselecteerdeDag] = useState(vandaag)
  const [coachBericht, setCoachBericht] = useState<string | null>(null)
  const [coachLaden, setCoachLaden] = useState(false)
  const [pushStatus, setPushStatus] = useState<'unknown' | 'granted' | 'denied' | 'unsupported'>('unknown')

  // Push permission + subscription
  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPushStatus('unsupported'); return
    }
    setPushStatus(Notification.permission === 'granted' ? 'granted' : Notification.permission === 'denied' ? 'denied' : 'unknown')
  }, [])

  async function pushAanvragen() {
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') { setPushStatus('denied'); return }
    setPushStatus('granted')
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    })
    await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub) })
  }

  // Coach bericht laden (eenmalig per dag, gecached in sessionStorage)
  useEffect(() => {
    const cacheKey = `coach-${vandaag}`
    const cached = sessionStorage.getItem(cacheKey)
    if (cached) { setCoachBericht(cached); return }
    setCoachLaden(true)
    fetch('/api/coach/bericht')
      .then(r => r.json())
      .then(d => {
        if (d.bericht) { setCoachBericht(d.bericht); sessionStorage.setItem(cacheKey, d.bericht) }
        setCoachLaden(false)
      })
      .catch(() => setCoachLaden(false))
  }, [vandaag])

  // Voortgang trainingsplan
  const planVoortgang = (() => {
    if (!alleSessies.length) return null
    const voltooid = alleSessies.filter(s => s.voltooid).length
    const totaal = alleSessies.filter(s => !s.overgeslagen).length || alleSessies.length
    return { voltooid, totaal, pct: Math.round((voltooid / totaal) * 100) }
  })()

  // Weekoverzicht (maandag: toon vorige week samenvatting)
  const isVandaagMaandag = new Date(vandaag + 'T12:00:00').getDay() === 1
  const vorigeWeekSamenvatting = (() => {
    if (!isVandaagMaandag) return null
    const vorigeWeekStart = new Date(weekStart + 'T12:00:00')
    vorigeWeekStart.setDate(vorigeWeekStart.getDate() - 7)
    const vwsStr = vorigeWeekStart.toISOString().split('T')[0]
    const vorigeWeekEind = new Date(weekStart + 'T12:00:00')
    vorigeWeekEind.setDate(vorigeWeekEind.getDate() - 1)
    const vweStr = vorigeWeekEind.toISOString().split('T')[0]
    const vwSessies = alleSessies.filter(s => s.datum >= vwsStr && s.datum <= vweStr)
    const vwVoltooid = vwSessies.filter(s => s.voltooid).length
    const vwTotaal = vwSessies.length
    if (!vwTotaal) return null
    return { voltooid: vwVoltooid, totaal: vwTotaal }
  })()

  const displayWeekStart = (() => {
    const d = new Date(weekStart + 'T12:00:00')
    d.setDate(d.getDate() + weekOffset * 7)
    return d.toISOString().split('T')[0]
  })()

  const dagen = weekDagen(displayWeekStart)
  const naam = profiel?.naam?.split(' ')[0] ?? 'atleet'
  const uur = new Date().getHours()
  const begroeting = uur < 12 ? 'Goedemorgen' : uur < 18 ? 'Goedemiddag' : 'Goedenavond'

  const dagenTotDoel = doel
    ? Math.ceil((new Date(doel.datum).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
    : null

  // Verdeel activiteiten over de week op basis van frequentie (0=ma..6=zo)
  const FREQ_NAAR_DAGEN: Record<number, number[]> = {
    1: [2], 2: [1, 5], 3: [0, 2, 5], 4: [0, 1, 3, 5], 5: [0, 1, 2, 4, 5]
  }
  function heeftActiviteitOpDag(datum: string, freq: number): boolean {
    const d = new Date(datum + 'T12:00:00')
    const jsDag = d.getDay()
    const onzeDag = jsDag === 0 ? 6 : jsDag - 1
    const dagen = FREQ_NAAR_DAGEN[freq] ?? FREQ_NAAR_DAGEN[3]
    return dagen.includes(onzeDag)
  }
  function heeftCoreDag(datum: string): boolean {
    if (!profiel?.wil_core) return false
    return heeftActiviteitOpDag(datum, profiel?.core_per_week ?? 2)
  }
  function heeftFysioDag(datum: string): boolean {
    if (!fysioOefeningen.length) return false
    return heeftActiviteitOpDag(datum, profiel?.fysio_per_week ?? 3)
  }

  // Geselecteerde dag info
  const [verplaatsenSessieId, setVerplaatsenSessieId] = useState<string | null>(null)
  const [toonRunForm, setToonRunForm] = useState(false)
  const [runAfstand, setRunAfstand] = useState('')
  const [runDuur, setRunDuur] = useState('')
  const [runIntensiteit, setRunIntensiteit] = useState<'herstel' | 'makkelijk' | 'gemiddeld' | 'zwaar' | 'interval'>('makkelijk')
  const [runOpslaan, setRunOpslaan] = useState(false)
  const [stravaSync, setStravaSync] = useState<'idle' | 'bezig' | 'klaar'>('idle')

  const geselecteerdeSessie = lokaaleSessies.find(s => s.datum === geselecteerdeDag && !s.overgeslagen && s.type !== 'core')
  const coreVandaagVoltooid = lokaaleSessies.some(s => s.datum === geselecteerdeDag && s.type === 'core' && s.voltooid)
  const geselecteerdeActiviteiten = activiteiten.filter(a => dagVanWeekVoorDatum(geselecteerdeDag, a.dag_van_week))
  const heeftCoreVandaag = heeftCoreDag(geselecteerdeDag)
  const heeftFysioVandaag = heeftFysioDag(geselecteerdeDag)

  function isoWeeknummer(datum: string): number {
    const d = new Date(datum + 'T12:00:00')
    const dag = d.getDay() || 7
    d.setDate(d.getDate() + 4 - dag)
    const jaarStart = new Date(d.getFullYear(), 0, 1)
    return Math.ceil(((d.getTime() - jaarStart.getTime()) / 86400000 + 1) / 7)
  }

  async function logSpontaneRun() {
    const afstand = parseFloat(runAfstand.replace(',', '.'))
    const duur = parseInt(runDuur)
    if (!afstand || !duur) return
    setRunOpslaan(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setRunOpslaan(false); return }

    const { data: nieuw } = await supabase
      .from('training_sessions')
      .insert({
        user_id: user.id,
        datum: geselecteerdeDag,
        type: 'hardlopen',
        beschrijving: `Spontane run — ${afstand} km`,
        duur_minuten: duur,
        afstand_km: afstand,
        intensiteit: runIntensiteit,
        voltooid: true,
        overgeslagen: false,
        week_nummer: isoWeeknummer(geselecteerdeDag),
        volgorde: 0,
      } as never)
      .select('*, session_feedback(*)')
      .single()

    if (nieuw) {
      setLokaaleSessies(prev => [...prev, nieuw as TrainingSession & { session_feedback: unknown[] }])
      setToonRunForm(false)
      setRunAfstand('')
      setRunDuur('')
    }
    setRunOpslaan(false)
  }

  async function syncStrava() {
    setStravaSync('bezig')
    try {
      await fetch('/api/strava/sync', { method: 'POST' })
      setStravaSync('klaar')
      setTimeout(() => { setStravaSync('idle'); window.location.reload() }, 1500)
    } catch {
      setStravaSync('idle')
    }
  }

  async function verwijderSessie(sessieId: string) {
    await supabase.from('training_sessions').delete().eq('id', sessieId)
    setLokaaleSessies(prev => prev.filter(s => s.id !== sessieId))
  }

  async function verplaatsSessie(sessieId: string, nieuweDatum: string) {
    await supabase.from('training_sessions').update({ datum: nieuweDatum } as never).eq('id', sessieId)
    setLokaaleSessies(prev => prev.map(s => s.id === sessieId ? { ...s, datum: nieuweDatum } : s))
    setGeselecteerdeDag(nieuweDatum)
    setVerplaatsenSessieId(null)
  }

  async function sessieAfronden(sessieId: string) {
    await supabase.from('training_sessions').update({ voltooid: true } as never).eq('id', sessieId)
    setLokaaleSessies(prev => prev.map(s => s.id === sessieId ? { ...s, voltooid: true } : s))
    const sessie = lokaaleSessies.find(s => s.id === sessieId)
    if (sessie) setFeedbackSessie(sessie)
  }

  async function sessieOvergeslagen(sessieId: string) {
    await supabase.from('training_sessions').update({ overgeslagen: true } as never).eq('id', sessieId)
    setLokaaleSessies(prev => prev.map(s => s.id === sessieId ? { ...s, overgeslagen: true } : s))
  }

  return (
    <div className="flex flex-col gap-5 p-4 pt-8 pb-24">
      {/* Header */}
      <div>
        <p className="text-[#6b6560] text-sm">{begroeting}</p>
        <h1 className="text-2xl font-bold text-[#1a1612]">{naam} 👋</h1>
      </div>

      {/* Weekoverzicht — alleen maandag */}
      {vorigeWeekSamenvatting && (
        <Card className={cn('border-2', vorigeWeekSamenvatting.voltooid >= vorigeWeekSamenvatting.totaal * 0.8 ? 'border-green-200 bg-green-50' : 'border-[#f97316]/20 bg-[#f97316]/5')}>
          <p className="text-xs font-semibold text-[#6b6560] uppercase tracking-wider mb-1">Vorige week</p>
          <p className="text-base font-bold text-[#1a1612]">
            {vorigeWeekSamenvatting.voltooid}/{vorigeWeekSamenvatting.totaal} trainingen voltooid
            {vorigeWeekSamenvatting.voltooid >= vorigeWeekSamenvatting.totaal ? ' 🔥' : vorigeWeekSamenvatting.voltooid >= vorigeWeekSamenvatting.totaal * 0.8 ? ' 💪' : ' — blijf gaan!'}
          </p>
        </Card>
      )}

      {/* Push notificaties banner */}
      {pushStatus === 'unknown' && (
        <button onClick={pushAanvragen} className="w-full flex items-center gap-3 bg-white border border-[#e8e3dc] rounded-2xl px-4 py-3 text-left shadow-sm">
          <div className="w-8 h-8 rounded-xl bg-[#f97316]/10 flex items-center justify-center shrink-0">
            <Bell size={16} className="text-[#f97316]" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-[#1a1612]">Ochtendmeldingen aanzetten</p>
            <p className="text-xs text-[#a09990]">Dagelijkse reminder met je training van vandaag</p>
          </div>
          <ChevronRight size={16} className="text-[#d0cbc4] shrink-0" />
        </button>
      )}

      {/* Doel countdown + voortgang */}
      {doel ? (
        <Card className="bg-gradient-to-br from-[#f97316] to-[#ea6c0a] shadow-md">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-white/80 font-medium">{doel.naam}</p>
              <p className="text-3xl font-bold text-white mt-1">
                {dagenTotDoel} <span className="text-lg font-normal text-white/70">dagen</span>
              </p>
            </div>
            <div className="text-4xl">🏁</div>
          </div>
          {doel.tijdsdoel && (
            <p className="text-sm text-white/70 mt-2">
              Tijdsdoel: <span className="text-white font-medium">{doel.tijdsdoel}</span>
            </p>
          )}
          {planVoortgang && planVoortgang.totaal > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-white/70 mb-1">
                <span>Trainingsplan voortgang</span>
                <span>{planVoortgang.voltooid}/{planVoortgang.totaal} sessies · {planVoortgang.pct}%</span>
              </div>
              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all" style={{ width: `${planVoortgang.pct}%` }} />
              </div>
            </div>
          )}
        </Card>
      ) : (
        <Card onClick={() => window.location.href = '/doel'} className="border-2 border-dashed border-[#e8e3dc] text-center py-5 cursor-pointer">
          <p className="text-3xl mb-1">🎯</p>
          <p className="font-semibold text-[#1a1612]">Stel een doel in</p>
          <p className="text-sm text-[#6b6560] mt-0.5">Marathon, triathlon of alleen fysio</p>
        </Card>
      )}

      {/* Week strip */}
      <div className="bg-white rounded-3xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => { setWeekOffset(o => Math.max(0, o - 1)); setGeselecteerdeDag(vandaag) }}
            disabled={weekOffset === 0}
            className={cn('w-7 h-7 rounded-full flex items-center justify-center', weekOffset === 0 ? 'text-[#d0cbc4]' : 'text-[#6b6560] bg-[#f5f3f0]')}
          >
            <ChevronLeft size={16} />
          </button>
          <p className="text-xs font-semibold text-[#a09990] uppercase tracking-wider">
            {weekOffset === 0 ? 'Deze week' : weekOffset === 1 ? 'Volgende week' : `Over ${weekOffset} weken`}
          </p>
          <button
            onClick={() => {
              const nieuweOffset = Math.min(2, weekOffset + 1)
              const d = new Date(weekStart + 'T12:00:00')
              d.setDate(d.getDate() + nieuweOffset * 7)
              setGeselecteerdeDag(d.toISOString().split('T')[0])
              setWeekOffset(nieuweOffset)
            }}
            disabled={weekOffset === 2}
            className={cn('w-7 h-7 rounded-full flex items-center justify-center', weekOffset === 2 ? 'text-[#d0cbc4]' : 'text-[#6b6560] bg-[#f5f3f0]')}
          >
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {dagen.map((datum, i) => {
            const sessie = lokaaleSessies.find(s => s.datum === datum && !s.overgeslagen && s.type !== 'core')
            const coreSessie = lokaaleSessies.find(s => s.datum === datum && s.type === 'core' && s.voltooid)
            const heeftActiviteit = activiteiten.some(a => dagVanWeekVoorDatum(datum, a.dag_van_week))
            const heeftCore = heeftCoreDag(datum)
            const isVandaag = datum === vandaag
            const isGeselecteerd = datum === geselecteerdeDag
            const isVerleden = datum < vandaag
            const heeftFysio = heeftFysioDag(datum)
            const kleur = sessie ? TYPE_KLEUR[sessie.type] ?? '#f97316' : coreSessie ? '#06b6d4' : heeftCore ? '#06b6d4' : heeftFysio ? '#f97316' : null

            return (
              <button
                key={datum}
                onClick={() => setGeselecteerdeDag(datum)}
                className="flex flex-col items-center gap-1.5"
              >
                <span className={cn(
                  'text-xs font-medium',
                  isVandaag ? 'text-[#f97316]' : isVerleden ? 'text-[#c8c3bc]' : 'text-[#6b6560]'
                )}>
                  {DAGEN_KORT[i]}
                </span>

                <div className={cn(
                  'w-9 h-9 rounded-full flex items-center justify-center relative transition-all',
                  isGeselecteerd ? 'ring-2 ring-[#f97316] ring-offset-1' : '',
                  isVandaag && !isGeselecteerd ? 'ring-1 ring-[#f97316]/40 ring-offset-1' : '',
                )}
                  style={{ backgroundColor: kleur ? (isVerleden ? kleur + '60' : kleur) : '#f5f3f0' }}
                >
                  {sessie ? (
                    <span className="text-sm">{TYPE_LABEL[sessie.type]}</span>
                  ) : coreSessie ? (
                    <span className="text-sm">🧘</span>
                  ) : heeftActiviteit ? (
                    <span className="text-sm">🏑</span>
                  ) : heeftCore ? (
                    <span className="text-sm">🧘</span>
                  ) : heeftFysio ? (
                    <span className="text-sm">🩺</span>
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#d0cbc4]" />
                  )}
                  {(sessie?.voltooid || coreSessie) && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full flex items-center justify-center">
                      <CheckCircle2 size={9} className="text-white" />
                    </div>
                  )}
                </div>

                <span className={cn(
                  'text-xs',
                  isVandaag ? 'text-[#f97316] font-semibold' : 'text-[#a09990]'
                )}>
                  {new Date(datum + 'T12:00:00').getDate()}
                </span>
              </button>
            )
          })}
        </div>

        {/* Legenda */}
        <div className="flex gap-3 mt-3 flex-wrap">
          {[
            { kleur: '#f97316', label: 'Hardlopen' },
            { kleur: '#8b5cf6', label: 'Kracht' },
            { kleur: '#06b6d4', label: 'Core' },
            { kleur: '#10b981', label: 'Cross' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.kleur }} />
              <span className="text-xs text-[#a09990]">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* AI Coach bericht */}
      {(coachBericht || coachLaden) && (
        <div className="bg-white border border-[#e8e3dc] rounded-3xl p-4 flex gap-3 shadow-sm">
          <div className="w-8 h-8 bg-[#f97316]/10 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles size={15} className="text-[#f97316]" />
          </div>
          <div>
            <p className="text-xs font-semibold text-[#f97316] mb-1">Coach</p>
            {coachLaden ? (
              <div className="flex gap-1 pt-1">
                {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-[#d0cbc4] rounded-full animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />)}
              </div>
            ) : (
              <p className="text-sm text-[#6b6560] leading-relaxed">{coachBericht}</p>
            )}
          </div>
        </div>
      )}

      {/* Geselecteerde dag detail */}
      <div>
        <h2 className="text-xs font-semibold text-[#a09990] uppercase tracking-wider mb-3">
          {geselecteerdeDag === vandaag ? 'Vandaag' : new Date(geselecteerdeDag + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h2>

        {/* Log spontane run knop — altijd beschikbaar op verleden/vandaag */}
        {geselecteerdeDag <= vandaag && !toonRunForm && (
          <div className="flex gap-2 mb-1">
            <button
              onClick={() => setToonRunForm(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-[#e8e3dc] text-[#6b6560] text-sm hover:border-[#f97316] hover:text-[#f97316] transition-all shadow-sm"
            >
              <Plus size={15} />
              Run loggen
            </button>
            {!!(profiel as Record<string, unknown>)?.strava_refresh_token && (
              <button
                onClick={syncStrava}
                disabled={stravaSync !== 'idle'}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-all shadow-sm ${
                  stravaSync === 'klaar'
                    ? 'bg-green-50 border-green-200 text-green-600'
                    : 'bg-white border-[#e8e3dc] text-[#6b6560] hover:border-[#f97316] hover:text-[#f97316]'
                }`}
              >
                <RefreshCw size={15} className={stravaSync === 'bezig' ? 'animate-spin' : ''} />
                {stravaSync === 'bezig' ? 'Syncing…' : stravaSync === 'klaar' ? 'Gesynchroniseerd!' : 'Sync Strava'}
              </button>
            )}
          </div>
        )}

        {/* Run log form */}
        {toonRunForm && (
          <div className="bg-white rounded-2xl p-4 shadow-sm mb-1">
            <p className="text-sm font-semibold text-[#1a1612] mb-3">🏃 Run loggen</p>
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="text-xs text-[#a09990] mb-1 block">Afstand (km)</label>
                <input
                  type="number" inputMode="decimal" placeholder="8.5"
                  value={runAfstand} onChange={e => setRunAfstand(e.target.value)}
                  className="w-full border border-[#e8e3dc] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#f97316]"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-[#a09990] mb-1 block">Duur (min)</label>
                <input
                  type="number" inputMode="numeric" placeholder="45"
                  value={runDuur} onChange={e => setRunDuur(e.target.value)}
                  className="w-full border border-[#e8e3dc] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#f97316]"
                />
              </div>
            </div>
            <div className="flex gap-1.5 mb-4">
              {([
                { v: 'herstel', label: 'Rustig' },
                { v: 'makkelijk', label: 'Makkelijk' },
                { v: 'gemiddeld', label: 'Tempo' },
                { v: 'zwaar', label: 'Lang' },
                { v: 'interval', label: 'Interval' },
              ] as const).map(opt => (
                <button key={opt.v} onClick={() => setRunIntensiteit(opt.v)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    runIntensiteit === opt.v
                      ? 'bg-[#f97316] text-white border-[#f97316]'
                      : 'bg-[#f5f3f0] text-[#6b6560] border-[#e8e3dc]'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setToonRunForm(false); setRunAfstand(''); setRunDuur('') }}
                className="flex-1 py-2.5 rounded-xl border border-[#e8e3dc] text-sm text-[#6b6560]">
                Annuleren
              </button>
              <button
                onClick={logSpontaneRun}
                disabled={!runAfstand || !runDuur || runOpslaan}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  runAfstand && runDuur && !runOpslaan
                    ? 'bg-[#f97316] text-white'
                    : 'bg-[#e8e3dc] text-[#9ca3af] cursor-not-allowed'
                }`}>
                {runOpslaan ? 'Opslaan…' : 'Opslaan'}
              </button>
            </div>
          </div>
        )}

        {geselecteerdeSessie ? (
          <>
            <TrainingsKaart
              sessie={geselecteerdeSessie}
              onAfronden={sessieAfronden}
              onOvergeslagen={sessieOvergeslagen}
              onVerplaatsen={() => setVerplaatsenSessieId(
                verplaatsenSessieId === geselecteerdeSessie.id ? null : geselecteerdeSessie.id
              )}
              isVerleden={geselecteerdeDag < vandaag}
            />
            {verplaatsenSessieId === geselecteerdeSessie.id && (
              <div className="bg-white rounded-2xl p-4 mt-2 shadow-sm">
                <p className="text-xs font-semibold text-[#6b6560] uppercase tracking-wider mb-3">Verplaatsen naar</p>
                <div className="grid grid-cols-7 gap-1">
                  {dagen.map((datum, i) => {
                    const bezet = lokaaleSessies.some(s => s.datum === datum && s.id !== geselecteerdeSessie.id && !s.overgeslagen)
                    const isHuidige = datum === geselecteerdeDag
                    return (
                      <button key={datum} onClick={() => !bezet && !isHuidige && verplaatsSessie(geselecteerdeSessie.id, datum)}
                        disabled={bezet || isHuidige}
                        className={cn('flex flex-col items-center gap-1 py-2 rounded-xl text-xs transition-all',
                          isHuidige ? 'bg-[#f97316]/10 text-[#f97316] font-semibold' :
                          bezet ? 'opacity-30 cursor-not-allowed' :
                          'hover:bg-[#f5f3f0] text-[#1a1612] font-medium cursor-pointer border border-[#e8e3dc]'
                        )}>
                        <span className="text-[10px] text-[#a09990]">{DAGEN_KORT[i]}</span>
                        <span>{new Date(datum + 'T12:00:00').getDate()}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        ) : geselecteerdeActiviteiten.length === 0 ? (
          <Card>
            <p className="text-[#6b6560] text-sm">Geen training gepland. Rust en herstel!</p>
          </Card>
        ) : null}

        {/* Vaste activiteiten op deze dag */}
        {geselecteerdeActiviteiten.map(a => (
          <Card key={a.id} className="mt-2 bg-[#f5f3f0] border border-[#e8e3dc]">
            <div className="flex items-center gap-3">
              <span className="text-xl">🏑</span>
              <div>
                <p className="font-medium text-sm text-[#1a1612]">{a.naam}</p>
                <p className="text-xs text-[#a09990]">
                  {a.tijdstip ? `${a.tijdstip.charAt(0).toUpperCase() + a.tijdstip.slice(1)}` : 'Vaste activiteit'}
                  {a.blokkeert_hardlopen ? ' · geen hardlopen' : ''}
                </p>
              </div>
            </div>
          </Card>
        ))}

        {/* Core stability kaart */}
        {profiel?.wil_core && (() => {
          const coreSessieVandaag = lokaaleSessies.find(s => s.datum === geselecteerdeDag && s.type === 'core' && s.voltooid)
          return (
            <Card
              className={cn('mt-2', coreSessieVandaag ? '' : 'cursor-pointer')}
              onClick={coreSessieVandaag ? undefined : () => window.location.href = '/core/sessie'}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'w-10 h-10 rounded-2xl flex items-center justify-center text-lg',
                    coreSessieVandaag ? 'bg-green-100' : heeftCoreVandaag ? 'bg-[#06b6d4]/20' : 'bg-[#f5f3f0]'
                  )}>🧘</div>
                  <div>
                    <h3 className="font-semibold text-[#1a1612]">Core stability</h3>
                    <p className="text-sm text-[#6b6560]">
                      {coreSessieVandaag
                        ? coreSessieVandaag.beschrijving ?? 'Gedaan vandaag'
                        : heeftCoreVandaag
                          ? 'Vandaag ingepland · tik om te starten'
                          : 'Tik om nu te doen'}
                    </p>
                  </div>
                </div>
                {coreSessieVandaag ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={18} className="text-green-500" />
                    <button
                      onClick={e => { e.stopPropagation(); verwijderSessie(coreSessieVandaag.id) }}
                      className="w-7 h-7 rounded-lg bg-[#f5f3f0] flex items-center justify-center text-[#a09990] hover:text-red-400 hover:bg-red-50 transition-colors"
                      title="Verwijder sessie"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ) : (
                  <ChevronRight size={18} className="text-[#a09990]" />
                )}
              </div>
            </Card>
          )
        })()}

        {/* Fysio kaart */}
        {fysioOefeningen.length > 0 && (
          <Card className="mt-2 cursor-pointer" onClick={() => window.location.href = '/fysio/sessie'}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center',
                  heeftFysioVandaag ? 'bg-[#f97316]/20' : 'bg-[#fff3ec]')}>
                  <Dumbbell size={18} className="text-[#f97316]" />
                </div>
                <div>
                  <h3 className="font-semibold text-[#1a1612]">Fysio-oefeningen</h3>
                  <p className="text-sm text-[#6b6560]">
                    {heeftFysioVandaag ? `${fysioOefeningen.length} oefeningen · vandaag ingepland` : `${fysioOefeningen.length} oefeningen · tik om te starten`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {heeftFysioVandaag && <div className="w-2 h-2 rounded-full bg-[#f97316]" />}
                <ChevronRight size={18} className="text-[#a09990]" />
              </div>
            </div>
          </Card>
        )}
      </div>

      {feedbackSessie && (
        <FeedbackModal sessie={feedbackSessie} onSluit={() => setFeedbackSessie(null)} />
      )}
    </div>
  )
}

function TrainingsKaart({ sessie, onAfronden, onOvergeslagen, onVerplaatsen, isVerleden }: {
  sessie: TrainingSession
  onAfronden: (id: string) => void
  onOvergeslagen: (id: string) => void
  onVerplaatsen: () => void
  isVerleden: boolean
}) {
  const typeLabel = sessie.type === 'hardlopen' && sessie.intensiteit
    ? INTENSITEIT_LABEL[sessie.intensiteit] ?? 'Duurloop'
    : sessie.type === 'krachttraining' ? 'Krachttraining'
    : sessie.type === 'core' ? 'Core stability'
    : sessie.type === 'cross' ? 'Cross-training'
    : 'Rust'

  return (
    <Card className={cn(sessie.voltooid && 'opacity-60')}>
      {/* Type + intensiteit header */}
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-sm"
          style={{ backgroundColor: (TYPE_KLEUR[sessie.type] ?? '#f97316') + '20' }}
        >
          {TYPE_LABEL[sessie.type]}
        </div>
        <div>
          <p className="font-bold text-[#1a1612] leading-tight">{typeLabel}</p>
          {sessie.intensiteit && (
            <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', INTENSITEIT_KLEUR[sessie.intensiteit])}>
              {sessie.intensiteit}
            </span>
          )}
        </div>
        {sessie.voltooid && <CheckCircle2 size={16} className="text-green-500 ml-auto" />}
        {sessie.overgeslagen && <XCircle size={16} className="text-[#a09990] ml-auto" />}
      </div>

      {/* Beschrijving */}
      <p className="text-sm text-[#6b6560] mb-3 leading-relaxed">{sessie.beschrijving}</p>

      {/* Stats */}
      <div className="flex gap-4 mb-4">
        {sessie.duur_minuten != null && (
          <div className="flex items-center gap-1.5 bg-[#f5f3f0] rounded-xl px-3 py-2">
            <Timer size={14} className="text-[#f97316]" />
            <span className="text-sm font-semibold text-[#1a1612]">{formatDuur(sessie.duur_minuten)}</span>
          </div>
        )}
        {sessie.afstand_km != null && sessie.afstand_km > 0 && (
          <div className="flex items-center gap-1.5 bg-[#f5f3f0] rounded-xl px-3 py-2">
            <MapPin size={14} className="text-[#f97316]" />
            <span className="text-sm font-semibold text-[#1a1612]">{sessie.afstand_km} km</span>
          </div>
        )}
      </div>

      {/* Acties */}
      {!sessie.voltooid && !sessie.overgeslagen && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button onClick={() => onAfronden(sessie.id)} className="flex-1">
              <CheckCircle2 size={15} className="mr-1.5" /> Afgerond
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onOvergeslagen(sessie.id)}>
              Sla over
            </Button>
          </div>
          <button onClick={onVerplaatsen}
            className="text-xs text-[#a09990] text-center py-1 hover:text-[#6b6560] transition-colors">
            ↕ Verplaatsen naar andere dag
          </button>
        </div>
      )}
      {sessie.voltooid && (
        <p className="text-green-600 text-sm font-medium flex items-center gap-1">
          <CheckCircle2 size={14} /> Gelukt!
        </p>
      )}
      {sessie.overgeslagen && (
        <p className="text-[#a09990] text-sm flex items-center gap-1">
          <XCircle size={14} /> Overgeslagen
        </p>
      )}
    </Card>
  )
}
