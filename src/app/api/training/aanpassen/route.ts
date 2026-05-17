import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const claude = new Anthropic()

const RATING_AANPASSING = {
  te_zwaar: -0.2,
  zwaar: -0.1,
  goed: 0,
  beter_dan_verwacht: 0.05,
  topdag: 0.1,
}

export async function POST(req: NextRequest) {
  const { sessie_id, rating } = await req.json()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const vandaag = new Date().toISOString().split('T')[0]
  const factor = RATING_AANPASSING[rating as keyof typeof RATING_AANPASSING] ?? 0

  // Haal komende sessies op
  const { data: komendeSessies } = await supabase
    .from('training_sessions')
    .select('*')
    .eq('user_id', user.id)
    .gt('datum', vandaag)
    .eq('voltooid', false)
    .order('datum', { ascending: true })
    .limit(14)

  if (!komendeSessies || komendeSessies.length === 0 || factor === 0) {
    return NextResponse.json({ aangepast: false })
  }

  // Haal recente feedback op voor patroonherkenning
  const { data: recenteFeedback } = await supabase
    .from('session_feedback')
    .select('rating, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(5)

  const feedbackHistorie = recenteFeedback?.map(f => f.rating).join(', ') ?? ''

  const prompt = `Je bent een atletiekcoach. Een atleet heeft zojuist feedback gegeven op een training: "${rating}".
Recente feedback: ${feedbackHistorie}

Gebaseerd op de volgende komende sessies, pas de intensiteit en/of afstanden aan.
Aanpassingsfactor: ${factor > 0 ? '+' + Math.round(factor * 100) : Math.round(factor * 100)}%

${rating === 'te_zwaar' ? 'De atleet is overbelast. Verlaag de komende 3-5 sessies significant. Overweeg een extra rustdag toe te voegen.' : ''}
${rating === 'topdag' ? 'De atleet presteert uitstekend. Je kunt de komende 2-3 sessies licht aanscherpen.' : ''}

Komende sessies:
${komendeSessies.slice(0, 7).map(s => `- ${s.datum}: ${s.beschrijving} (${s.duur_minuten}min, ${s.afstand_km}km, ${s.intensiteit})`).join('\n')}

Geef aanpassingen terug als JSON:
{
  "aanpassingen": [
    { "id": "sessie-id", "duur_minuten": 40, "afstand_km": 7.0, "beschrijving": "aangepaste beschrijving" }
  ],
  "uitleg": "Korte uitleg waarom"
}`

  const response = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system: 'Je bent een atletiekcoach. Geef altijd geldige JSON terug.',
    messages: [{ role: 'user', content: prompt }],
  })

  const tekst = response.content[0].type === 'text' ? response.content[0].text : '{}'

  let aanpassingen
  try {
    const match = tekst.match(/\{[\s\S]*\}/)
    aanpassingen = JSON.parse(match?.[0] ?? '{}')
  } catch {
    return NextResponse.json({ aangepast: false })
  }

  // Aanpassingen doorvoeren
  for (const aanpassing of aanpassingen.aanpassingen ?? []) {
    await supabase
      .from('training_sessions')
      .update({
        duur_minuten: aanpassing.duur_minuten,
        afstand_km: aanpassing.afstand_km,
        beschrijving: aanpassing.beschrijving,
      } as never)
      .eq('id', aanpassing.id)
      .eq('user_id', user.id)
  }

  return NextResponse.json({ aangepast: true, uitleg: aanpassingen.uitleg })
}
