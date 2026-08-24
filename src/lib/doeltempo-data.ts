/**
 * Haalt de gegevens op die `analyseerDoel` nodig heeft.
 *
 * Vier routes en het dashboard willen dezelfde vraag beantwoord hebben — lig ik
 * op koers voor mijn tijd? — en zouden anders alle vijf hun eigen query schrijven.
 * Dat is precies hoe je aan vijf licht verschillende antwoorden komt op één vraag.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { analyseerDoel, type DoelAnalyse, type GelopenRun } from './doeltempo'

/** Hoe ver terug we runs ophalen. Ruim genoeg voor het venster in doeltempo.ts. */
const OPHAAL_WEKEN = 13

function datumMin(vandaag: string, dagen: number): string {
  const d = new Date(vandaag + 'T12:00:00')
  d.setDate(d.getDate() - dagen)
  return d.toISOString().split('T')[0]
}

/**
 * Legt het tijdsdoel naast de werkelijk gelopen runs.
 *
 * Wat Strava gemeten heeft gaat vóór wat er gepland stond: een duurloop van
 * 18 km die je als 20,4 km gelopen hebt, is 20,4 km. Zonder actief doel of
 * zonder runs komt er een `te_weinig_data`-analyse terug, geen null — de
 * aanroeper hoeft dan niets extra's af te vangen.
 */
export async function haalDoelAnalyse(
  supabase: SupabaseClient,
  userId: string,
  doel: { datum: string; tijdsdoel: string | null },
  vandaag: string,
): Promise<DoelAnalyse> {
  const { data } = await supabase
    .from('training_sessions')
    .select('datum, afstand_km, duur_minuten, session_feedback(werkelijke_duur, werkelijke_afstand)')
    .eq('user_id', userId)
    .eq('type', 'hardlopen')
    .eq('voltooid', true)
    .gte('datum', datumMin(vandaag, OPHAAL_WEKEN * 7))
    .lte('datum', vandaag)

  const runs: GelopenRun[] = (data ?? []).map(rij => {
    const r = rij as Record<string, unknown>
    const fb = (r.session_feedback as Record<string, unknown>[] | null)?.[0]
    return {
      datum: r.datum as string,
      afstand_km: (fb?.werkelijke_afstand as number | null) ?? (r.afstand_km as number | null),
      duur_minuten: (fb?.werkelijke_duur as number | null) ?? (r.duur_minuten as number | null),
    }
  })

  return analyseerDoel(runs, doel.tijdsdoel, doel.datum, vandaag)
}
