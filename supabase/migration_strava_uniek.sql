-- Run this in de Supabase SQL editor (Dashboard → SQL Editor → New query)
--
-- Dubbele sessies bij Strava-sync definitief onmogelijk maken.
--
-- Waarom: de sync wordt vanaf meerdere plekken tegelijk gestart (dashboard bij
-- laden én de activiteitenpagina). Beide checken eerst "bestaat deze activiteit
-- al?", beide zien "nee", en beide maken vervolgens een sessie aan — dezelfde
-- run staat er dan twee keer in. Applicatiecode kan die race niet dichtzetten;
-- een unieke index in de database wel. De sync vangt de unique-violation af en
-- pakt dan de sessie die de andere sync aanmaakte.

-- Stap 1: bestaande duplicaten opruimen. Houdt per (user_id, runkeeper_id) de
-- OUDSTE sessie aan; bijbehorende session_feedback gaat mee via ON DELETE CASCADE.
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

-- Stap 2: de index. Partieel, zodat de vele sessies zónder runkeeper_id
-- (gewone schema-trainingen) elkaar niet in de weg zitten.
CREATE UNIQUE INDEX IF NOT EXISTS training_sessions_user_runkeeper_uniq
  ON training_sessions (user_id, runkeeper_id)
  WHERE runkeeper_id IS NOT NULL;
