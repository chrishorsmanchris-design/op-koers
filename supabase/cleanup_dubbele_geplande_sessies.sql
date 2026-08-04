-- Run this in de Supabase SQL editor (Dashboard → SQL Editor → New query)
--
-- Ruimt dubbele GEPLANDE sessies op. Die zijn ontstaan doordat import-volledig
-- fase 1 op de maandag van de huidige week liet beginnen, terwijl de opruimactie
-- ervoor alleen sessies vanaf vandaag verwijderde. De al verstreken dagen van de
-- lopende week werden dus bij elke her-import opnieuw toegevoegd — vandaar dagen
-- met twee, drie of vier identieke sessies. De oorzaak zit inmiddels dicht; dit
-- ruimt op wat er al staat.
--
-- Sessies mét runkeeper_id blijven ongemoeid: die horen bij een echte Strava-
-- activiteit en worden al afgedekt door de unieke index uit
-- migration_strava_uniek.sql. Twee losse Strava-runs op één dag zijn immers
-- gewoon twee runs.
--
-- Welke rij blijft staan, in deze volgorde:
--   1. een voltooide sessie (daar hangt je feedback en je historie aan)
--   2. anders een overgeslagen sessie (ook een bewuste registratie)
--   3. anders de oudste

-- Eerst kijken wat er weg gaat (deze SELECT wijzigt niets):
WITH gerangschikt AS (
  SELECT id, datum, beschrijving, voltooid, overgeslagen, created_at,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, datum, type, beschrijving, afstand_km
           ORDER BY voltooid DESC, overgeslagen DESC, created_at ASC
         ) AS rn
  FROM training_sessions
  WHERE runkeeper_id IS NULL
)
SELECT datum, beschrijving, voltooid, overgeslagen, created_at
FROM gerangschikt
WHERE rn > 1
ORDER BY datum DESC;

-- Pas als bovenstaande lijst klopt: onderstaande DELETE draaien.
--
-- DELETE FROM training_sessions ts
-- USING (
--   SELECT id,
--          ROW_NUMBER() OVER (
--            PARTITION BY user_id, datum, type, beschrijving, afstand_km
--            ORDER BY voltooid DESC, overgeslagen DESC, created_at ASC
--          ) AS rn
--   FROM training_sessions
--   WHERE runkeeper_id IS NULL
-- ) dup
-- WHERE ts.id = dup.id
--   AND dup.rn > 1;
