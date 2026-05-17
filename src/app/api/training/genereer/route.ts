import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const claude = new Anthropic()

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const [{ data: profiel }, { data: doel }, { data: vakanties }, { data: resultaten }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('goals').select('*').eq('user_id', user.id).eq('actief', true).single(),
    supabase.from('vacations').select('*').eq('user_id', user.id),
    supabase.from('previous_results').select('*').eq('user_id', user.id),
  ])

  if (!doel) return NextResponse.json({ error: 'Geen actief doel gevonden' }, { status: 400 })

  const vandaag = new Date().toISOString().split('T')[0]
  const wekenTotDoel = Math.ceil((new Date(doel.datum).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 7))

  const prompt = `Je bent een ervaren atletiekcoach die een persoonlijk trainingsschema maakt gebaseerd op bewezen methoden (Hal Higdon, Jack Daniels, Pfitzinger).

GEBRUIKERSPROFIEL:
- Huidig niveau: ${profiel?.km_per_week ?? '?'} km/week, ${profiel?.runs_per_week ?? '?'} runs/week
- Doel: ${doel.naam} (${doel.type}) op ${doel.datum}
- Tijdsdoel: ${doel.tijdsdoel ?? 'nog niet bepaald'}
- Weken beschikbaar: ${wekenTotDoel}
- Eerdere resultaten: ${resultaten?.map(r => `${r.type}: ${r.tijd} (${r.datum})`).join(', ') || 'geen'}
- LET OP: gebruiker is herstellend van een kuitblessure — start conservatief

VAKANTIES (periodes aanpassen):
${vakanties?.map(v => `- ${v.naam}: ${v.start_datum} t/m ${v.eind_datum}, kan trainen: ${v.kan_trainen}`).join('\n') || 'Geen'}

Genereer een trainingsschema van ${wekenTotDoel} weken. Geef het terug als JSON array van sessies met deze structuur:
{
  "sessies": [
    {
      "datum": "YYYY-MM-DD",
      "type": "hardlopen|rust|krachttraining|cross",
      "beschrijving": "Beschrijving van de training",
      "duur_minuten": 45,
      "afstand_km": 8.0,
      "intensiteit": "herstel|makkelijk|gemiddeld|zwaar|interval",
      "week_nummer": 1,
      "volgorde": 1
    }
  ],
  "uitleg": "Korte uitleg over de aanpak"
}

Gebruik bewezen opbouw: 80% lage intensiteit, 20% hoge intensiteit. Verhoog km niet meer dan 10% per week. Bouw tapering in de laatste 3 weken. Pas schema aan voor vakantieperiodes.`

  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system: 'Je bent een ervaren atletiekcoach. Geef altijd geldige JSON terug, geen markdown codeblokken.',
    messages: [{ role: 'user', content: prompt }],
  })

  const tekst = response.content[0].type === 'text' ? response.content[0].text : ''

  let schema
  try {
    schema = JSON.parse(tekst)
  } catch {
    const jsonMatch = tekst.match(/\{[\s\S]*\}/)
    if (jsonMatch) schema = JSON.parse(jsonMatch[0])
    else return NextResponse.json({ error: 'Schema kon niet worden geparsed' }, { status: 500 })
  }

  // Sessies opslaan in database
  const sessiesOmOpslaan = schema.sessies
    .filter((s: { datum: string }) => s.datum >= vandaag)
    .map((s: Record<string, unknown>) => ({ ...s, user_id: user.id, goal_id: doel.id }))

  const { error } = await supabase.from('training_sessions').insert(sessiesOmOpslaan)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ uitleg: schema.uitleg, aantalSessies: sessiesOmOpslaan.length })
}
