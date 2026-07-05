'use client'
import { useState, useRef } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { PhysioExercise } from '@/types/database'
import { Upload, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Loader2, Pencil, Check, RefreshCw, BookOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

interface Props {
  oefeningen: PhysioExercise[]
  physioKlacht: string | null
}

export function FysioClient({ oefeningen: initOefeningen, physioKlacht: initKlacht }: Props) {
  const supabase = createClient()
  const [oefeningen, setOefeningen] = useState(initOefeningen)
  const [uploaden, setUploaden] = useState(false)
  const [openOefening, setOpenOefening] = useState<string | null>(null)
  const [pijnFeedback, setPijnFeedback] = useState<Record<string, number>>({})
  const [gedaan, setGedaan] = useState<Set<string>>(new Set())
  const [klacht, setKlacht] = useState(initKlacht ?? '')
  const [klachtEdit, setKlachtEdit] = useState(false)
  const [klachtLaden, setKlachtLaden] = useState(false)
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

  const [schemaPrompt, setSchemaPrompt] = useState(false)
  const [schemaGenereert, setSchemaGenereert] = useState(false)

  async function klachtOpslaan() {
    setKlachtLaden(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('profiles').update({ physio_klacht: klacht || null } as never).eq('id', user.id)
    }
    setKlachtLaden(false)
    setKlachtEdit(false)
    setSchemaPrompt(true)
  }

  async function schemaHergenereren() {
    setSchemaGenereert(true)
    await fetch('/api/training/genereer', { method: 'POST' })
    setSchemaGenereert(false)
    setSchemaPrompt(false)
  }

  function setPijn(id: string, score: number) {
    setPijnFeedback(prev => ({ ...prev, [id]: score }))
  }

  function markeerGedaan(id: string) {
    setGedaan(prev => new Set([...prev, id]))
    if (pijnFeedback[id] === 2) {
      alert('Let op: je hebt veel pijn gemeld bij deze oefening. Bespreek dit bij je volgende fysioafspraak.')
    }
  }

  const aantalGedaan = gedaan.size
  const totaal = oefeningen.length

  return (
    <div className="flex flex-col gap-5 p-4 pt-8 pb-24">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-white">Fysio</h1>
          {totaal > 0 && (
            <p className="text-sm text-[#8888a8] mt-1">{aantalGedaan}/{totaal} oefeningen gedaan</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".pdf,image/*" onChange={handleUpload} className="hidden" />
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploaden}>
            {uploaden ? <Loader2 size={16} className="animate-spin mr-2" /> : <Upload size={16} className="mr-2" />}
            PDF of foto
          </Button>
        </div>
      </div>

      {/* Bibliotheek link */}
      <Link
        href="/fysio/bibliotheek"
        className="flex items-center justify-between bg-[#1b1b27] border border-[#2d2d3e] rounded-2xl p-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[#f97316]/10 flex items-center justify-center shrink-0">
            <BookOpen size={18} className="text-[#f97316]" />
          </div>
          <div>
            <p className="font-semibold text-white text-sm">Oefeningen bibliotheek</p>
            <p className="text-xs text-[#8888a8]">20 veelgebruikte lopers-oefeningen</p>
          </div>
        </div>
        <ChevronDown size={16} className="text-[#55556a] -rotate-90" />
      </Link>

      {/* Huidige klacht */}
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-xs font-semibold text-[#8888a8] uppercase tracking-wider mb-1">Huidige klacht</p>
            {klachtEdit ? (
              <textarea
                value={klacht}
                onChange={e => setKlacht(e.target.value)}
                placeholder="Beschrijf je klacht, bijv. 'Kuitblessure rechts, 3 weken geleden begonnen'"
                className="w-full bg-[#222230] border border-[#2d2d3e] rounded-xl px-3 py-2 text-sm text-white placeholder:text-[#55556a] focus:outline-none focus:border-[#f97316] resize-none h-20"
                autoFocus
              />
            ) : (
              <p className="text-sm text-white">
                {klacht || <span className="text-[#55556a] italic">Nog geen klacht ingevuld</span>}
              </p>
            )}
          </div>
          {klachtEdit ? (
            <button onClick={klachtOpslaan} disabled={klachtLaden} className="text-[#f97316] mt-5 shrink-0">
              {klachtLaden ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            </button>
          ) : (
            <button onClick={() => setKlachtEdit(true)} className="text-[#55556a] mt-5 shrink-0">
              <Pencil size={16} />
            </button>
          )}
        </div>
        {klacht && !klachtEdit && (
          <p className="text-xs text-[#55556a] mt-2">
            Het trainingsschema houdt hier rekening mee bij het genereren.
          </p>
        )}
      </Card>

      {/* Schema hergenereren prompt */}
      {schemaPrompt && (
        <Card className="bg-[#f97316]/10 border border-[#f97316]/30">
          <p className="text-sm text-white font-medium mb-1">Klacht gewijzigd</p>
          <p className="text-xs text-[#8888a8] mb-3">
            {klacht
              ? 'Wil je het trainingsschema aanpassen op basis van je huidige klacht?'
              : 'Je klacht is verwijderd. Wil je het schema opnieuw genereren zonder beperkingen?'}
          </p>
          <div className="flex gap-2">
            <button
              onClick={schemaHergenereren}
              disabled={schemaGenereert}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-[#f97316] text-white text-sm font-medium transition-all active:scale-95"
            >
              {schemaGenereert
                ? <Loader2 size={14} className="animate-spin" />
                : <RefreshCw size={14} />}
              {schemaGenereert ? 'Bezig...' : 'Schema aanpassen'}
            </button>
            <button
              onClick={() => setSchemaPrompt(false)}
              className="px-4 py-2.5 rounded-2xl bg-[#222230] text-[#8888a8] text-sm font-medium"
            >
              Later
            </button>
          </div>
        </Card>
      )}

      {/* Voortgangsbalk */}
      {totaal > 0 && (
        <div className="h-1.5 bg-[#2d2d3e] rounded-full">
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
          <p className="text-sm text-[#8888a8] mb-4">Upload een PDF van je fysio om te beginnen</p>
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
                  onClick={() => setOpenOefening(open => open === oef.id ? null : oef.id)}
                  className="w-full flex items-start justify-between gap-3 text-left"
                >
                  <div className="flex items-start gap-3 flex-1">
                    {isDone ? (
                      <CheckCircle2 size={20} className="text-green-400 mt-0.5 shrink-0" />
                    ) : (
                      <div className="w-5 h-5 border-2 border-[#2d2d3e] rounded-full mt-0.5 shrink-0" />
                    )}
                    <div>
                      <h3 className="font-semibold text-white">{oef.naam}</h3>
                      <p className="text-sm text-[#8888a8]">
                        {oef.sets && oef.reps ? `${oef.sets}×${oef.reps} reps` : ''}
                        {oef.duur_seconden ? ` · ${oef.duur_seconden}s` : ''}
                      </p>
                    </div>
                  </div>
                  {isOpen ? <ChevronUp size={18} className="text-[#8888a8] shrink-0" /> : <ChevronDown size={18} className="text-[#8888a8] shrink-0" />}
                </button>

                {isOpen && (
                  <div className="mt-4 flex flex-col gap-4">
                    {oef.beschrijving && (
                      <p className="text-sm text-[#8888a8] leading-relaxed">{oef.beschrijving}</p>
                    )}

                    {oef.video_url && (
                      <div className="rounded-2xl overflow-hidden bg-[#222230]">
                        <div className="aspect-video">
                          <iframe
                            src={`https://www.youtube.com/embed/${extractVideoId(oef.video_url)}?start=${oef.video_start_seconden ?? 0}&autoplay=0&rel=0`}
                            className="w-full h-full"
                            allowFullScreen
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                          />
                        </div>
                        {(oef.video_start_seconden ?? 0) > 0 && (
                          <p className="text-xs text-[#8888a8] p-2 text-center">
                            Start op {formatTijd(oef.video_start_seconden ?? 0)}
                          </p>
                        )}
                      </div>
                    )}

                    <div>
                      <p className="text-sm font-medium text-[#8888a8] mb-2">Hoe voelt het?</p>
                      <div className="flex gap-2">
                        {[0, 1, 2].map(score => (
                          <button
                            key={score}
                            onClick={() => setPijn(oef.id, score)}
                            className={cn(
                              'flex-1 py-2 rounded-xl text-xs font-medium border-2 transition-all',
                              pijn === score
                                ? score === 0 ? 'border-green-500 bg-green-500/10 text-green-400'
                                  : score === 1 ? 'border-yellow-500 bg-yellow-500/10 text-amber-300'
                                  : 'border-red-500 bg-red-500/10 text-red-400'
                                : 'border-[#2d2d3e] text-[#8888a8]'
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
