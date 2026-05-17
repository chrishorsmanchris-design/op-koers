'use client'
import { useState, useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn, formatDuur, korteDatum } from '@/lib/utils'
import type { Goal, TrainingSession } from '@/types/database'
import { Loader2, RefreshCw, GripVertical, MapPin, Timer, CheckCircle2 } from 'lucide-react'
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
  herstel: 'bg-blue-500/20 text-blue-300',
  makkelijk: 'bg-green-500/20 text-green-300',
  gemiddeld: 'bg-yellow-500/20 text-yellow-300',
  zwaar: 'bg-orange-500/20 text-orange-300',
  interval: 'bg-red-500/20 text-red-300',
}

const TYPE_EMOJI: Record<string, string> = {
  hardlopen: '🏃',
  rust: '😴',
  krachttraining: '💪',
  cross: '🚴',
}

function SortableSessie({ sessie }: { sessie: TrainingSession }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sessie.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('flex gap-3 items-start', isDragging && 'opacity-50 z-50')}
    >
      <button {...attributes} {...listeners} className="mt-4 text-[#6b7280] touch-none">
        <GripVertical size={18} />
      </button>
      <Card className={cn('flex-1', sessie.voltooid && 'opacity-60')}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-medium text-[#6b7280]">
                {TYPE_EMOJI[sessie.type]} {korteDatum(sessie.datum)}
              </span>
              {sessie.intensiteit && (
                <span className={cn('text-xs px-2 py-0.5 rounded-full', INTENSITEIT_KLEUR[sessie.intensiteit])}>
                  {sessie.intensiteit}
                </span>
              )}
              {sessie.voltooid && <CheckCircle2 size={14} className="text-green-400" />}
            </div>
            <p className="text-sm font-semibold text-white">{sessie.beschrijving}</p>
            <div className="flex gap-3 mt-1 text-xs text-[#6b7280]">
              {sessie.duur_minuten && <span className="flex items-center gap-1"><Timer size={12} />{formatDuur(sessie.duur_minuten)}</span>}
              {sessie.afstand_km && <span className="flex items-center gap-1"><MapPin size={12} />{sessie.afstand_km} km</span>}
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

export function SchemaClient({ sessies: initSessies, doel, userId }: Props) {
  const supabase = createClient()
  const [sessies, setSessies] = useState(initSessies)
  const [genereert, setGenereert] = useState(false)
  const [geselecteerdeWeek, setGeselecteerdeWeek] = useState<number | null>(null)
  const [uitleg, setUitleg] = useState('')

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
  const defaultWeek = geselecteerdeWeek ?? huidigWeek

  const weekSessies = sessies
    .filter(s => s.week_nummer === defaultWeek)
    .sort((a, b) => new Date(a.datum).getTime() - new Date(b.datum).getTime())

  async function genereerSchema() {
    setGenereert(true)
    const res = await fetch('/api/training/genereer', { method: 'POST' })
    const data = await res.json()
    if (data.uitleg) setUitleg(data.uitleg)
    window.location.reload()
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oudIndex = weekSessies.findIndex(s => s.id === active.id)
    const nieuwIndex = weekSessies.findIndex(s => s.id === over.id)
    const nieuwVolgorde = arrayMove(weekSessies, oudIndex, nieuwIndex)

    // Datums wisselen
    const oudeData = weekSessies.map(s => ({ id: s.id, datum: s.datum }))
    const nieuweVolgorde = nieuwVolgorde.map((s, i) => ({ ...s, datum: oudeData[i].datum }))

    setSessies(prev => prev.map(s => {
      const update = nieuweVolgorde.find(n => n.id === s.id)
      return update ? { ...s, datum: update.datum } : s
    }))

    // Opslaan
    await Promise.all(
      nieuweVolgorde.map(s =>
        supabase.from('training_sessions').update({ datum: s.datum } as never).eq('id', s.id)
      )
    )
  }

  return (
    <div className="flex flex-col gap-5 p-4 pt-8">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-white">Trainingsschema</h1>
          {doel && <p className="text-sm text-[#6b7280] mt-1">{doel.naam}</p>}
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

      {sessies.length === 0 ? (
        <Card className="text-center py-12">
          <div className="text-5xl mb-3">📅</div>
          <h3 className="font-semibold text-white mb-1">Geen schema aangemaakt</h3>
          <p className="text-sm text-[#6b7280] mb-4">Klik op &quot;Genereer&quot; om jouw schema te laten maken</p>
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
                  (geselecteerdeWeek ?? huidigWeek) === week
                    ? 'bg-[#f97316] text-white'
                    : 'bg-[#242424] text-[#9ca3af]'
                )}
              >
                Week {week}
              </button>
            ))}
          </div>

          {/* Sessies met drag-drop */}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={weekSessies.map(s => s.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {weekSessies.map(sessie => (
                  <SortableSessie key={sessie.id} sessie={sessie} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  )
}
