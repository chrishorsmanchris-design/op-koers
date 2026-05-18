import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const TYPE_EMOJI: Record<string, string> = {
  hardlopen: '🏃',
  krachttraining: '💪',
  core: '🧘',
  cross: '🚴',
  rust: '😴',
}

function formatDatumIcal(datum: string): string {
  // datum is YYYY-MM-DD, return YYYYMMDD
  return datum.replace(/-/g, '')
}

function berekenEindtijd(startUur: number, startMinuut: number, duurMinuten: number): string {
  const totaalMinuten = startUur * 60 + startMinuut + duurMinuten
  const uur = Math.floor(totaalMinuten / 60) % 24
  const minuut = totaalMinuten % 60
  return `${String(uur).padStart(2, '0')}${String(minuut).padStart(2, '0')}00`
}

function escapeTekst(tekst: string): string {
  return tekst
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const vandaag = new Date().toISOString().split('T')[0]

  const { data: sessies, error } = await supabase
    .from('training_sessions')
    .select('id, datum, type, beschrijving, duur_minuten, afstand_km, intensiteit')
    .eq('user_id', user.id)
    .gte('datum', vandaag)
    .eq('voltooid', false)
    .order('datum', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const vevents = (sessies ?? []).map(s => {
    const datumIcal = formatDatumIcal(s.datum as string)
    const emoji = TYPE_EMOJI[(s.type as string) ?? ''] ?? '🏃'
    const beschrijving = (s.beschrijving as string) ?? (s.type as string) ?? 'Training'
    const duurMinuten = (s.duur_minuten as number) ?? 60
    const afstandKm = s.afstand_km as number | null
    const intensiteit = s.intensiteit as string | null

    const eindtijd = berekenEindtijd(7, 0, duurMinuten)

    const descParts: string[] = []
    if (duurMinuten) descParts.push(`${duurMinuten} min`)
    if (afstandKm) descParts.push(`${afstandKm} km`)
    if (intensiteit) descParts.push(intensiteit)
    const description = descParts.join(' | ')

    return [
      'BEGIN:VEVENT',
      `UID:${s.id}@op-koers.nl`,
      `DTSTART;TZID=Europe/Amsterdam:${datumIcal}T070000`,
      `DTEND;TZID=Europe/Amsterdam:${datumIcal}T${eindtijd}`,
      `SUMMARY:${escapeTekst(`${emoji} ${beschrijving}`)}`,
      `DESCRIPTION:${escapeTekst(description)}`,
      'END:VEVENT',
    ].join('\r\n')
  })

  const icsInhoud = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Op Koers//Training Schema//NL',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Op Koers Training',
    'X-WR-CALDESC:Jouw persoonlijk trainingsschema',
    ...vevents,
    'END:VCALENDAR',
  ].join('\r\n')

  return new NextResponse(icsInhoud, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="op-koers-schema.ics"',
    },
  })
}
