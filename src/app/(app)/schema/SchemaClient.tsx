'use client'
import { useState, useMemo, useEffect } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn, formatDuur, dagKorteDatum } from '@/lib/utils'
import type { Goal, TrainingSession } from '@/types/database'
import {
  Loader2, RefreshCw, MapPin, Timer, CheckCircle2, XCircle,
  ChevronLeft, ChevronRight, Calendar, MoveRight, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { WorkoutModal } from '@/components/training/WorkoutModal'
import { TempoZonesCard } from '@/components/training/TempoZonesCard'
import { RouteThumbnail } from '@/components/training/RouteThumbnail'

interface Props {
  sessies: (TrainingSession & { session_feedback: unknown[] })[]
  doel: Goal | null
  userId: string
  wilCore: boolean
  heeftFysio: boolean
}

// ── Kleuren per intensiteit ────────────────────────────────────────────────────
const KLEUR: Record<string, { bar: string; badge: string; dot: string }> = {
  herstel:   { bar: '#93c5fd', badge: 'bg-blue-950 text-blue-300',     dot: '#93c5fd' },
  makkelijk: { bar: '#4ade80', badge: 'bg-green-950 text-green-300',   dot: '#4ade80' },
  gemiddeld: { bar: '#fbbf24', badge: 'bg-amber-950 text-amber-300',   dot: '#fbbf24' },
  zwaar:     { bar: '#f97316', badge: 'bg-orange-950 text-orange-300', dot: '#f97316' },
  interval:  { bar: '#f43f5e', badge: 'bg-rose-950 text-rose-300',     dot: '#f43f5e' },
}

const RUST_KLEUR = { bar: '#2d2d3e', badge: '', dot: '#2d2d3e' }

const TYPE_EMOJI: Record<string, string> = {
  hardlopen:      '🏃',
  rust:           '😴',
  krachttraining: '💪',
  cross:          '🚴',
  core:           '🧘',
  fysio:          '💊',
}

function sessieEmoji(sessie: { type: string; beschrijving?: string | null }): string {
  if (sessie.type === 'core' && sessie.beschrijving?.toLowerCase().includes('fysio')) return '💊'
  return TYPE_EMOJI[sessie.type] ?? '🏃'
}

const DAG_LABELS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

function datumToDagIndex(datum: string): number {
  const dow = new Date(datum + 'T12:00:00').getDay()
  return dow === 0 ? 6 : dow - 1
}

function dagNummerVanDatum(datum: string): number {
  return new Date(datum + 'T12:00:00').getDate()
}

function dagAfkVanDatum(datum: string): string {
  const dow = new Date(datum + 'T12:00:00').getDay()
  return DAG_LABELS[dow === 0 ? 6 : dow - 1]
}

function weekDateRange(maandag: string): string {
  const ma = new Date(maandag + 'T12:00:00')
  const zo = new Date(ma); zo.setDate(ma.getDate() + 6)
  const fmt = (d: Date) => d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
  return `${fmt(ma)} – ${fmt(zo)}`
}

function berekenTempo(duurMin?: number | null, afstandKm?: number | null): string {
  if (!duurMin || !afstandKm) return '–'
  const minPerKm = duurMin / afstandKm
  const min = Math.floor(minPerKm)
  const sec = Math.round((minPerKm - min) * 60)
  return `${min}:${sec.toString().padStart(2, '0')}/km`
}

// ── Reschedule bottom sheet ────────────────────────────────────────────────────
interface RoosterModalProps {
  sessie: TrainingSession
  alleSessies: TrainingSession[]
  onVerplaatsen: (id: string, datum: string) => void
  onLatenVervallen: (id: string) => void
  onSluiten: () => void
}

function RoosterModal({ sessie, alleSessies, onVerplaatsen, onLatenVervallen, onSluiten }: RoosterModalProps) {
  // Vrije dagen de komende 21 dagen (geen hockey di/zo, geen bestaande training)
  const bezet = new Set(
    alleSessies
      .filter(s => s.id !== sessie.id && s.type !== 'rust' && !s.overgeslagen)
      .map(s => s.datum)
  )

  const kandidaten: string[] = []
  const vandaag = new Date()
  vandaag.setHours(0, 0, 0, 0)

  for (let i = 1; i <= 28; i++) {
    const d = new Date(vandaag)
    d.setDate(d.getDate() + i)
    const dow = d.getDay()
    if (dow === 2 || dow === 0) continue // di (2) en zo (0) = hockey
    const datum = d.toISOString().split('T')[0]
    if (bezet.has(datum)) continue
    kandidaten.push(datum)
    if (kandidaten.length >= 6) break
  }

  const formatDatumLabel = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60" onClick={onSluiten} />
      <div className="relative w-full bg-[#1b1b27] rounded-t-3xl shadow-2xl overflow-hidden border-t border-[#2d2d3e]">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-[#2d2d3e] rounded-full" />
        </div>

        <div className="px-5 pb-safe-or-8 pb-8">
          <div className="flex justify-between items-start mb-4 mt-1">
            <div>
              <h3 className="font-bold text-white text-base">Training gemist</h3>
              <p className="text-sm text-[#8888a8] mt-0.5 leading-snug">{sessie.beschrijving}</p>
            </div>
            <button onClick={onSluiten} className="p-1.5 text-[#55556a] -mt-0.5">
              <X size={18} />
            </button>
          </div>

          <p className="text-xs font-semibold text-[#55556a] uppercase tracking-wide mb-2">
            Verplaatsen naar
          </p>

          {kandidaten.length === 0 ? (
            <p className="text-sm text-[#55556a] mb-4">
              Geen vrije trainingsdagen gevonden in de komende 4 weken.
            </p>
          ) : (
            <div className="flex flex-col gap-2 mb-4">
              {kandidaten.map(datum => (
                <button
                  key={datum}
                  onClick={() => onVerplaatsen(sessie.id, datum)}
                  className="flex items-center justify-between px-4 py-3 rounded-2xl bg-[#222230] border border-[#2d2d3e] text-sm font-medium text-white active:scale-[0.98] transition-transform"
                >
                  <span className="capitalize">{formatDatumLabel(datum)}</span>
                  <MoveRight size={16} className="text-[#55556a]" />
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => onLatenVervallen(sessie.id)}
            className="w-full py-3 rounded-2xl text-sm font-medium text-[#8888a8] border border-[#2d2d3e] active:scale-[0.98] transition-transform"
          >
            Laten vervallen
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Bewerkbare volledige agenda-weergave ───────────────────────────────────────
interface AgendaWeergaveProps {
  sessies: TrainingSession[]
  onDatumChange: (id: string, datum: string) => void
  onVerwijderen: (id: string) => void
  onToggleVoltooid: (sessie: TrainingSession) => void
  onOpenWorkout: (sessie: TrainingSession) => void
}

function AgendaWeergave({ sessies, onDatumChange, onVerwijderen, onToggleVoltooid, onOpenWorkout }: AgendaWeergaveProps) {
  const gesorteerd = [...sessies]
    .filter(s => s.type !== 'rust')
    .sort((a, b) => a.datum.localeCompare(b.datum))

  if (gesorteerd.length === 0) {
    return <p className="text-sm text-[#55556a] text-center py-8">Geen trainingen in de agenda.</p>
  }

  return (
    <div className="flex flex-col gap-2">
      {gesorteerd.map(s => {
        const kleur = KLEUR[s.intensiteit ?? 'makkelijk'] ?? KLEUR.makkelijk
        return (
          <div key={s.id} className="flex items-center gap-2.5 p-3 rounded-2xl bg-[#1b1b27] border border-[#2d2d3e]">
            <button onClick={() => onToggleVoltooid(s)} className="shrink-0">
              {s.voltooid ? (
                <CheckCircle2 size={20} className="text-green-500" />
              ) : (
                <div className="w-5 h-5 rounded-full border-2" style={{ borderColor: kleur.bar }} />
              )}
            </button>
            <input
              type="date"
              value={s.datum}
              onChange={e => onDatumChange(s.id, e.target.value)}
              className="bg-[#222230] border border-[#2d2d3e] rounded-lg px-1.5 py-1 text-[11px] text-white shrink-0 w-[108px]"
            />
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => onOpenWorkout(s)}>
              <p className={cn(
                'text-sm font-medium truncate',
                s.overgeslagen ? 'line-through text-[#55556a]' : 'text-white'
              )}>
                {sessieEmoji(s)} {s.beschrijving}
              </p>
              {(s.duur_minuten || (s.afstand_km ?? 0) > 0) && (
                <p className="text-[11px] text-[#55556a]">
                  {s.duur_minuten ? formatDuur(s.duur_minuten) : ''}
                  {s.duur_minuten && s.afstand_km ? ' · ' : ''}
                  {s.afstand_km ? `${s.afstand_km} km` : ''}
                </p>
              )}
            </div>
            <button onClick={() => onVerwijderen(s.id)} className="shrink-0 p-1 text-[#55556a]">
              <X size={16} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ── Hoofdcomponent ─────────────────────────────────────────────────────────────
export function SchemaClient({ sessies: initSessies, doel, wilCore, heeftFysio }: Props) {
  const supabase = createClient()
  const vandaag = new Date().toISOString().split('T')[0]
  // Volgende maandag — sessies vóór die datum (deze week + verleden) mogen afgevinkt worden
  const volgendeWeekMaandag = (() => {
    const d = new Date(); const dag = d.getDay()
    d.setDate(d.getDate() - (dag === 0 ? 6 : dag - 1) + 7)
    return d.toISOString().split('T')[0]
  })()
  const [sessies, setSessies] = useState(initSessies)
  const [genereert, setGenereert] = useState(false)
  const [importeert, setImporteert] = useState(false)
  const [actieveWeekIndex, setActieveWeekIndex] = useState(0)
  const [uitleg, setUitleg] = useState('')
  const [fout, setFout] = useState('')
  const [foutTekst, setFoutTekst] = useState('')
  const [roosterSessie, setRoosterSessie] = useState<TrainingSession | null>(null)
  const [workoutSessie, setWorkoutSessie] = useState<TrainingSession | null>(null)
  const [weergave, setWeergave] = useState<'week' | 'agenda'>('week')

  const huidigeMaandag = (() => {
    const d = new Date(); const dag = d.getDay()
    d.setDate(d.getDate() - (dag === 0 ? 6 : dag - 1))
    return d.toISOString().split('T')[0]
  })()

  // Groepeer op kalenderweek (maandag van de week als sleutel) — niet op week_nummer
  // Zo verschijnen Strava-sessies en plan-sessies altijd in de juiste week
  const weken = useMemo(() => {
    function maandagVan(datum: string): string {
      const d = new Date(datum + 'T12:00:00')
      const dag = d.getDay()
      d.setDate(d.getDate() - (dag === 0 ? 6 : dag - 1))
      return d.toISOString().split('T')[0]
    }
    const map = new Map<string, typeof sessies>()
    sessies.forEach(s => {
      const ma = maandagVan(s.datum)
      if (!map.has(ma)) map.set(ma, [])
      map.get(ma)!.push(s)
    })
    // Weeknummer = positie in gesorteerde lijst (1-based) voor weergave
    const gesorteerd = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
    return gesorteerd.map(([maandag, wSessies], i) => ({
      weekNr: i + 1,
      maandag,
      sessies: wSessies.sort((a, b) => a.datum.localeCompare(b.datum)),
    }))
  }, [sessies])

  // Spring naar de week van vandaag; als vandaag niet in het schema voorkomt
  // (schema loopt achter of is nog niet zo ver), val terug op de eerste
  // week met openstaande sessies
  useEffect(() => {
    if (weken.length === 0) return
    const idxVandaag = weken.findIndex(w => w.maandag === huidigeMaandag)
    if (idxVandaag !== -1) {
      setActieveWeekIndex(idxVandaag)
      return
    }
    const idx = weken.findIndex(w =>
      w.sessies.some(s => !s.voltooid && !s.overgeslagen && s.type !== 'rust')
    )
    setActieveWeekIndex(Math.max(0, idx === -1 ? 0 : idx))
  }, [weken.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const actieveWeek = weken[actieveWeekIndex]
  const weekSessies = actieveWeek?.sessies ?? []
  const actieveWeekNr = actieveWeek?.weekNr ?? 0

  // Week statistieken (alleen trainingsessies, niet rust)
  const weekStats = useMemo(() => {
    const trainingen = weekSessies.filter(s => s.type !== 'rust')
    const totalKm = trainingen.reduce((sum, s) => sum + (s.afstand_km ?? 0), 0)
    const totalMin = trainingen.reduce((sum, s) => sum + (s.duur_minuten ?? 0), 0)
    const gedaan = trainingen.filter(s => s.voltooid).length
    const open = trainingen.filter(s => !s.voltooid && !s.overgeslagen).length
    return { totalKm: Math.round(totalKm * 10) / 10, totalMin, gedaan, open, total: trainingen.length }
  }, [weekSessies])

  // Algehele plan-statistieken (heel schema, niet alleen actieve week)
  const algeheleStats = useMemo(() => {
    const trainingen = sessies.filter(s => s.type !== 'rust')
    const gedaan = trainingen.filter(s => s.voltooid).length
    const kmGedaan = trainingen.filter(s => s.voltooid).reduce((sum, s) => sum + (s.afstand_km ?? 0), 0)
    const kmGepland = trainingen.reduce((sum, s) => sum + (s.afstand_km ?? 0), 0)
    const wekenVerstreken = weken.filter(w => w.maandag < huidigeMaandag).length
    const dagenTotWedstrijd = doel
      ? Math.ceil((new Date(doel.datum + 'T12:00:00').getTime() - Date.now()) / 86400000)
      : null
    return {
      gedaan,
      totaal: trainingen.length,
      kmGedaan: Math.round(kmGedaan * 10) / 10,
      kmGepland: Math.round(kmGepland * 10) / 10,
      wekenTeGaan: Math.max(0, weken.length - wekenVerstreken),
      dagenTotWedstrijd,
    }
  }, [sessies, weken, huidigeMaandag, doel])

  // Simpel inzicht op basis van gemiste trainingen per intensiteit
  const inzicht = useMemo(() => {
    const gemist = sessies.filter(s => s.overgeslagen && s.type !== 'rust')
    if (gemist.length === 0) {
      if (algeheleStats.gedaan > 0) return `Sterk bezig — je hebt nog geen enkele training gemist.`
      return null
    }
    const perIntensiteit = new Map<string, number>()
    gemist.forEach(s => {
      const key = s.intensiteit ?? 'onbekend'
      perIntensiteit.set(key, (perIntensiteit.get(key) ?? 0) + 1)
    })
    const [meestGemist, aantal] = Array.from(perIntensiteit.entries()).sort((a, b) => b[1] - a[1])[0]
    return `Je hebt tot nu toe ${gemist.length} training${gemist.length === 1 ? '' : 'en'} gemist, vooral van het type "${meestGemist}" (${aantal}×).`
  }, [sessies, algeheleStats.gedaan])

  // Dag-dots (Ma t/m Zo)
  const dagDots = useMemo(() =>
    DAG_LABELS.map((label, i) => {
      const sessie = weekSessies.find(s => datumToDagIndex(s.datum) === i)
      return { label, sessie }
    }),
    [weekSessies]
  )

  // ── Acties ──────────────────────────────────────────────────────────────────
  async function markeerGedaan(id: string) {
    setSessies(prev => prev.map(s => s.id === id ? { ...s, voltooid: true } : s))
    await supabase.from('training_sessions').update({ voltooid: true } as never).eq('id', id)
  }

  async function ongedaanMaken(id: string) {
    setSessies(prev => prev.map(s => s.id === id ? { ...s, voltooid: false, overgeslagen: false } : s))
    await supabase.from('training_sessions').update({ voltooid: false, overgeslagen: false } as never).eq('id', id)
  }

  async function verwijderSessie(id: string) {
    setSessies(prev => prev.filter(s => s.id !== id))
    await supabase.from('training_sessions').delete().eq('id', id)
  }

  async function markeerOvergeslagen(id: string) {
    setSessies(prev => prev.map(s => s.id === id ? { ...s, overgeslagen: true } : s))
    await supabase.from('training_sessions').update({ overgeslagen: true } as never).eq('id', id)
    // Stille achtergrond-aanpassing — geen blokkerende UI-update nodig op schema
    fetch('/api/training/aanpassen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessie_id: id, rating: 'overgeslagen' }),
    }).catch(() => {})
  }

  function handleGemist(sessie: TrainingSession) {
    const isKritiek = ['interval', 'zwaar'].includes(sessie.intensiteit ?? '')
    if (isKritiek) {
      // Ren-patroon: bied reschedule aan voor zware sessies
      setRoosterSessie(sessie)
    } else {
      markeerOvergeslagen(sessie.id)
    }
  }

  async function handleVerplaatsen(id: string, nieuwDatum: string) {
    // Zoek week_nummer van de doelweek op basis van bestaande sessies
    const maandag = new Date(nieuwDatum + 'T12:00:00')
    const dow = maandag.getDay()
    maandag.setDate(maandag.getDate() - (dow === 0 ? 6 : dow - 1))
    const zondag = new Date(maandag)
    zondag.setDate(zondag.getDate() + 6)
    const maDatum = maandag.toISOString().split('T')[0]
    const zoDatum = zondag.toISOString().split('T')[0]

    const doelWeekNr = sessies.find(s => s.datum >= maDatum && s.datum <= zoDatum)?.week_nummer ?? actieveWeekNr

    setSessies(prev =>
      prev.map(s => s.id === id
        ? { ...s, datum: nieuwDatum, week_nummer: doelWeekNr, overgeslagen: false }
        : s
      )
    )
    await supabase
      .from('training_sessions')
      .update({ datum: nieuwDatum, week_nummer: doelWeekNr } as never)
      .eq('id', id)
    setRoosterSessie(null)
  }

  async function handleLatenVervallen(id: string) {
    await markeerOvergeslagen(id)
    setRoosterSessie(null)
  }

  async function importeerPdfSchema() {
    if (!confirm('Dit vervangt je huidige schema met het volledige plan (opbouwfase + 14-weeks PDF-schema). Hockey en vakanties worden automatisch verwerkt. Doorgaan?')) return
    setImporteert(true)
    setFout('')
    try {
      const res = await fetch('/api/training/import-volledig', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setFout(data.error ?? 'Import mislukt'); setImporteert(false); return }
      setUitleg(data.bericht ?? 'Schema geïmporteerd!')
      window.location.reload()
    } catch (e) {
      setFout(String(e))
      setImporteert(false)
    }
  }

  async function genereerSchema() {
    setGenereert(true)
    setFout('')
    try {
      const res = await fetch('/api/training/import-volledig', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setFout(data.error ?? 'Onbekende fout')
        setFoutTekst(data.tekst ?? '')
        setGenereert(false)
        return
      }
      if (data.uitleg) setUitleg(data.uitleg)
      window.location.reload()
    } catch (e) {
      setFout(String(e))
      setGenereert(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-5 p-4 pt-8 pb-24 bg-[#111118] min-h-screen">

      {/* Paginaheader */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-white">Trainingsschema</h1>
          {doel && <p className="text-sm text-[#8888a8] mt-0.5">{doel.naam}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          {sessies.length > 0 && (
            <button
              onClick={() => window.open('/api/training/ical', '_blank')}
              className="p-2 rounded-xl border border-[#2d2d3e] text-[#8888a8] hover:border-[#3d3d50] transition-colors"
              title="Exporteer naar agenda"
            >
              <Calendar size={16} />
            </button>
          )}
          <Button variant="secondary" size="sm" onClick={importeerPdfSchema} disabled={importeert || genereert}>
            {importeert ? <Loader2 size={15} className="animate-spin mr-1.5" /> : <span className="mr-1.5 text-sm">📄</span>}
            {importeert ? 'Bezig...' : 'Importeren'}
          </Button>
          <button
            onClick={genereerSchema}
            disabled={genereert || importeert}
            className="p-2 rounded-xl border border-[#2d2d3e] text-[#8888a8] hover:border-[#3d3d50] transition-colors disabled:opacity-40"
            title="Opnieuw genereren"
          >
            {genereert ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </button>
        </div>
      </div>

      {/* Meldingen */}
      {uitleg && (
        <Card className="bg-[#f97316]/10 border border-[#f97316]/20">
          <p className="text-sm text-[#f97316]">💡 {uitleg}</p>
        </Card>
      )}
      {fout && (
        <Card className="bg-red-950 border border-red-800">
          <p className="text-sm font-medium text-red-400 mb-1">Schema genereren mislukt</p>
          <p className="text-xs text-red-500 font-mono break-all">{fout}</p>
          {foutTekst && <p className="text-xs text-red-600 font-mono break-all mt-1 border-t border-red-900 pt-1">{foutTekst}</p>}
        </Card>
      )}

      {/* Leeg schema */}
      {sessies.length === 0 ? (
        <Card className="text-center py-12 bg-[#1b1b27] border-[#2d2d3e]">
          <div className="text-5xl mb-3">📅</div>
          <h3 className="font-semibold text-white mb-1">Geen schema aangemaakt</h3>
          <p className="text-sm text-[#8888a8] mb-5">
            Importeer het volledige plan — opbouwfase + PDF-schema, rekening houdend met hockey en vakanties.
          </p>
          <div className="flex gap-2 justify-center flex-wrap">
            <Button onClick={importeerPdfSchema} loading={importeert}>📄 Slim importeren</Button>
            <Button variant="secondary" onClick={genereerSchema} loading={genereert}>AI-schema genereren</Button>
          </div>
        </Card>
      ) : (
        <>
          {/* ── Planoverzicht: racebadge, stats, inzicht, voortgangsdots ───── */}
          {doel && (
            <Card className="!p-0 overflow-hidden">
              <div className="p-4 pb-3 border-b border-[#2d2d3e] flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#f97316] to-[#ea6c0a] flex items-center justify-center text-xl shrink-0">
                  🏁
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{doel.naam}</p>
                  <p className="text-xs text-[#8888a8]">
                    {algeheleStats.dagenTotWedstrijd != null && algeheleStats.dagenTotWedstrijd >= 0
                      ? `${algeheleStats.dagenTotWedstrijd} dagen te gaan`
                      : 'Wedstrijddag geweest'}
                    {doel.tijdsdoel && ` · doel ${doel.tijdsdoel}`}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 divide-x divide-[#2d2d3e] border-b border-[#2d2d3e]">
                <div className="p-3 text-center">
                  <p className="text-base font-bold text-white">{algeheleStats.gedaan}/{algeheleStats.totaal}</p>
                  <p className="text-[10px] text-[#55556a] uppercase tracking-wide">Trainingen</p>
                </div>
                <div className="p-3 text-center">
                  <p className="text-base font-bold text-white">{algeheleStats.kmGedaan}/{algeheleStats.kmGepland}</p>
                  <p className="text-[10px] text-[#55556a] uppercase tracking-wide">Km</p>
                </div>
                <div className="p-3 text-center">
                  <p className="text-base font-bold text-white">{algeheleStats.wekenTeGaan}</p>
                  <p className="text-[10px] text-[#55556a] uppercase tracking-wide">Weken te gaan</p>
                </div>
              </div>

              {inzicht && (
                <div className="px-4 py-3 border-b border-[#2d2d3e]">
                  <p className="text-xs text-[#8888a8] leading-snug">💡 {inzicht}</p>
                </div>
              )}

              <div className="p-4">
                <p className="text-[10px] font-semibold text-[#55556a] uppercase tracking-wide mb-2">Voortgang per week</p>
                <div className="flex gap-1.5 flex-wrap">
                  {weken.map((w, i) => {
                    const trainingen = w.sessies.filter(s => s.type !== 'rust')
                    const gedaan = trainingen.filter(s => s.voltooid).length
                    const heeftOpen = trainingen.some(s => !s.voltooid && !s.overgeslagen)
                    const isCompleet = trainingen.length > 0 && trainingen.every(s => s.voltooid || s.overgeslagen)
                    const isVerleden = w.maandag < huidigeMaandag
                    const isHuidig = i === actieveWeekIndex
                    let kleur = '#2d2d3e'
                    if (isCompleet) kleur = '#4ade80'
                    else if (isVerleden && heeftOpen) kleur = '#f43f5e'
                    else if (gedaan > 0) kleur = '#f97316'
                    return (
                      <button
                        key={w.weekNr}
                        onClick={() => { setWeergave('week'); setActieveWeekIndex(i) }}
                        title={`Week ${w.weekNr} — ${weekDateRange(w.maandag)}`}
                        className={cn(
                          'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all',
                          isHuidig && weergave === 'week' && 'ring-2 ring-white ring-offset-1 ring-offset-[#1b1b27]',
                        )}
                        style={{ backgroundColor: `${kleur}30`, color: kleur, border: `1.5px solid ${kleur}` }}
                      >
                        {w.weekNr}
                      </button>
                    )
                  })}
                </div>
              </div>
            </Card>
          )}

          <TempoZonesCard />

          {/* ── Weergave-toggle: week-detail vs volledige agenda ─────────────── */}
          <div className="flex gap-1 p-1 bg-[#1b1b27] border border-[#2d2d3e] rounded-2xl">
            <button
              onClick={() => setWeergave('week')}
              className={cn('flex-1 py-2 rounded-xl text-xs font-semibold transition-colors', weergave === 'week' ? 'bg-white text-black' : 'text-[#8888a8]')}
            >
              Week
            </button>
            <button
              onClick={() => setWeergave('agenda')}
              className={cn('flex-1 py-2 rounded-xl text-xs font-semibold transition-colors', weergave === 'agenda' ? 'bg-white text-black' : 'text-[#8888a8]')}
            >
              Agenda
            </button>
          </div>

          {weergave === 'agenda' ? (
            <AgendaWeergave
              sessies={sessies}
              onDatumChange={handleVerplaatsen}
              onVerwijderen={verwijderSessie}
              onToggleVoltooid={s => s.voltooid ? ongedaanMaken(s.id) : markeerGedaan(s.id)}
              onOpenWorkout={setWorkoutSessie}
            />
          ) : (
          <>
          {/* ── Week navigatie ──────────────────────────────────────────────── */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActieveWeekIndex(i => Math.max(0, i - 1))}
              disabled={actieveWeekIndex === 0}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-[#8888a8] disabled:opacity-25 hover:bg-[#222230] transition-colors"
            >
              <ChevronLeft size={18} />
            </button>

            <div className="flex-1 text-center">
              <p className="text-xs font-semibold text-[#55556a] uppercase tracking-wide">Week {actieveWeekNr}</p>
              <p className="text-sm font-bold text-white">{weekDateRange(actieveWeek?.maandag ?? '')}</p>
            </div>

            <button
              onClick={() => setActieveWeekIndex(i => Math.min(weken.length - 1, i + 1))}
              disabled={actieveWeekIndex === weken.length - 1}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-[#8888a8] disabled:opacity-25 hover:bg-[#222230] transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* ── Week stats ──────────────────────────────────────────────────── */}
          <div className="flex justify-between text-xs text-[#55556a] -mt-2">
            <div className="flex gap-3">
              {weekStats.totalKm > 0 && (
                <span className="flex items-center gap-1"><MapPin size={11} />{weekStats.totalKm} km</span>
              )}
              {weekStats.totalMin > 0 && (
                <span className="flex items-center gap-1"><Timer size={11} />{formatDuur(weekStats.totalMin)}</span>
              )}
            </div>
            <div className="flex gap-3">
              {weekStats.gedaan > 0 && (
                <span className="flex items-center gap-1 text-green-400"><CheckCircle2 size={11} /> {weekStats.gedaan} gedaan</span>
              )}
              {weekStats.open > 0 && <span>{weekStats.open} te doen</span>}
            </div>
          </div>

          {/* ── Dag-dots overzicht (Ren-stijl) ──────────────────────────────── */}
          <div className="flex gap-1 justify-between px-1">
            {dagDots.map(({ label, sessie }, i) => {
              const isGedaan = sessie?.voltooid
              const isOvergeslagen = sessie?.overgeslagen
              const isRust = sessie?.type === 'rust'
              const kleur = sessie && !isRust
                ? (KLEUR[sessie.intensiteit ?? 'makkelijk'] ?? KLEUR.makkelijk)
                : RUST_KLEUR

              return (
                <div key={i} className="flex flex-col items-center gap-1.5">
                  <div
                    className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center text-sm transition-all',
                      isGedaan && 'ring-2 ring-green-400 ring-offset-1',
                      isOvergeslagen && 'opacity-35',
                    )}
                    style={{
                      backgroundColor: sessie && !isRust ? `${kleur.bar}20` : '#1b1b27',
                      border: `2px solid ${sessie && !isRust ? kleur.bar : '#2d2d3e'}`,
                    }}
                  >
                    {isGedaan ? (
                      <CheckCircle2 size={14} className="text-green-500" />
                    ) : isOvergeslagen ? (
                      <XCircle size={14} className="text-[#c8c3bc]" />
                    ) : sessie && !isRust ? (
                      <span>{sessieEmoji(sessie)}</span>
                    ) : null}
                  </div>
                  <span className="text-[10px] text-[#55556a] font-medium">{label}</span>
                </div>
              )
            })}
          </div>

          {/* ── Sessie-kaarten (Ren-stijl) ──────────────────────────────────── */}
          <div className="flex flex-col gap-2.5">
            {weekSessies.map(sessie => {
              const isGedaan = sessie.voltooid
              const isOvergeslagen = sessie.overgeslagen
              const isRust = sessie.type === 'rust'
              const kleur = isRust ? RUST_KLEUR : (KLEUR[sessie.intensiteit ?? 'makkelijk'] ?? KLEUR.makkelijk)

              // Rustdagen compact tonen
              if (isRust) {
                const heeftExtra = wilCore || heeftFysio
                return (
                  <div
                    key={sessie.id}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[#1b1b27] border border-[#2d2d3e]"
                  >
                    <div className="w-10 shrink-0 text-center">
                      <p className="text-[10px] font-semibold text-[#3d3d50] uppercase">{dagAfkVanDatum(sessie.datum)}</p>
                      <p className="text-base font-bold text-[#3d3d50]">{dagNummerVanDatum(sessie.datum)}</p>
                    </div>
                    <p className="text-sm text-[#3d3d50] flex-1">Rustdag</p>
                    {heeftExtra && (
                      <div className="flex gap-1">
                        {wilCore && <span className="text-xs bg-[#06b6d4]/10 text-[#06b6d4] px-1.5 py-0.5 rounded-lg font-medium">🧘</span>}
                        {heeftFysio && <span className="text-xs bg-[#f97316]/10 text-[#f97316] px-1.5 py-0.5 rounded-lg font-medium">💊</span>}
                      </div>
                    )}
                  </div>
                )
              }

              // Gesynchroniseerde/gelogde activiteit (Strava/Runkeeper): neutrale kaartstijl
              if (sessie.runkeeper_id) {
                const routePolyline = (sessie.session_feedback?.[0] as { route_polyline?: string | null } | undefined)?.route_polyline
                return (
                  <div
                    key={sessie.id}
                    className="rounded-2xl bg-[#1b1b27] border border-[#2d2d3e] overflow-hidden"
                  >
                    <div className="flex">
                      <div className="w-12 shrink-0 flex flex-col items-center justify-center py-4 gap-0.5 bg-[#22222e]">
                        <span className="text-[10px] font-bold uppercase text-[#8888a8]">
                          {dagAfkVanDatum(sessie.datum)}
                        </span>
                        <span className="text-xl font-bold text-white leading-none">
                          {dagNummerVanDatum(sessie.datum)}
                        </span>
                      </div>
                      <div className="flex-1 flex flex-col min-w-0">
                        <div className="h-1.5 w-full bg-[#55556a]" />
                        <div className="p-3">
                          <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#222230] text-[#8888a8] uppercase tracking-wide mb-2">
                            🔗 Gesynchroniseerd
                          </span>
                          <p className="text-sm font-semibold text-white mb-2 truncate">
                            {sessieEmoji(sessie)} {sessie.beschrijving}
                          </p>
                          {routePolyline && (
                            <div className="w-full h-14 rounded-lg bg-[#222230] mb-2 overflow-hidden">
                              <RouteThumbnail polyline={routePolyline} className="w-full h-full" />
                            </div>
                          )}
                          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#2d2d3e]">
                            <div>
                              <p className="text-sm font-bold text-white">{sessie.afstand_km ?? '–'} km</p>
                              <p className="text-[10px] text-[#55556a] uppercase">Afstand</p>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">
                                {sessie.duur_minuten ? formatDuur(sessie.duur_minuten) : '–'}
                              </p>
                              <p className="text-[10px] text-[#55556a] uppercase">Tijd</p>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">
                                {berekenTempo(sessie.duur_minuten, sessie.afstand_km)}
                              </p>
                              <p className="text-[10px] text-[#55556a] uppercase">Gem. tempo</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              }

              return (
                <div
                  key={sessie.id}
                  className={cn(
                    'rounded-2xl bg-[#1b1b27] border border-[#2d2d3e] overflow-hidden transition-opacity',
                    (isGedaan || isOvergeslagen) && 'opacity-55',
                  )}
                >
                  <div className="flex">
                    {/* Dag kolom */}
                    <div
                      className="w-12 shrink-0 flex flex-col items-center justify-center py-4 gap-0.5"
                      style={{ backgroundColor: `${kleur.bar}15` }}
                    >
                      <span className="text-[10px] font-bold uppercase" style={{ color: kleur.bar }}>
                        {dagAfkVanDatum(sessie.datum)}
                      </span>
                      <span className="text-xl font-bold text-white leading-none">
                        {dagNummerVanDatum(sessie.datum)}
                      </span>
                    </div>

                    {/* Sessie content */}
                    <div className="flex-1 flex flex-col min-w-0">
                      {/* Intensiteitsbar (Ren-stijl) */}
                      <div className="h-1.5 w-full" style={{ backgroundColor: kleur.bar }} />

                      <div className="p-3 pb-2 cursor-pointer" onClick={() => setWorkoutSessie(sessie)}>
                        {/* Naam + badge */}
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className={cn(
                            'text-sm font-semibold leading-snug flex-1',
                            isOvergeslagen ? 'line-through text-[#55556a]' : 'text-white'
                          )}>
                            {sessieEmoji(sessie)} {sessie.beschrijving}
                          </p>
                          <div className="flex items-center gap-1 shrink-0">
                            {isGedaan && <CheckCircle2 size={14} className="text-green-500" />}
                            {isOvergeslagen && <XCircle size={14} className="text-[#a09990]" />}
                          </div>
                        </div>

                        {/* Meta info */}
                        <div className="flex items-center gap-3 flex-wrap">
                          {sessie.duur_minuten != null && (
                            <span className="flex items-center gap-1 text-xs text-[#55556a]">
                              <Timer size={10} />{formatDuur(sessie.duur_minuten)}
                            </span>
                          )}
                          {sessie.afstand_km != null && sessie.afstand_km > 0 && (
                            <span className="flex items-center gap-1 text-xs text-[#55556a]">
                              <MapPin size={10} />{sessie.afstand_km} km
                            </span>
                          )}
                          <div className="flex gap-1 ml-auto">
                            {sessie.intensiteit && (
                              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-semibold', kleur.badge)}>
                                {sessie.intensiteit}
                              </span>
                            )}
                            {wilCore && sessie.type === 'hardlopen' && (
                              <span className="text-[10px] bg-[#06b6d4]/10 text-[#06b6d4] px-1.5 py-0.5 rounded-full font-medium">🧘</span>
                            )}
                            {heeftFysio && sessie.type === 'hardlopen' && (
                              <span className="text-[10px] bg-[#f97316]/10 text-[#f97316] px-1.5 py-0.5 rounded-full font-medium">💊</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actieknoppen */}
                      {(isOvergeslagen || isGedaan) && (
                        <div className="flex border-t border-[#2d2d3e]">
                          <button
                            onClick={() => ongedaanMaken(sessie.id)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-[#8888a8] active:bg-[#222230] transition-colors"
                          >
                            <XCircle size={14} /> Ongedaan maken
                          </button>
                          <div className="w-px bg-[#2d2d3e]" />
                          <button
                            onClick={() => verwijderSessie(sessie.id)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-red-500 active:bg-red-950 transition-colors"
                          >
                            Verwijderen
                          </button>
                        </div>
                      )}
                      {!isGedaan && !isOvergeslagen && sessie.datum < volgendeWeekMaandag && (
                        <div className="flex border-t border-[#2d2d3e]">
                          <button
                            onClick={() => markeerGedaan(sessie.id)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-green-400 active:bg-green-950 transition-colors"
                          >
                            <CheckCircle2 size={14} /> Gedaan
                          </button>
                          <div className="w-px bg-[#2d2d3e]" />
                          <button
                            onClick={() => handleGemist(sessie)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-[#8888a8] active:bg-[#222230] transition-colors"
                          >
                            <XCircle size={14} /> Gemist
                          </button>
                          {!sessie.runkeeper_id && (
                            <>
                              <div className="w-px bg-[#2d2d3e]" />
                              <button
                                onClick={() => verwijderSessie(sessie.id)}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium text-red-500 active:bg-red-950 transition-colors"
                              >
                                Verwijderen
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          </>
          )}
        </>
      )}

      {/* Reschedule bottom sheet */}
      {roosterSessie && (
        <RoosterModal
          sessie={roosterSessie}
          alleSessies={sessies}
          onVerplaatsen={handleVerplaatsen}
          onLatenVervallen={handleLatenVervallen}
          onSluiten={() => setRoosterSessie(null)}
        />
      )}

      {/* Workout-detailweergave */}
      {workoutSessie && (
        <WorkoutModal
          beschrijving={workoutSessie.beschrijving}
          duur_minuten={workoutSessie.duur_minuten}
          afstand_km={workoutSessie.afstand_km}
          intensiteit={workoutSessie.intensiteit}
          onSluiten={() => setWorkoutSessie(null)}
        />
      )}
    </div>
  )
}
