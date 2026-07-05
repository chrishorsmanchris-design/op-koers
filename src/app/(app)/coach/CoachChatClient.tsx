'use client'

import { useState, useRef, useEffect, FormEvent } from 'react'
import { Send } from 'lucide-react'

type Sessie = {
  datum: string
  type: string
  voltooid: boolean
  afstand_km: number | null
  duur_minuten: number | null
  intensiteit: string | null
  beschrijving: string | null
}

type Message = {
  role: 'user' | 'assistant'
  content: string
}

interface Props {
  profiel: { naam: string | null; km_per_week: number | null; physio_klacht: string | null } | null
  doel: { naam: string; datum: string; tijdsdoel: string | null } | null
  recente_sessies: Sessie[]
  weekreview: string | null
  userId: string | null
}

const SUGGESTIES = [
  'Hoe gaat het met mijn vooruitgang?',
  'Kan ik meer km toevoegen?',
  'Hoe herstel ik het best?',
  'Wat is mijn sterkste punt?',
]

function buildContext(props: Props): string {
  const { profiel, doel, recente_sessies } = props
  const naam = profiel?.naam ?? 'Atleet'
  const vandaag = new Date().toISOString().split('T')[0]
  const maandag = (() => {
    const d = new Date(vandaag + 'T12:00:00')
    const dag = d.getDay()
    d.setDate(d.getDate() - (dag === 0 ? 6 : dag - 1))
    return d.toISOString().split('T')[0]
  })()

  const voltooid = recente_sessies.filter(s => s.voltooid)
  const kmDezeWeek = voltooid
    .filter(s => s.datum >= maandag)
    .reduce((sum, s) => sum + (s.afstand_km ?? 0), 0)

  const dagenTotDoel = doel
    ? Math.ceil((new Date(doel.datum).getTime() - Date.now()) / 86400000)
    : null

  const sessiesSamenvatting = recente_sessies
    .slice(0, 10)
    .map(s => {
      const status = s.voltooid ? '✓' : '✗'
      const afstand = s.afstand_km ? ` ${s.afstand_km}km` : ''
      const duur = s.duur_minuten ? ` ${s.duur_minuten}min` : ''
      const intensiteit = s.intensiteit ? ` (${s.intensiteit})` : ''
      return `${status} ${s.datum} ${s.type}${afstand}${duur}${intensiteit}`
    })
    .join('\n')

  const lines = [
    `Naam: ${naam}`,
    profiel?.km_per_week ? `Wekelijks volume: ${profiel.km_per_week} km/week` : '',
    profiel?.physio_klacht ? `Blessure/klacht: ${profiel.physio_klacht}` : '',
    doel
      ? `Doel: ${doel.naam} over ${dagenTotDoel} dagen (tijdsdoel: ${doel.tijdsdoel ?? 'finishen'})`
      : '',
    `Km deze week: ${kmDezeWeek.toFixed(1)} km`,
    `Laatste 14 dagen trainingen:\n${sessiesSamenvatting}`,
  ].filter(Boolean)

  return lines.join('\n')
}

function getStorageKeys(userId: string | null) {
  const id = userId ?? 'anonymous'
  return {
    chat: `coach-chat-${id}`,
    date: `coach-chat-date-${id}`,
  }
}

export function CoachChatClient({ profiel, doel, recente_sessies, weekreview, userId }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const initialized = useRef(false)

  // Load from localStorage on mount
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const keys = getStorageKeys(userId)
    const vandaag = new Date().toISOString().split('T')[0]

    try {
      const opgeslagenDatum = localStorage.getItem(keys.date)
      if (opgeslagenDatum && opgeslagenDatum !== vandaag) {
        // Nieuwe dag — historie wissen
        localStorage.removeItem(keys.chat)
        localStorage.removeItem(keys.date)
        return
      }

      const raw = localStorage.getItem(keys.chat)
      if (raw) {
        const parsed = JSON.parse(raw) as Message[]
        if (Array.isArray(parsed)) {
          setMessages(parsed.slice(-50))
        }
      }
    } catch {
      // localStorage niet beschikbaar of ongeldige JSON — negeer
    }
  }, [userId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function slaMessagesOp(bijgewerkt: Message[]) {
    if (!initialized.current) return
    const keys = getStorageKeys(userId)
    const vandaag = new Date().toISOString().split('T')[0]
    try {
      localStorage.setItem(keys.chat, JSON.stringify(bijgewerkt))
      localStorage.setItem(keys.date, vandaag)
    } catch {
      // localStorage vol — negeer
    }
  }

  function wisGesprek() {
    const keys = getStorageKeys(userId)
    try {
      localStorage.removeItem(keys.chat)
      localStorage.removeItem(keys.date)
    } catch {
      // negeer
    }
    setMessages([])
  }

  const context = buildContext({ profiel, doel, recente_sessies, weekreview, userId })

  async function sendMessage(vraag: string) {
    if (!vraag.trim() || loading) return
    const userMsg: Message = { role: 'user', content: vraag.trim() }
    const bijgewerkt = [...messages, userMsg]
    setMessages(bijgewerkt)
    slaMessagesOp(bijgewerkt)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/coach/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vraag: vraag.trim(), context }),
      })
      const json = await res.json() as { antwoord?: string; error?: string }
      const antwoord = json.antwoord ?? json.error ?? 'Er ging iets mis. Probeer opnieuw.'
      const metAntwoord = [...bijgewerkt, { role: 'assistant' as const, content: antwoord }]
      setMessages(metAntwoord)
      slaMessagesOp(metAntwoord)
    } catch {
      const metFout = [
        ...bijgewerkt,
        { role: 'assistant' as const, content: 'Verbindingsfout. Controleer je internet en probeer opnieuw.' },
      ]
      setMessages(metFout)
      slaMessagesOp(metFout)
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    sendMessage(input)
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-[#111118]">
      {/* Header */}
      <div className="px-4 pt-12 pb-3 bg-[#111118] flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Coach 🤖</h1>
          <p className="text-sm text-[#8888a8] mt-0.5">Vraag de coach alles over je training</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={wisGesprek}
            className="text-xs text-[#55556a] hover:text-[#8888a8] transition-colors mt-1 pt-12"
          >
            Gesprek wissen
          </button>
        )}
      </div>

      {/* Scrollable messages area */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {/* Weekreview card */}
        {weekreview && (
          <div className="bg-[#1b1b27] rounded-2xl p-4 border border-[#2d2d3e] border-l-4 border-l-green-500">
            <p className="text-xs font-semibold text-green-400 mb-1">📋 Weekreview</p>
            <p className="text-sm text-white leading-relaxed">{weekreview}</p>
          </div>
        )}

        {/* Empty state + suggested questions */}
        {messages.length === 0 && (
          <div className="space-y-3 pt-2">
            <p className="text-sm text-[#8888a8] text-center">Stel een vraag aan je coach</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIES.map(s => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="bg-[#1b1b27] text-white text-xs px-3 py-2 rounded-full border border-[#2d2d3e] hover:border-[#f97316] hover:text-[#f97316] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[#f97316] text-white rounded-br-sm'
                  : 'bg-[#1b1b27] text-white border border-[#2d2d3e] rounded-bl-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Loading dots */}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#1b1b27] border border-[#2d2d3e] rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#8888a8] animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 rounded-full bg-[#8888a8] animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 rounded-full bg-[#8888a8] animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        {/* Suggested questions after first reply */}
        {messages.length >= 2 && !loading && (
          <div className="flex flex-wrap gap-2 pt-1">
            {SUGGESTIES.map(s => (
              <button
                key={s}
                onClick={() => sendMessage(s)}
                className="bg-[#1b1b27] text-[#8888a8] text-[11px] px-3 py-1.5 rounded-full border border-[#2d2d3e] hover:border-[#f97316] hover:text-[#f97316] transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 px-4 py-3 bg-[#1b1b27] border-t border-[#2d2d3e] safe-bottom"
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Stel een vraag..."
          className="flex-1 bg-[#222230] rounded-full px-4 py-2.5 text-sm text-white placeholder:text-[#55556a] outline-none"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="w-10 h-10 rounded-full bg-[#f97316] flex items-center justify-center text-white disabled:opacity-40 transition-opacity flex-shrink-0"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  )
}
