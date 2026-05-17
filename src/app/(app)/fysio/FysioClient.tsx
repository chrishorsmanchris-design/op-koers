'use client'
import { useState, useRef } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { PhysioExercise } from '@/types/database'
import { Upload, Play, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'

interface Props {
  oefeningen: PhysioExercise[]
}

const PIJN_LABELS = ['Geen pijn', 'Lichte pijn', 'Veel pijn']
const PIJN_KLEUREN = ['text-green-400', 'text-yellow-400', 'text-red-400']

export function FysioClient({ oefeningen: initOefeningen }: Props) {
  const [oefeningen, setOefeningen] = useState(initOefeningen)
  const [uploaden, setUploaden] = useState(false)
  const [openOefening, setOpenOefening] = useState<string | null>(null)
  const [pijnFeedback, setPijnFeedback] = useState<Record<string, number>>({})
  const [gedaan, setGedaan] = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const bestand = e.target.files?.[0]
    if (!bestand) return
    setUploaden(true)
    const fd = new FormData()
    fd.append('bestand', bestand)
    const res = await fetch('/api/physio/upload', { method: 'POST', body: fd })
    const data = await res.json()
    if (data.oefeningen) setOefeningen(prev => [...prev, ...data.oefeningen])
    setUploaden(false)
    e.target.value = ''
  }

  function toggleOefening(id: string) {
    setOpenOefening(open => open === id ? null : id)
  }

  function setPijn(id: string, score: number) {
    setPijnFeedback(prev => ({ ...prev, [id]: score }))
  }

  function markeerGedaan(id: string) {
    setGedaan(prev => new Set([...prev, id]))
    if (pijnFeedback[id] === 2) {
      // Veel pijn → alert
      alert('Let op: je hebt veel pijn gemeld bij deze oefening. Bespreek dit bij je volgende fysioafspraak.')
    }
  }

  const aantalGedaan = gedaan.size
  const totaal = oefeningen.length

  return (
    <div className="flex flex-col gap-5 p-4 pt-8">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-white">Fysio-oefeningen</h1>
          {totaal > 0 && (
            <p className="text-sm text-[#6b7280] mt-1">{aantalGedaan}/{totaal} gedaan</p>
          )}
        </div>
        <div>
          <input ref={fileRef} type="file" accept=".pdf,image/*" onChange={handleUpload} className="hidden" />
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploaden}>
            {uploaden ? <Loader2 size={16} className="animate-spin mr-2" /> : <Upload size={16} className="mr-2" />}
            PDF uploaden
          </Button>
        </div>
      </div>

      {/* Voortgangsbalk */}
      {totaal > 0 && (
        <div className="h-1.5 bg-[#333] rounded-full">
          <div
            className="h-full bg-[#f97316] rounded-full transition-all"
            style={{ width: `${(aantalGedaan / totaal) * 100}%` }}
          />
        </div>
      )}

      {oefeningen.length === 0 ? (
        <Card className="text-center py-10">
          <div className="text-5xl mb-3">📋</div>
          <h3 className="font-semibold text-white mb-1">Nog geen oefeningen</h3>
          <p className="text-sm text-[#6b7280] mb-4">Upload een PDF van je fysio om te beginnen</p>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload size={16} className="mr-2" /> PDF uploaden
          </Button>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {oefeningen.map(oef => {
            const isOpen = openOefening === oef.id
            const isDone = gedaan.has(oef.id)
            const pijn = pijnFeedback[oef.id]

            return (
              <Card key={oef.id} className={cn(isDone && 'opacity-60')}>
                <button
                  onClick={() => toggleOefening(oef.id)}
                  className="w-full flex items-start justify-between gap-3 text-left"
                >
                  <div className="flex items-start gap-3 flex-1">
                    {isDone ? (
                      <CheckCircle2 size={20} className="text-green-400 mt-0.5 shrink-0" />
                    ) : (
                      <div className="w-5 h-5 border-2 border-[#6b7280] rounded-full mt-0.5 shrink-0" />
                    )}
                    <div>
                      <h3 className="font-semibold text-white">{oef.naam}</h3>
                      <p className="text-sm text-[#6b7280]">
                        {oef.sets && oef.reps ? `${oef.sets}x ${oef.reps} reps` : ''}
                        {oef.duur_seconden ? `${oef.duur_seconden}s` : ''}
                      </p>
                    </div>
                  </div>
                  {isOpen ? <ChevronUp size={18} className="text-[#6b7280] shrink-0" /> : <ChevronDown size={18} className="text-[#6b7280] shrink-0" />}
                </button>

                {isOpen && (
                  <div className="mt-4 flex flex-col gap-4">
                    {oef.beschrijving && (
                      <p className="text-sm text-[#9ca3af] leading-relaxed">{oef.beschrijving}</p>
                    )}

                    {/* YouTube embed */}
                    {oef.video_url && (
                      <div className="rounded-2xl overflow-hidden bg-[#0f0f0f]">
                        <div className="aspect-video">
                          <iframe
                            src={`https://www.youtube.com/embed/${extractVideoId(oef.video_url)}?start=${oef.video_start_seconden ?? 0}&autoplay=0&rel=0`}
                            className="w-full h-full"
                            allowFullScreen
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                          />
                        </div>
                        {(oef.video_start_seconden ?? 0) > 0 && (
                          <p className="text-xs text-[#6b7280] p-2 text-center">
                            Start op {formatTijd(oef.video_start_seconden ?? 0)}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Pijn feedback */}
                    <div>
                      <p className="text-sm font-medium text-[#9ca3af] mb-2">Hoe voelt het?</p>
                      <div className="flex gap-2">
                        {[0, 1, 2].map(score => (
                          <button
                            key={score}
                            onClick={() => setPijn(oef.id, score)}
                            className={cn(
                              'flex-1 py-2 rounded-xl text-xs font-medium border-2 transition-all',
                              pijn === score
                                ? score === 0 ? 'border-green-500 bg-green-500/10 text-green-400'
                                  : score === 1 ? 'border-yellow-500 bg-yellow-500/10 text-yellow-400'
                                  : 'border-red-500 bg-red-500/10 text-red-400'
                                : 'border-[#333] text-[#6b7280]'
                            )}
                          >
                            {score === 0 ? '😊 Geen' : score === 1 ? '😬 Licht' : '😣 Veel'}
                          </button>
                        ))}
                      </div>
                      {pijn === 2 && (
                        <div className="flex items-center gap-2 mt-2 text-red-400 text-xs">
                          <AlertTriangle size={14} /> Meld dit bij je fysio
                        </div>
                      )}
                    </div>

                    {!isDone && (
                      <Button onClick={() => markeerGedaan(oef.id)}>
                        <CheckCircle2 size={16} className="mr-2" /> Afgerond
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function extractVideoId(url: string): string {
  const match = url.match(/[?&]v=([^&]+)/)
  return match?.[1] ?? ''
}

function formatTijd(seconden: number): string {
  const m = Math.floor(seconden / 60)
  const s = seconden % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
