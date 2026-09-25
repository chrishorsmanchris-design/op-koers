// ─── Een aangepaste sessie intern kloppend maken ─────────────────────────────
//
// Een sessie draagt drie getallen die hetzelfde verhaal moeten vertellen: de
// duur, de afstand, en de minuten die in de beschrijving staan. Zodra een model
// er één aanpast en de andere laat staan, lees je op je kaartje iets anders dan
// er in het veld staat.
//
// Zo stond er "Lange duurloop 170 min in D1 – langste loop van het schema" boven
// een sessie van 1 uur 9 minuten en 11,8 km. De duur en de afstand klopten
// onderling — 11,8 km in 69 minuten is precies D1 — maar de tekst was de oude,
// en de tekst is wat je meeneemt naar buiten.
//
// De volgorde is: de duur is leidend, de afstand volgt eruit via je tempo, en de
// beschrijving volgt uit de duur. Je spreekt met jezelf af hoe lang je gaat
// lopen; hoe ver je komt is de uitkomst.

import { schaalBeschrijving } from './opbouw'
import { herstelAfstand, type TempoZone } from './tempo-zones'

export type SessieCijfers = {
  duur_minuten: number | null
  afstand_km: number | null
  beschrijving: string
}

/**
 * Legt een voorgestelde aanpassing naast de sessie zoals hij was, en corrigeert
 * wat elkaar tegenspreekt.
 *
 * De beschrijving wordt alleen herschreven als het model de oude letterlijk
 * heeft teruggegeven. Heeft het er zelf een nieuwe voor bedacht, dan hoort die
 * al bij de nieuwe duur en zou meeschalen hem juist kapotmaken.
 */
export function maakConsistent(
  oud: SessieCijfers,
  voorstel: SessieCijfers,
  zones?: TempoZone[]
): SessieCijfers {
  const duur = voorstel.duur_minuten ?? oud.duur_minuten
  const afstand = herstelAfstand(duur, voorstel.afstand_km, zones)

  let beschrijving = voorstel.beschrijving?.trim() || oud.beschrijving
  const onveranderd = beschrijving === oud.beschrijving
  if (onveranderd && oud.duur_minuten && duur && duur !== oud.duur_minuten) {
    beschrijving = schaalBeschrijving(beschrijving, duur / oud.duur_minuten)
  }

  return { duur_minuten: duur, afstand_km: afstand, beschrijving }
}
