'use client'
import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn, formatDuur, dagKorteDatum } from '@/lib/utils'
import type { Goal, TrainingSession } from '@/types/database'
import { Loader2, RefreshCw, GripVertical, MapPin, Timer, CheckCircle2, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createClient } from '@/lib/supabase/client'

interface Props {
  sessies: (TrainingSession & { session_feedback: unknown[] })[]
  doel: Goal | null
  userId: string
}

const INTENSITEIT_KLEUR: Record<string, string> = {
  herstel: 'bg-blue-100 text-blue-700',
  makkelijk: 'bg-green-100 text-green-700',
  gemiddeld: 'bg-yellow-100 text-yellow-700',
  zwaar: 'bg-orange-100 text-orange-700',
  interval: 'bg-red-100 text-red-700',
}

const TYPE_EMOJI: Record<string, string> = {
  hardlopen: '🏃',
  rust: '😴',
  krachttraining: '💪',
  cross: '🚴',
  core: '🧘',
}

interface SortableSessieProps {
  sessie: TrainingSession
  onGedaan: (id: string) => void
  onOvergeslagen: (id: string) => void
}

function SortableSessie({ sessie, onGedaan, onOvergeslagen }: SortableSessieProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sessie.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const [open, setOpen] = useState(false)

  const isOvergeslagen = sessie.overgeslagen
  const isGedaan = sessie.voltooid

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('flex gap-2 items-start', isDragging && 'opacity-50 z-50')}
    >
      {/* Drag handle — alleen tonen als niet afgerond/overgeslagen */}
      {!isGedaan && !isOvergeslagen ? (
        <button {...attributes} {...listeners} className="mt-5 text-[#c8c3bc] touch-none shrink-0">
          <GripVertical size={18} />
        </button>
      ) : (
        <div className="w-[18px] mt-5 shrink-0" />
      )}

      <Card className={cn(
        'flex-1 transition-all',
        isGedaan && 'opacity-50',
        isOvergeslagen && 'opacity-40',
      )}>
        {/* Header — altijd zichtbaar */}
        <button
          onClick={() => !isGedaan && !isOvergeslagen && setOpen(o => !o)}
          className="w-full text-left"
          disabled={isGedaan || isOvergeslagen}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="text-xs font-semibold text-[#a09990]">
                  {TYPE_EMOJI[sessie.type]} {dagKorteDatum(sessie.datum)}
                </span>
                {sessie.intensiteit && (
                  <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', INTENSITEIT_KLEUR[sessie.intensiteit])}>
                    {sessie.intensiteit}
                  </span>
                )}
                {isGedaan && <CheckCircle2 size={14} className="text-green-500" />}
                {isOvergeslagen && <XCircle size={14} className="text-[#a09990]" />}
              </div>
              <p className={cn('text-sm font-semibold', isOvergeslagen ? 'line-through text-[#a09990]' : 'text-[#1a1612]')}>
                {sessie.beschrijving}
              </p>
              <div className="flex gap-3 mt-1 text-xs text-[#a09990]">
                {sessie.duur_minuten != null && <span className="flex items-center gap-1"><Timer size={11} />{formatDuur(sessie.duur_minuten)}</span>}
                {sessie.afstand_km != null && sessie.afstand_km > 0 && <span className="flex items-center gap-1"><MapPin size={11} />{sessie.afstand_km} km</span>}
              </div>
            </div>
            {!isGedaan && !isOvergeslagen && (
              <div className="text-[#c8c3bc] shrink-0 mt-1">
                {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            )}
          </div>
        </button>

        {/* Acties — uitklapbaar */}
        {open && !isGedaan && !isOvergeslagen && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-[#f0ede8]">
            <button
              onClick={() => { onGedaan(sessie.id); setOpen(false) }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-green-50 text-green-700 text-sm font-medium border-2 border-green-200 transition-all active:scale-95"
            >
              <CheckCircle2 size={16} /> Gedaan
            </button>
            <button
              onClick={() => { onOvergeslagen(sessie.id); setOpen(false) }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-[#f5f3f0] text-[#6b6560] text-sm font-medium border-2 border-[#e8e3dc] transition-all active:scale-95"
            >
              <XCircle size={16} /> Overgeslagen
            </button>
          </div>
        )}
      </Card>
    </div>
  )
}

export function SchemaClient({ sessies: initSessies, doel }: Props) {
  const supabase = createClient()
  const [sessies, setSessies] = useState(initSessies)
  const [genereert, setGenereert] = useState(false)
  const [geselecteerdeWeek, setGeselecteerdeWeek] = useState<number | null>(null)
  const [uitleg, setUitleg] = useState('')
  const [fout, setFout] = useState('')
  const [foutTekst, setFoutTekst] = useState('')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const weken = useMemo(() => {
    const map = new Map<number, typeof sessies>()
    sessies.forEach(s => {
      const w = s.week_nummer ?? 0
      if (!map.has(w)) map.set(w, [])
      map.get(w)!.push(s)
    })
    return Array.from(map.entries()).sort(([a], [b]) => a - b)
  }, [sessies])

  const huidigWeek = weken[0]?.[0]
  const actieveWeek = geselecteerdeWeek ?? huidigWeek

  const weekSessies = sessies
    .filter(s => s.week_nummer === actieveWeek)
    .sort((a, b) => new Date(a.datum).getTime() - new Date(b.datum).getTime())

  async function markeerGedaan(id: string) {
    setSessies(prev => prev.map(s => s.id === id ? { ...s, voltooid: true } : s))
    await supabase.from('training_sessions').update({ voltooid: true } as never).eq('id', id)
  }

  async function markeerOvergeslagen(id: string) {
    setSessies(prev => prev.map(s => s.id === id ? { ...s, overgeslagen: true } : s))
    await supabase.from('training_sessions').update({ overgeslagen: true } as never).eq('id', id)
  }

  async function genereerSchema() {
    setGenereert(true)
    setFout('')
    try {
      const res = await fetch('/api/training/genereer', { method: 'POST' })
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

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oudIndex = weekSessies.findIndex(s => s.id === active.id)
    const nieuwIndex = weekSessies.findIndex(s => s.id === over.id)
    const nieuwVolgorde = arrayMove(weekSessies, oudIndex, nieuwIndex)

    // Datums rouleren zodat de trainingen op andere dagen vallen maar in dezelfde week blijven
    const oudeData = weekSessies.map(s => s.datum)
    const nieuweVolgorde = nieuwVolgorde.map((s, i) => ({ ...s, datum: oudeData[i] }))

    setSessies(prev => prev.map(s => {
      const update = nieuweVolgorde.find(n => n.id === s.id)
      return update ? { ...s, datum: update.datum } : s
    }))

    await Promise.all(
      nieuweVolgorde.map(s =>
        supabase.from('training_sessions').update({ datum: s.datum } as never).eq('id', s.id)
      )
    )
  }

  // Weekvoortgang
  const gedaanInWeek = weekSessies.filter(s => s.voltooid).length
  const overgeslagenInWeek = weekSessies.filter(s => s.overgeslagen).length
  const openInWeek = weekSessies.filter(s => !s.voltooid && !s.overgeslagen).length

  return (
    <div className="flex flex-col gap-5 p-4 pt-8 pb-24">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-[#1a1612]">Trainingsschema</h1>
          {doel && <p className="text-sm text-[#6b6560] mt-1">{doel.naam}</p>}
        </div>
        <Button variant="secondary" size="sm" onClick={genereerSchema} disabled={genereert}>
          {genereert ? <Loader2 size={16} className="animate-spin mr-2" /> : <RefreshCw size={16} className="mr-2" />}
          {sessies.length === 0 ? 'Genereer' : 'Opnieuw'}
        </Button>
      </div>

      {uitleg && (
        <Card className="bg-[#f97316]/10 border border-[#f97316]/20">
          <p className="text-sm text-[#f97316]">💡 {uitleg}</p>
        </Card>
      )}
      {fout && (
        <Card className="bg-red-50 border border-red-200">
          <p className="text-sm font-medium text-red-700 mb-1">Schema genereren mislukt</p>
          <p className="text-xs text-red-500 font-mono break-all">{fout}</p>
          {foutTekst && <p className="text-xs text-red-400 font-mono break-all mt-1 border-t border-red-100 pt-1">{foutTekst}</p>}
        </Card>
      )}

      {sessies.length === 0 ? (
        <Card className="text-center py-12">
          <div className="text-5xl mb-3">📅</div>
          <h3 className="font-semibold text-[#1a1612] mb-1">Geen schema aangemaakt</h3>
          <p className="text-sm text-[#6b6560] mb-4">Klik op &quot;Genereer&quot; om jouw schema te laten maken</p>
          <Button onClick={genereerSchema} loading={genereert}>Schema genereren</Button>
        </Card>
      ) : (
        <>
          {/* Week selector */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {weken.map(([week]) => (
              <button
                key={week}
                onClick={() => setGeselecteerdeWeek(week)}
                className={cn(
                  'px-4 py-2 rounded-2xl text-sm font-medium whitespace-nowrap transition-all shrink-0',
                  actieveWeek === week
                    ? 'bg-[#f97316] text-white'
                    : 'bg-[#f0ede8] text-[#a09990]'
                )}
              >
                Week {week}
              </button>
            ))}
          </div>

          {/* Weekvoortgang */}
          {weekSessies.length > 0 && (
            <div className="flex gap-3 text-xs text-[#6b6560]">
              <span className="flex items-center gap-1"><CheckCircle2 size={12} className="text-green-500" /> {gedaanInWeek} gedaan</span>
              {overgeslagenInWeek > 0 && <span className="flex items-center gap-1"><XCircle size={12} className="text-[#a09990]" /> {overgeslagenInWeek} overgeslagen</span>}
              {openInWeek > 0 && <span>{openInWeek} nog te doen</span>}
            </div>
          )}

          {/* Hint */}
          {openInWeek > 1 && (
            <p className="text-xs text-[#a09990]">Versleep trainingen binnen de week om ze op een andere dag te doen.</p>
          )}

          {/* Sessies met drag-drop */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={weekSessies.map(s => s.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {weekSessies.map(sessie => (
                  <SortableSessie
                    key={sessie.id}
                    sessie={sessie}
                    onGedaan={markeerGedaan}
                    onOvergeslagen={markeerOvergeslagen}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  )
}
