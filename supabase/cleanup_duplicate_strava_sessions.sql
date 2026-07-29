-- Run this in de Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Ruimt dubbele training_sessions op die zijn ontstaan door een bug waarbij
-- herhaalde Strava-syncs dezelfde activiteit meerdere keren als losse sessie
-- aanmaakten (o.a. zichtbaar als meerdere identieke "Middagloop"-sessies op
-- dezelfde datum). Houdt per (user_id, runkeeper_id) de OUDSTE sessie aan en
-- verwijdert de rest — bijbehorende session_feedback-rijen worden automatisch
-- mee verwijderd via ON DELETE CASCADE.
--
-- Sessies zonder runkeeper_id (dus niet uit Strava afkomstig) worden niet
-- aangeraakt.

DELETE FROM training_sessions ts
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, runkeeper_id
           ORDER BY created_at ASC
         ) AS rn
  FROM training_sessions
  WHERE runkeeper_id IS NOT NULL
) dup
WHERE ts.id = dup.id
  AND dup.rn > 1;
