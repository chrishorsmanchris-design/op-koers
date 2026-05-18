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

export function CoachChatClient({ profiel, doel, recente_sessies, weekreview }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const context = buildContext({ profiel, doel, recente_sessies, weekreview })

  async function sendMessage(vraag: string) {
    if (!vraag.trim() || loading) return
    const userMsg: Message = { role: 'user', content: vraag.trim() }
    setMessages(prev => [...prev, userMsg])
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
      setMessages(prev => [...prev, { role: 'assistant', content: antwoord }])
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Verbindingsfout. Controleer je internet en probeer opnieuw.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    sendMessage(input)
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-[#f5f3f0]">
      {/* Header */}
      <div className="px-4 pt-12 pb-3 bg-[#f5f3f0]">
        <h1 className="text-2xl font-bold text-[#1a1612]">Coach 🤖</h1>
        <p className="text-sm text-[#6b6560] mt-0.5">Vraag de coach alles over je training</p>
      </div>

      {/* Scrollable messages area */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {/* Weekreview card */}
        {weekreview && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border-l-4 border-green-500">
            <p className="text-xs font-semibold text-green-700 mb-1">📋 Weekreview</p>
            <p className="text-sm text-[#1a1612] leading-relaxed">{weekreview}</p>
          </div>
        )}

        {/* Empty state + suggested questions */}
        {messages.length === 0 && (
          <div className="space-y-3 pt-2">
            <p className="text-sm text-[#6b6560] text-center">Stel een vraag aan je coach</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIES.map(s => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="bg-white text-[#1a1612] text-xs px-3 py-2 rounded-full shadow-sm border border-[#e8e3dc] hover:border-[#f97316] hover:text-[#f97316] transition-colors"
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
                  : 'bg-white text-[#1a1612] shadow-sm rounded-bl-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Loading dots */}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#6b6560] animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 rounded-full bg-[#6b6560] animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 rounded-full bg-[#6b6560] animate-bounce [animation-delay:300ms]" />
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
                className="bg-white text-[#6b6560] text-[11px] px-3 py-1.5 rounded-full shadow-sm border border-[#e8e3dc] hover:border-[#f97316] hover:text-[#f97316] transition-colors"
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
        className="flex items-center gap-2 px-4 py-3 bg-white border-t border-[#e8e3dc] safe-bottom"
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Stel een vraag..."
          className="flex-1 bg-[#f5f3f0] rounded-full px-4 py-2.5 text-sm text-[#1a1612] placeholder:text-[#a09990] outline-none"
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
