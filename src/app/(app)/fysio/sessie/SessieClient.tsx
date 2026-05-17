'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { PhysioExercise } from '@/types/database'
import { ChevronLeft, ChevronRight, CheckCircle2, Timer, Play, Pause, RotateCcw, X } from 'lucide-react'

interface Props {
  oefeningen: PhysioExercise[]
}

const PIJN_OPTIES = [
  { label: 'Geen pijn', kleur: 'bg-green-100 text-green-700 border-green-300', waarde: 0 },
  { label: 'Lichte pijn', kleur: 'bg-yellow-100 text-yellow-700 border-yellow-300', waarde: 1 },
  { label: 'Veel pijn', kleur: 'bg-red-100 text-red-700 border-red-300', waarde: 2 },
]

function getYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
  return m ? m[1] : null
}

function CountdownTimer({ seconden, onKlaar }: { seconden: number; onKlaar?: () => void }) {
  const [resterend, setResterend] = useState(seconden)
  const [actief, setActief] = useState(false)
  const interval = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setResterend(seconden)
    setActief(false)
  }, [seconden])

  useEffect(() => {
    if (actief) {
      interval.current = setInterval(() => {
        setResterend(r => {
          if (r <= 1) {
            clearInterval(interval.current!)
            setActief(false)
            onKlaar?.()
            return 0
          }
          return r - 1
        })
      }, 1000)
    } else {
      if (interval.current) clearInterval(interval.current)
    }
    return () => { if (interval.current) clearInterval(interval.current) }
  }, [actief, onKlaar])

  const min = Math.floor(resterend / 60)
  const sec = resterend % 60

  return (
    <div className="flex flex-col items-center gap-3 py-4">
      <div className="text-5xl font-bold tabular-nums text-[#1a1612]">
        {min > 0 ? `${min}:${sec.toString().padStart(2, '0')}` : `${resterend}s`}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setActief(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#f97316] text-white font-medium"
        >
          {actief ? <Pause size={16} /> : <Play size={16} />}
          {actief ? 'Pauze' : resterend === seconden ? 'Start' : 'Hervat'}
        </button>
        <button
          onClick={() => { setResterend(seconden); setActief(false) }}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#f5f3f0] text-[#6b6560] border border-[#e8e3dc]"
        >
          <RotateCcw size={16} />
        </button>
      </div>
    </div>
  )
}

export function SessieClient({ oefeningen }: Props) {
  const router = useRouter()
  const [huidig, setHuidig] = useState(0)
  const [gedaan, setGedaan] = useState<Record<number, { pijn: number }>>({})
  const [pijnKeuze, setPijnKeuze] = useState<number | null>(null)
  const [afgerond, setAfgerond] = useState(false)

  const oefening = oefeningen[huidig]
  const totaal = oefeningen.length
  const isLaatste = huidig === totaal - 1
  const alGedaan = huidig in gedaan

  function markeerGedaan() {
    if (pijnKeuze === null) return
    setGedaan(prev => ({ ...prev, [huidig]: { pijn: pijnKeuze } }))
    if (isLaatste) {
      setAfgerond(true)
    } else {
      setPijnKeuze(null)
      setHuidig(h => h + 1)
    }
  }

  function navigeer(richting: 'voor' | 'achter') {
    setPijnKeuze(null)
    setHuidig(h => richting === 'voor' ? Math.min(h + 1, totaal - 1) : Math.max(h - 1, 0))
  }

  if (totaal === 0) {
    return (
      <div className="min-h-screen bg-[#f5f3f0] flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-[#6b6560] mb-4">Geen actieve oefeningen gevonden.</p>
          <button onClick={() => router.push('/fysio')} className="text-[#f97316] font-medium">
            Terug naar fysio
          </button>
        </div>
      </div>
    )
  }

  if (afgerond) {
    const pijnScores = Object.values(gedaan).map(g => g.pijn)
    const gemPijn = pijnScores.reduce((a, b) => a + b, 0) / pijnScores.length
    return (
      <div className="min-h-screen bg-[#f5f3f0] flex flex-col items-center justify-center p-6 gap-6">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 size={32} className="text-green-600" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-[#1a1612] mb-2">Sessie klaar!</h2>
          <p className="text-[#6b6560]">
            {totaal} oefeningen gedaan ·{' '}
            {gemPijn === 0 ? 'geen pijn' : gemPijn <= 1 ? 'lichte pijn' : 'pijn aanwezig'}
          </p>
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="w-full max-w-xs py-3 rounded-2xl bg-[#f97316] text-white font-semibold text-center"
        >
          Terug naar dashboard
        </button>
        <button
          onClick={() => router.push('/fysio')}
          className="text-[#6b6560] text-sm"
        >
          Oefeningen beheren
        </button>
      </div>
    )
  }

  const videoId = oefening.video_url ? getYouTubeId(oefening.video_url) : null
  const startSec = oefening.video_start_seconden ?? 0

  return (
    <div className="min-h-screen bg-[#f5f3f0] flex flex-col">
      {/* Header */}
      <div className="px-4 pt-10 pb-4">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.push('/dashboard')} className="text-[#6b6560]">
            <X size={22} />
          </button>
          <div className="flex-1">
            <p className="text-xs text-[#6b6560]">Fysio sessie</p>
            <p className="text-sm font-medium text-[#1a1612]">{huidig + 1} van {totaal}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1">
          {oefeningen.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors',
                i < huidig || i in gedaan ? 'bg-[#f97316]' : i === huidig ? 'bg-[#f97316]/50' : 'bg-[#e8e3dc]'
              )}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {/* Video */}
        {videoId && (
          <div className="mb-4 rounded-2xl overflow-hidden aspect-video bg-black">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}?start=${startSec}&rel=0&modestbranding=1`}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        {/* Oefening info */}
        <div className="bg-white rounded-2xl p-4 mb-4">
          <h1 className="text-xl font-bold text-[#1a1612] mb-1">{oefening.naam}</h1>
          {oefening.categorie && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[#f97316]/10 text-[#f97316] font-medium">
              {oefening.categorie}
            </span>
          )}
          {oefening.beschrijving && (
            <p className="mt-3 text-sm text-[#6b6560] leading-relaxed">{oefening.beschrijving}</p>
          )}
        </div>

        {/* Sets / reps / timer */}
        <div className="bg-white rounded-2xl p-4 mb-4">
          {oefening.duur_seconden ? (
            <>
              <div className="flex items-center gap-2 mb-3 text-sm text-[#6b6560]">
                <Timer size={16} className="text-[#f97316]" />
                <span>{oefening.sets ? `${oefening.sets} sets van` : ''} {oefening.duur_seconden}s</span>
              </div>
              <CountdownTimer seconden={oefening.duur_seconden} />
            </>
          ) : (
            <div className="flex items-center justify-center gap-6 py-2">
              {oefening.sets && (
                <div className="text-center">
                  <p className="text-3xl font-bold text-[#1a1612]">{oefening.sets}</p>
                  <p className="text-xs text-[#6b6560] mt-1">sets</p>
                </div>
              )}
              {oefening.sets && oefening.reps && (
                <div className="text-[#e8e3dc] text-2xl">×</div>
              )}
              {oefening.reps && (
                <div className="text-center">
                  <p className="text-3xl font-bold text-[#1a1612]">{oefening.reps}</p>
                  <p className="text-xs text-[#6b6560] mt-1">herhalingen</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pijnmeting */}
        <div className="bg-white rounded-2xl p-4 mb-4">
          <p className="text-sm font-medium text-[#1a1612] mb-3">Hoe voelde dit?</p>
          <div className="flex gap-2">
            {PIJN_OPTIES.map(opt => (
              <button
                key={opt.waarde}
                onClick={() => setPijnKeuze(opt.waarde)}
                className={cn(
                  'flex-1 py-2 rounded-xl text-xs font-medium border transition-all',
                  pijnKeuze === opt.waarde
                    ? opt.kleur
                    : 'bg-[#f5f3f0] text-[#6b6560] border-[#e8e3dc]'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <div className="px-4 pb-8 pt-2 bg-[#f5f3f0] border-t border-[#e8e3dc]">
        <div className="flex gap-3">
          {huidig > 0 && (
            <button
              onClick={() => navigeer('achter')}
              className="flex items-center gap-1 px-4 py-3 rounded-2xl bg-white border border-[#e8e3dc] text-[#6b6560]"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          <button
            onClick={markeerGedaan}
            disabled={pijnKeuze === null}
            className={cn(
              'flex-1 py-3 rounded-2xl font-semibold flex items-center justify-center gap-2 transition-all',
              pijnKeuze !== null
                ? 'bg-[#f97316] text-white'
                : 'bg-[#e8e3dc] text-[#9ca3af] cursor-not-allowed'
            )}
          >
            <CheckCircle2 size={18} />
            {isLaatste ? 'Sessie afronden' : 'Volgende oefening'}
          </button>
          {!isLaatste && huidig < totaal - 1 && (
            <button
              onClick={() => navigeer('voor')}
              className="flex items-center gap-1 px-4 py-3 rounded-2xl bg-white border border-[#e8e3dc] text-[#6b6560]"
            >
              <ChevronRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
