-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
--
-- Losse sportactiviteiten buiten het loopschema (padel, hockey, voetbal, ...).
-- Dit is iets ANDERS dan `recurring_activities`: die tabel beschrijft een vast
-- wekelijks blok in de agenda (dag van de week, geen datum/duur/intensiteit) en
-- dient alleen om het schema omheen te plannen. Deze tabel legt vast wat je
-- daadwerkelijk op een concrete dag gedaan hebt, mét duur en intensiteit, zodat
-- de app de totale belasting kan optellen en op tijd kan waarschuwen voor te
-- weinig herstel.

CREATE TABLE IF NOT EXISTS sport_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  datum DATE NOT NULL,
  sport TEXT NOT NULL,
  duur_minuten INTEGER NOT NULL,
  intensiteit TEXT NOT NULL CHECK (intensiteit IN ('licht', 'gemiddeld', 'zwaar')),
  notitie TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sport_activities_user_datum_idx
  ON sport_activities (user_id, datum DESC);

ALTER TABLE sport_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Eigen sportactiviteiten" ON sport_activities;
CREATE POLICY "Eigen sportactiviteiten" ON sport_activities FOR ALL USING (auth.uid() = user_id);
