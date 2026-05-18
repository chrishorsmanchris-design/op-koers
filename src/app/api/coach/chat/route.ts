import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 30

const claude = new Anthropic()

function getMaandag(datum: string): string {
  const d = new Date(datum + 'T12:00:00')
  const dag = d.getDay()
  d.setDate(d.getDate() - (dag === 0 ? 6 : dag - 1))
  return d.toISOString().split('T')[0]
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const body = await req.json() as { vraag?: string; context?: string }
  const { vraag, context: clientContext } = body

  if (!vraag?.trim()) {
    return NextResponse.json({ error: 'Geen vraag ontvangen' }, { status: 400 })
  }

  const vandaag = new Date().toISOString().split('T')[0]
  const veertienDagenGeleden = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]
  const maandag = getMaandag(vandaag)

  const [{ data: profiel }, { data: doel }, { data: sessies }] = await Promise.all([
    supabase.from('profiles').select('naam, km_per_week, physio_klacht').eq('id', user.id).single(),
    supabase.from('goals').select('naam, datum, tijdsdoel').eq('user_id', user.id).eq('actief', true).single(),
    supabase
      .from('training_sessions')
      .select('datum, type, voltooid, overgeslagen, afstand_km, duur_minuten, intensiteit')
      .eq('user_id', user.id)
      .gte('datum', veertienDagenGeleden)
      .lte('datum', vandaag)
      .order('datum', { ascending: false }),
  ])

  const naam = profiel?.naam?.split(' ')[0] ?? 'Atleet'
  const voltooid = sessies?.filter(s => s.voltooid) ?? []
  const overgeslagen = sessies?.filter(s => (s as { overgeslagen?: boolean }).overgeslagen) ?? []
  const kmDezeWeek = voltooid
    .filter(s => s.datum >= maandag)
    .reduce((sum, s) => sum + (s.afstand_km ?? 0), 0)
  const dagenTotDoel = doel
    ? Math.ceil((new Date(doel.datum).getTime() - Date.now()) / 86400000)
    : null

  const sessiesSamenvatting = (sessies ?? [])
    .slice(0, 14)
    .map(s => {
      const status = s.voltooid ? '✓' : '✗'
      const afstand = s.afstand_km ? ` ${s.afstand_km}km` : ''
      const duur = s.duur_minuten ? ` ${s.duur_minuten}min` : ''
      const intensiteit = s.intensiteit ? ` (${s.intensiteit})` : ''
      return `${status} ${s.datum} ${s.type}${afstand}${duur}${intensiteit}`
    })
    .join('\n')

  const serverContext = [
    `Naam: ${naam}`,
    profiel?.km_per_week ? `Wekelijks volume: ${profiel.km_per_week} km/week` : '',
    profiel?.physio_klacht ? `Blessure/klacht: ${profiel.physio_klacht}` : '',
    doel
      ? `Doel: ${doel.naam} over ${dagenTotDoel} dagen (tijdsdoel: ${doel.tijdsdoel ?? 'finishen'})`
      : '',
    `Voltooid: ${voltooid.length} sessies | Overgeslagen: ${overgeslagen.length} sessies (14 dagen)`,
    `Km deze week: ${kmDezeWeek.toFixed(1)} km`,
    `Trainingen laatste 14 dagen:\n${sessiesSamenvatting}`,
  ]
    .filter(Boolean)
    .join('\n')

  // Use server-side context if richer, otherwise fall back to client-provided context
  const contextToUse = serverContext || clientContext || ''

  const message = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system:
      'Je bent een persoonlijke atletiekcoach. Antwoord in het Nederlands. Wees direct, motiverend en accuraat. Max 3 zinnen tenzij specifiek gevraagd.',
    messages: [
      {
        role: 'user',
        content: `Context over de atleet:\n${contextToUse}\n\nVraag: ${vraag}`,
      },
    ],
  })

  const antwoord =
    message.content[0].type === 'text' ? message.content[0].text : 'Geen antwoord ontvangen.'

  return NextResponse.json({ antwoord })
}
