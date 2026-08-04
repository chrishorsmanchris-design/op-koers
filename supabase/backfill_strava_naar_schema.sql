-- Run this in de Supabase SQL editor (Dashboard → SQL Editor → New query)
--
-- Zet bestaande Strava-historie alsnog op de geplande sessies.
--
-- Waarom: door de duplicaatbug belandden label en meetwaarden op verschillende
-- rijen. De schema-sessie ("Duurloop 80 min in D1") had het zone-label maar geen
-- echte cijfers; de losse Strava-rij ("Ochtendloop") had de cijfers maar geen
-- label. De tempozone-kalibratie heeft beide op dezelfde rij nodig, en vond
-- daardoor vrijwel niets bruikbaars.
--
-- Dit script doet met terugwerkende kracht wat vindOfMaakSessie nu meteen doet:
-- koppelen op datum, met de kleinste afstandsafwijking als de dag meerdere
-- kandidaten heeft, en Strava leidend maken voor afstand en duur.
--
-- Draai eerst het PREVIEW-blok. Pas als die lijst klopt het TOEPASSEN-blok.

-- ─── PREVIEW (wijzigt niets) ─────────────────────────────────────────────────
WITH strava AS (
  SELECT id, user_id, datum, afstand_km, duur_minuten, runkeeper_id, beschrijving
  FROM training_sessions
  WHERE runkeeper_id IS NOT NULL AND goal_id IS NULL AND type = 'hardlopen'
), kandidaten AS (
  SELECT s.id AS strava_id, s.datum,
         s.beschrijving AS strava_naam, s.afstand_km AS strava_km, s.duur_minuten AS strava_min,
         p.id AS plan_id, p.beschrijving AS plan_naam, p.afstand_km AS plan_km,
         ROW_NUMBER() OVER (PARTITION BY s.id
           ORDER BY ABS(COALESCE(p.afstand_km, 0) - COALESCE(s.afstand_km, 0))) AS rang_s,
         ROW_NUMBER() OVER (PARTITION BY p.id
           ORDER BY ABS(COALESCE(p.afstand_km, 0) - COALESCE(s.afstand_km, 0))) AS rang_p
  FROM strava s
  JOIN training_sessions p
    ON p.user_id = s.user_id
   AND p.datum = s.datum
   AND p.type = 'hardlopen'
   AND p.runkeeper_id IS NULL
   AND p.goal_id IS NOT NULL
)
SELECT datum, strava_naam, strava_km, strava_min, plan_naam, plan_km
FROM kandidaten
WHERE rang_s = 1 AND rang_p = 1
ORDER BY datum DESC;


-- ─── TOEPASSEN ───────────────────────────────────────────────────────────────
-- BEGIN;
--
-- CREATE TEMP TABLE koppeling AS
-- WITH strava AS (
--   SELECT id, user_id, datum, afstand_km, duur_minuten, runkeeper_id
--   FROM training_sessions
--   WHERE runkeeper_id IS NOT NULL AND goal_id IS NULL AND type = 'hardlopen'
-- ), kandidaten AS (
--   SELECT s.id AS strava_id, s.user_id, s.runkeeper_id,
--          s.afstand_km AS strava_km, s.duur_minuten AS strava_min,
--          p.id AS plan_id,
--          ROW_NUMBER() OVER (PARTITION BY s.id
--            ORDER BY ABS(COALESCE(p.afstand_km, 0) - COALESCE(s.afstand_km, 0))) AS rang_s,
--          ROW_NUMBER() OVER (PARTITION BY p.id
--            ORDER BY ABS(COALESCE(p.afstand_km, 0) - COALESCE(s.afstand_km, 0))) AS rang_p
--   FROM strava s
--   JOIN training_sessions p
--     ON p.user_id = s.user_id AND p.datum = s.datum AND p.type = 'hardlopen'
--    AND p.runkeeper_id IS NULL AND p.goal_id IS NOT NULL
-- )
-- SELECT strava_id, user_id, runkeeper_id, strava_km, strava_min, plan_id
-- FROM kandidaten WHERE rang_s = 1 AND rang_p = 1;
--
-- -- 1. Meetwaarden op bestaande feedback van de geplande sessie zetten.
-- --    COALESCE zodat een handmatig ingevulde waarde blijft staan als Strava niets heeft.
-- UPDATE session_feedback f
-- SET werkelijke_afstand = COALESCE(sf.werkelijke_afstand, f.werkelijke_afstand),
--     werkelijke_duur    = COALESCE(sf.werkelijke_duur,    f.werkelijke_duur),
--     hartslag_gem       = COALESCE(sf.hartslag_gem,       f.hartslag_gem),
--     hartslag_max       = COALESCE(sf.hartslag_max,       f.hartslag_max),
--     route_polyline     = COALESCE(sf.route_polyline,     f.route_polyline)
-- FROM koppeling k
-- JOIN session_feedback sf ON sf.session_id = k.strava_id
-- WHERE f.session_id = k.plan_id;
--
-- -- 2. Had de geplande sessie nog geen feedback? Dan een nieuwe rij.
-- INSERT INTO session_feedback
--   (session_id, user_id, rating, werkelijke_afstand, werkelijke_duur,
--    hartslag_gem, hartslag_max, route_polyline, notitie)
-- SELECT k.plan_id, k.user_id, COALESCE(sf.rating, 'goed'),
--        sf.werkelijke_afstand, sf.werkelijke_duur,
--        sf.hartslag_gem, sf.hartslag_max, sf.route_polyline,
--        'Overgezet vanuit Strava'
-- FROM koppeling k
-- JOIN session_feedback sf ON sf.session_id = k.strava_id
-- WHERE NOT EXISTS (SELECT 1 FROM session_feedback f WHERE f.session_id = k.plan_id);
--
-- -- 3. De losse Strava-rij weg. Moet vóór stap 4: anders zouden er even twee
-- --    rijen met hetzelfde runkeeper_id bestaan en slaat de unieke index aan.
-- DELETE FROM training_sessions WHERE id IN (SELECT strava_id FROM koppeling);
--
-- -- 4. Strava leidend maken op de geplande sessie.
-- UPDATE training_sessions p
-- SET runkeeper_id = k.runkeeper_id,
--     afstand_km   = COALESCE(k.strava_km, p.afstand_km),
--     duur_minuten = COALESCE(k.strava_min, p.duur_minuten),
--     voltooid     = true,
--     overgeslagen = false
-- FROM koppeling k
-- WHERE p.id = k.plan_id;
--
-- COMMIT;
