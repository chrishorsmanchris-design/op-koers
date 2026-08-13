import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

/**
 * Ontvangt dagelijkse herstelmetingen uit Apple Health.
 *
 * Waarom deze omweg: HealthKit is alleen bereikbaar vanuit een native iOS-app.
 * Een webapp (ook als PWA) komt er principieel niet bij — dat is geen bug maar
 * Apple's ontwerp. De gratis en veilige brug is de ingebouwde Shortcuts-app:
 * die mág HealthKit lezen en kan een POST doen. De iPhone stuurt dus zelf zijn
 * cijfers hierheen, in plaats van dat wij ergens toegang tot vragen.
 *
 * Authenticatie gebeurt met een persoonlijke sleutel in de Authorization-header,
 * niet in de URL. Dat is bewust: query strings belanden in server-logs, in
 * proxy-logs en in browsergeschiedenis, headers niet.
 *
 * De sleutel geeft precies één recht — een eigen dag bijwerken. Hij kan niets
 * lezen, niets verwijderen, en niet bij een andere gebruiker. Uitgelekt? Dan
 * druk je in Instellingen op "Nieuwe sleutel" en is de oude meteen waardeloos.
 */

/** Voorkomt dat een verdwaalde grote POST de functie laat klappen. */
const MAX_BODY = 4096

function vandaagAmsterdam(): string {
  // Niet toISOString(): dat is UTC en zet een meting van 00:30 op de vorige dag.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

/**
 * Shortcuts levert alles als tekst aan, en soms met een komma als decimaalteken.
 * Lege strings en "null" moeten leeg blijven in plaats van 0 te worden — een 0
 * zou als échte meting de basislijn vervuilen.
 */
function getal(waarde: unknown): number | null {
  if (waarde === null || waarde === undefined) return null
  if (typeof waarde === 'number') return Number.isFinite(waarde) ? waarde : null
  if (typeof waarde !== 'string') return null
  const schoon = waarde.trim().replace(',', '.')
  if (!schoon || schoon.toLowerCase() === 'null') return null
  const n = Number(schoon)
  return Number.isFinite(n) ? n : null
}

/** Buiten dit bereik is het geen meting maar een verkeerd gekoppeld veld. */
function binnen(n: number | null, min: number, max: number): number | null {
  if (n === null) return null
  return n >= min && n <= max ? n : null
}

export async function POST(req: NextRequest) {
  const header = req.headers.get('authorization') ?? req.headers.get('x-health-token') ?? ''
  const token = header.replace(/^Bearer\s+/i, '').trim()

  // Lengtecheck vóór de databasequery: een lege of onzinnige sleutel hoeft geen
  // rondje langs Supabase te maken.
  if (token.length < 32) {
    return NextResponse.json({ error: 'Ongeldige sleutel' }, { status: 401 })
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Health-import: SUPABASE_SERVICE_ROLE_KEY ontbreekt')
    return NextResponse.json({ error: 'Server niet geconfigureerd' }, { status: 500 })
  }

  const ruw = await req.text()
  if (ruw.length > MAX_BODY) {
    return NextResponse.json({ error: 'Bericht te groot' }, { status: 413 })
  }

  let ontvangen: Record<string, unknown>
  try {
    ontvangen = JSON.parse(ruw || '{}')
  } catch {
    return NextResponse.json({ error: 'Ongeldige JSON' }, { status: 400 })
  }

  // Veldnamen kleinmaken en streepjes weghalen. In Shortcuts typ je die namen met
  // de hand op een telefoontoetsenbord dat de eerste letter automatisch een
  // hoofdletter geeft; "Rusthartslag" afwijzen omdat er een hoofdletter R staat
  // is een val die niets beschermt.
  const body: Record<string, unknown> = {}
  for (const [sleutel, waarde] of Object.entries(ontvangen)) {
    body[sleutel.toLowerCase().replace(/[\s_-]/g, '')] = waarde
  }

  // Service-role: de Shortcut heeft geen sessie-cookie, dus RLS zou hier elke
  // schrijfactie stilletjes blokkeren. De sleutel hierboven is de autorisatie.
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data: profiel } = await supabase
    .from('profiles')
    .select('id')
    .eq('health_token', token)
    .maybeSingle()

  if (!profiel) {
    return NextResponse.json({ error: 'Ongeldige sleutel' }, { status: 401 })
  }
  const userId = (profiel as Record<string, string>).id

  const datumIn = typeof body.datum === 'string' ? body.datum.slice(0, 10) : null
  const datum = datumIn && /^\d{4}-\d{2}-\d{2}$/.test(datumIn) ? datumIn : vandaagAmsterdam()

  // Slaap komt uit Shortcuts meestal in minuten of seconden binnen; accepteer alle
  // drie de vormen zodat de recept-instructies niet exact hoeven te kloppen.
  const slaapuren =
    getal(body.slaapuren) ??
    (getal(body.slaapminuten) !== null ? getal(body.slaapminuten)! / 60 : null) ??
    (getal(body.slaapseconden) !== null ? getal(body.slaapseconden)! / 3600 : null)

  const meting = {
    rusthartslag: binnen(getal(body.rusthartslag), 25, 130),
    // hrvms: 'hrv_ms' is hierboven al genormaliseerd tot 'hrvms'.
    hrv_ms: binnen(getal(body.hrvms) ?? getal(body.hrv), 1, 400),
    slaapuren: binnen(slaapuren !== null ? Math.round(slaapuren * 100) / 100 : null, 0, 24),
  }

  if (meting.rusthartslag === null && meting.hrv_ms === null && meting.slaapuren === null) {
    // Een lege post is bijna altijd een Shortcut die niets uit Health kreeg. Dat
    // als "ok" wegschrijven zou een rij zonder waarden opleveren die de analyse
    // wél als meetdag telt.
    // De ontvangen veldnamen teruggeven: in Shortcuts zie je dat antwoord direct
    // onder de actie staan, en dan is een typefout in één oogopslag duidelijk.
    return NextResponse.json({
      error: 'Geen bruikbare meetwaarden ontvangen',
      ontvangen_velden: Object.keys(ontvangen),
      verwacht: ['rusthartslag', 'hrv_ms', 'slaapuren'],
    }, { status: 400 })
  }

  // Bestaande waarden niet met null overschrijven: draait de Shortcut 's ochtends
  // voor de rusthartslag en 's avonds nog eens voor de slaap, dan moeten beide
  // blijven staan in plaats van elkaar te wissen.
  const { data: bestaand } = await supabase
    .from('daily_health')
    .select('id, rusthartslag, hrv_ms, slaapuren')
    .eq('user_id', userId)
    .eq('datum', datum)
    .maybeSingle()

  if (bestaand) {
    const oud = bestaand as Record<string, number | null | string>
    const { error } = await supabase.from('daily_health').update({
      rusthartslag: meting.rusthartslag ?? oud.rusthartslag,
      hrv_ms: meting.hrv_ms ?? oud.hrv_ms,
      slaapuren: meting.slaapuren ?? oud.slaapuren,
      updated_at: new Date().toISOString(),
    } as never).eq('id', oud.id as string)

    if (error) {
      return NextResponse.json({ error: `Opslaan mislukt: ${error.message}` }, { status: 500 })
    }
  } else {
    const { error } = await supabase.from('daily_health').insert({
      user_id: userId,
      datum,
      ...meting,
      bron: 'apple_health',
    } as never)

    if (error) {
      return NextResponse.json({ error: `Opslaan mislukt: ${error.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, datum, ...meting })
}
