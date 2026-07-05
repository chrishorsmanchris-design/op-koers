'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { TrainingSession } from '@/types/database'
import { X } from 'lucide-react'

const RATINGS = [
  { value: 'te_zwaar', label: 'Te zwaar', emoji: '😮‍💨', kleur: 'border-red-500 bg-red-500/10 text-red-400' },
  { value: 'zwaar', label: 'Zwaar', emoji: '😓', kleur: 'border-orange-500 bg-orange-500/10 text-orange-400' },
  { value: 'goed', label: 'Goed', emoji: '👍', kleur: 'border-yellow-500 bg-yellow-500/10 text-yellow-400' },
  { value: 'beter_dan_verwacht', label: 'Beter dan verwacht', emoji: '💪', kleur: 'border-blue-500 bg-blue-500/10 text-blue-400' },
  { value: 'topdag', label: 'Topdag!', emoji: '🔥', kleur: 'border-green-500 bg-green-500/10 text-green-400' },
]

interface Props {
  sessie: TrainingSession
  onSluit: (aangepast?: string) => void
}

export function FeedbackModal({ sessie, onSluit }: Props) {
  const supabase = createClient()
  const [rating, setRating] = useState('')
  const [notitie, setNotitie] = useState('')
  const [laden, setLaden] = useState(false)
  const [bevestiging, setBevestiging] = useState<string | null>(null)

  async function opslaan() {
    if (!rating) return
    setLaden(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('session_feedback').insert({
      session_id: sessie.id,
      user_id: user.id,
      rating: rating as never,
      notitie: notitie || null,
    })

    const needsAdjustment = ['te_zwaar', 'zwaar', 'beter_dan_verwacht', 'topdag'].includes(rating)
    if (needsAdjustment) {
      const res = await fetch('/api/training/aanpassen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessie_id: sessie.id, rating }),
      })
      const data = await res.json()
      if (data.aangepast && data.uitleg) {
        setBevestiging(data.uitleg)
        setLaden(false)
        setTimeout(() => onSluit(data.uitleg), 3500)
        return
      }
    }

    onSluit()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end z-50" onClick={() => onSluit()}>
      <div
        className="bg-[#1b1b27] border-t border-[#2d2d3e] rounded-t-3xl p-6 w-full max-w-lg mx-auto pb-10"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center -mt-2 mb-4">
          <div className="w-10 h-1 bg-[#2d2d3e] rounded-full" />
        </div>
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-lg font-bold text-white">Hoe ging het?</h3>
          <button onClick={() => onSluit()} className="text-[#55556a]"><X size={22} /></button>
        </div>

        <p className="text-sm text-[#8888a8] mb-4">{sessie.beschrijving}</p>

        <div className="grid grid-cols-1 gap-2 mb-4">
          {RATINGS.map(r => (
            <button
              key={r.value}
              onClick={() => setRating(r.value)}
              className={cn(
                'flex items-center gap-3 p-3 rounded-2xl border-2 transition-all text-left',
                rating === r.value ? r.kleur : 'border-[#2d2d3e] text-[#55556a]'
              )}
            >
              <span className="text-2xl">{r.emoji}</span>
              <span className="font-medium">{r.label}</span>
            </button>
          ))}
        </div>

        <textarea
          value={notitie}
          onChange={e => setNotitie(e.target.value)}
          placeholder="Notitie (optioneel)..."
          className="w-full bg-[#222230] border border-[#2d2d3e] rounded-2xl px-4 py-3 text-white placeholder:text-[#55556a] focus:outline-none focus:border-[#f97316] resize-none h-20 mb-4"
        />

        {bevestiging ? (
          <div className="rounded-2xl bg-green-950 border border-green-800 p-4 text-sm text-green-400">
            <p className="font-semibold mb-1">✅ Schema aangepast</p>
            <p>{bevestiging}</p>
          </div>
        ) : (
          <Button onClick={opslaan} size="lg" loading={laden} disabled={!rating}>
            Opslaan
          </Button>
        )}
      </div>
    </div>
  )
}
