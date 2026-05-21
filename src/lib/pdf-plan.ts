// ─── 14-weeks marathon PDF-schema van hardloopschema.nl ──────────────────────
// Beoogde eindtijd: 3:00–3:30 uur
// Looptempos (basis: 7510m in 35:08):
//   H=6:41/km  D1=5:51/km  D2=5:12/km  D3=4:41/km  W=4:27/km

export type PdfSessie = {
  dag: number           // 0=ma … 6=zo (voorkeur)
  type: 'hardlopen' | 'rust' | 'cross'
  intensiteit: 'herstel' | 'makkelijk' | 'gemiddeld' | 'zwaar' | 'interval'
  beschrijving: string
  duur_minuten: number | null
  afstand_km: number | null
}

export const PDF_PLAN: PdfSessie[][] = [
  // Week 1
  [
    { dag: 0, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Lange duurloop: 45 min D1 direct gevolgd door 5 min D2',              duur_minuten: 50,  afstand_km: 8.7 },
    { dag: 1, type: 'hardlopen', intensiteit: 'interval',   beschrijving: 'Interval: 16 × 400m, eindigen in D2-D3 (1:15 min wandelen)',          duur_minuten: 60,  afstand_km: 10.0 },
    { dag: 2, type: 'hardlopen', intensiteit: 'herstel',    beschrijving: 'Herstelloop 40 min in H',                                              duur_minuten: 40,  afstand_km: 6.0 },
    { dag: 3, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 4, type: 'hardlopen', intensiteit: 'gemiddeld',  beschrijving: 'Duurloop 50 min in D2',                                                duur_minuten: 50,  afstand_km: 9.6 },
    { dag: 5, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 6, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Lange duurloop: 70 min D1 direct gevolgd door 10 min D2',              duur_minuten: 80,  afstand_km: 13.9 },
  ],
  // Week 2
  [
    { dag: 0, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 1, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Fartlek: 40 min D1 met 3 × 2 min versnellen naar D2 (bij moe: 30 min uitlopen)', duur_minuten: 40, afstand_km: 6.8 },
    { dag: 2, type: 'hardlopen', intensiteit: 'interval',   beschrijving: 'Interval: 16 × 400m, eindigen in D2-D3 (1:15 min wandelen)',          duur_minuten: 60,  afstand_km: 10.0 },
    { dag: 3, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Duurloop 50 min in D1',                                                duur_minuten: 50,  afstand_km: 8.5 },
    { dag: 4, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 5, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 6, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Lange duurloop: 85 min D1 direct gevolgd door 5 min D2',               duur_minuten: 90,  afstand_km: 15.5 },
  ],
  // Week 3
  [
    { dag: 0, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Duurloop 40 min in D1',                                                duur_minuten: 40,  afstand_km: 6.8 },
    { dag: 1, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 2, type: 'hardlopen', intensiteit: 'interval',   beschrijving: 'Interval: 14 × 400m, eindigen in D2-D3 (1:15 min wandelen)',          duur_minuten: 55,  afstand_km: 9.0 },
    { dag: 3, type: 'hardlopen', intensiteit: 'gemiddeld',  beschrijving: 'Duurloop: 60 min D1 direct gevolgd door 15 min D2',                    duur_minuten: 75,  afstand_km: 13.1 },
    { dag: 4, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 5, type: 'hardlopen', intensiteit: 'herstel',    beschrijving: 'Herstelloop 40 min in H',                                              duur_minuten: 40,  afstand_km: 6.0 },
    { dag: 6, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Lange duurloop: 80 min D1 direct gevolgd door 10 min D2 – neem hellingen mee', duur_minuten: 90, afstand_km: 15.6 },
  ],
  // Week 4
  [
    { dag: 0, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Duurloop 45 min in D1',                                                duur_minuten: 45,  afstand_km: 7.7 },
    { dag: 1, type: 'hardlopen', intensiteit: 'gemiddeld',  beschrijving: 'Intensieve duurloop: 65 min D2 + 3 min D3 – daarna 5 min rustig uitlopen', duur_minuten: 73, afstand_km: 13.7 },
    { dag: 2, type: 'hardlopen', intensiteit: 'interval',   beschrijving: 'Interval extensief: 7 × 800m, eindigen in D2-D3 (2 min wandelen)',     duur_minuten: 55,  afstand_km: 10.0 },
    { dag: 3, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 4, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Duurloop: 70 min D1 direct gevolgd door 5 min D2',                     duur_minuten: 75,  afstand_km: 13.0 },
    { dag: 5, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 6, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Lange duurloop: 85 min D1 direct gevolgd door 15 min D2',              duur_minuten: 100, afstand_km: 17.3 },
  ],
  // Week 5
  [
    { dag: 0, type: 'hardlopen', intensiteit: 'herstel',    beschrijving: 'Herstelloop 45 min in H',                                              duur_minuten: 45,  afstand_km: 6.7 },
    { dag: 1, type: 'hardlopen', intensiteit: 'gemiddeld',  beschrijving: 'Intensieve duurloop: 60 min D2 direct gevolgd door 5 min D3',          duur_minuten: 65,  afstand_km: 12.6 },
    { dag: 2, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 3, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 4, type: 'hardlopen', intensiteit: 'interval',   beschrijving: 'Interval extensief: 8 × 800m, eindigen in D2-D3 (2 min wandelen)',     duur_minuten: 60,  afstand_km: 10.8 },
    { dag: 5, type: 'hardlopen', intensiteit: 'gemiddeld',  beschrijving: 'Lange duurloop: 85 min D1 direct gevolgd door 30 min D2',              duur_minuten: 115, afstand_km: 22.0 },
    { dag: 6, type: 'cross',     intensiteit: 'makkelijk',  beschrijving: 'Hersteltraining: 30-60 min fietsen of roeien',                         duur_minuten: 45,  afstand_km: null },
  ],
  // Week 6
  [
    { dag: 0, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Duurloop 75 min in D1',                                                duur_minuten: 75,  afstand_km: 12.8 },
    { dag: 1, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 2, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Fartlek: 60 min D1 met 3 × 2 min versnellen naar D2',                  duur_minuten: 60,  afstand_km: 10.3 },
    { dag: 3, type: 'hardlopen', intensiteit: 'interval',   beschrijving: 'Interval extensief: 8 × 800m, eindigen in D2-D3 (2 min wandelen)',     duur_minuten: 60,  afstand_km: 10.8 },
    { dag: 4, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 5, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 6, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Lange duurloop 150 min in D1 – langste rustige loop van het schema',   duur_minuten: 150, afstand_km: 25.6 },
  ],
  // Week 7
  [
    { dag: 0, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 1, type: 'hardlopen', intensiteit: 'gemiddeld',  beschrijving: 'Duurloop: 55 min D1 direct gevolgd door 10 min D2 – ontspannen lopen', duur_minuten: 65,  afstand_km: 11.3 },
    { dag: 2, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 3, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Duurloop 75 min in D1',                                                duur_minuten: 75,  afstand_km: 12.8 },
    { dag: 4, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 5, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 6, type: 'hardlopen', intensiteit: 'gemiddeld',  beschrijving: 'Wedstrijd 15 km in D2-D3 – zoek een leuke lokale wedstrijd',           duur_minuten: 75,  afstand_km: 15.0 },
  ],
  // Week 8
  [
    { dag: 0, type: 'hardlopen', intensiteit: 'herstel',    beschrijving: 'Herstelloop 45 min in H',                                              duur_minuten: 45,  afstand_km: 6.7 },
    { dag: 1, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 2, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Duurloop 50 min in D1',                                                duur_minuten: 50,  afstand_km: 8.5 },
    { dag: 3, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 4, type: 'hardlopen', intensiteit: 'interval',   beschrijving: 'Interval extensief: 6 × 1000m, eindigen in D2-D3 (3 min wandelen)',   duur_minuten: 65,  afstand_km: 12.0 },
    { dag: 5, type: 'cross',     intensiteit: 'makkelijk',  beschrijving: 'Hersteltraining: 30-60 min fietsen/roeien of 30-40 min uitlopen D1',  duur_minuten: 45,  afstand_km: null },
    { dag: 6, type: 'hardlopen', intensiteit: 'gemiddeld',  beschrijving: 'Lange duurloop: 90 min D1 direct gevolgd door 30 min D2 – neem hellingen mee', duur_minuten: 120, afstand_km: 22.2 },
  ],
  // Week 9
  [
    { dag: 0, type: 'hardlopen', intensiteit: 'gemiddeld',  beschrijving: 'Duurloop: 75 min D1 direct gevolgd door 15 min D2',                    duur_minuten: 90,  afstand_km: 15.8 },
    { dag: 1, type: 'hardlopen', intensiteit: 'gemiddeld',  beschrijving: 'Intensieve duurloop 60 min in D2',                                     duur_minuten: 60,  afstand_km: 11.5 },
    { dag: 2, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 3, type: 'hardlopen', intensiteit: 'interval',   beschrijving: 'Interval extensief: 6 × 1000m, eindigen in D2-D3 (3 min wandelen)',   duur_minuten: 65,  afstand_km: 12.0 },
    { dag: 4, type: 'hardlopen', intensiteit: 'gemiddeld',  beschrijving: 'Duurloop: 55 min D1 direct gevolgd door 20 min D2',                    duur_minuten: 75,  afstand_km: 13.2 },
    { dag: 5, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 6, type: 'hardlopen', intensiteit: 'gemiddeld',  beschrijving: 'Lange duurloop: 105 min D1 direct gevolgd door 30 min D2',             duur_minuten: 135, afstand_km: 23.8 },
  ],
  // Week 10
  [
    { dag: 0, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 1, type: 'hardlopen', intensiteit: 'gemiddeld',  beschrijving: 'Intensieve duurloop 90 min in D2',                                     duur_minuten: 90,  afstand_km: 17.3 },
    { dag: 2, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Duurloop 40 min in D1',                                                duur_minuten: 40,  afstand_km: 6.8 },
    { dag: 3, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Duurloop 80 min in D1',                                                duur_minuten: 80,  afstand_km: 13.7 },
    { dag: 4, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 5, type: 'hardlopen', intensiteit: 'interval',   beschrijving: 'Interval intensief: 8 × 1000m, eindigen in D3 (2:30 wandelen)',        duur_minuten: 80,  afstand_km: 14.0 },
    { dag: 6, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Lange duurloop: 135 min D1 direct gevolgd door 25 min D2',             duur_minuten: 160, afstand_km: 27.9 },
  ],
  // Week 11
  [
    { dag: 0, type: 'cross',     intensiteit: 'makkelijk',  beschrijving: 'Hersteltraining: 30-60 min fietsen of roeien',                         duur_minuten: 45,  afstand_km: null },
    { dag: 1, type: 'hardlopen', intensiteit: 'gemiddeld',  beschrijving: 'Heuveltraining: 6 × 2 min D2 op helling/brug (3 min wandelen rust)',   duur_minuten: 40,  afstand_km: 6.0 },
    { dag: 2, type: 'hardlopen', intensiteit: 'gemiddeld',  beschrijving: 'Duurloop: 80 min D1 direct gevolgd door 10 min D2',                    duur_minuten: 90,  afstand_km: 15.6 },
    { dag: 3, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 4, type: 'hardlopen', intensiteit: 'gemiddeld',  beschrijving: 'Duurloop: 90 min D1 direct gevolgd door 10 min D2',                    duur_minuten: 100, afstand_km: 17.3 },
    { dag: 5, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 6, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Lange duurloop 170 min in D1 – langste loop van het schema',           duur_minuten: 170, afstand_km: 29.1 },
  ],
  // Week 12
  [
    { dag: 0, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 1, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Herstelloop 60 min in D1 – stijfheid uit de benen lopen',              duur_minuten: 60,  afstand_km: 10.3 },
    { dag: 2, type: 'hardlopen', intensiteit: 'gemiddeld',  beschrijving: 'Duurloop: 70 min D1 direct gevolgd door 20 min D2',                    duur_minuten: 90,  afstand_km: 15.8 },
    { dag: 3, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 4, type: 'hardlopen', intensiteit: 'interval',   beschrijving: 'Interval extensief: 5 × 1000m (D2-D3, 2 min wandelen) + 2 × 2000m (D2-D3, 3 min wandelen)', duur_minuten: 70, afstand_km: 13.0 },
    { dag: 5, type: 'hardlopen', intensiteit: 'herstel',    beschrijving: 'Herstelloop 40 min in D1',                                             duur_minuten: 40,  afstand_km: 6.8 },
    { dag: 6, type: 'hardlopen', intensiteit: 'gemiddeld',  beschrijving: 'Lange duurloop: 100 min D1 direct gevolgd door 20 min D2 – alternatief: halve marathon wedstrijd', duur_minuten: 120, afstand_km: 21.2 },
  ],
  // Week 13
  [
    { dag: 0, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 1, type: 'hardlopen', intensiteit: 'gemiddeld',  beschrijving: 'Intensieve duurloop 60 min in D2 – maak looptijd korter als je moe bent', duur_minuten: 60, afstand_km: 11.5 },
    { dag: 2, type: 'hardlopen', intensiteit: 'herstel',    beschrijving: 'Herstelloop 50 min in H',                                              duur_minuten: 50,  afstand_km: 7.5 },
    { dag: 3, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Fartlek: 45 min D1 met 3 × 2 min versnellen naar D2 – gebruik je parcours (bruggen?)', duur_minuten: 45, afstand_km: 7.7 },
    { dag: 4, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 5, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 6, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Lange duurloop 90 min in D1 – maak looptijd korter als je moe bent',   duur_minuten: 90,  afstand_km: 15.4 },
  ],
  // Week 14
  [
    { dag: 0, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 1, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Activering: 50 min D1 – laatste 5 min: 3 × 20 sec versnelling (80-90%)', duur_minuten: 50, afstand_km: 8.5 },
    { dag: 2, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 3, type: 'hardlopen', intensiteit: 'makkelijk',  beschrijving: 'Activering: 25 min D1 + 5 min D2 + 10 min D1',                         duur_minuten: 40,  afstand_km: 6.8 },
    { dag: 4, type: 'rust',      intensiteit: 'herstel',    beschrijving: 'Rust – geen training',                                                 duur_minuten: null, afstand_km: null },
    { dag: 5, type: 'hardlopen', intensiteit: 'herstel',    beschrijving: 'Activering: 30 min D1 met 3 × 20 sec versnelling (80-90%) – rek daarna je spieren', duur_minuten: 30, afstand_km: 5.1 },
    { dag: 6, type: 'hardlopen', intensiteit: 'zwaar',      beschrijving: '🏁 MARATHON – geef alles, je hebt 21 weken keihard getraind!',          duur_minuten: 195, afstand_km: 42.2 },
  ],
]
