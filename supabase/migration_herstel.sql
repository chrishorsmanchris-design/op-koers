-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
--
-- Herstelmeting vanuit Apple Health (Apple Watch → iOS Shortcut → deze app).
--
-- Waarom een aparte tabel en niet een kolom bij training_sessions: herstel is een
-- eigenschap van de DAG, niet van een training. Je rusthartslag van vanochtend
-- zegt iets over de belasting van gisteren én over de vraag of je vandaag wel
-- moet gaan lopen — ook op dagen waarop er helemaal geen sessie in het schema staat.
--
-- UNIQUE (user_id, datum) is essentieel: de Shortcut mag zo vaak draaien als hij
-- wil, elke post voor dezelfde dag overschrijft dan simpelweg de vorige meting in
-- plaats van een tweede rij te maken.

CREATE TABLE IF NOT EXISTS daily_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  datum DATE NOT NULL,
  -- Rusthartslag in slagen/min. De belangrijkste gratis herstelindicator die een
  -- Apple Watch levert: structureel verhoogd = je lichaam is nog aan het werk.
  rusthartslag INTEGER,
  -- Hartslagvariabiliteit (SDNN) in ms. Apple Health meet dit onregelmatig, dus
  -- vaak leeg — daarom nullable en nooit verplicht in de analyse.
  hrv_ms INTEGER,
  -- Slaapduur in uren, met decimalen (7.4 = 7 uur 24 min).
  slaapuren NUMERIC(4,2),
  -- Waar de meting vandaan komt, zodat handmatige invoer later te onderscheiden is.
  bron TEXT NOT NULL DEFAULT 'apple_health',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, datum)
);

CREATE INDEX IF NOT EXISTS daily_health_user_datum_idx
  ON daily_health (user_id, datum DESC);

ALTER TABLE daily_health ENABLE ROW LEVEL SECURITY;

-- WITH CHECK staat er bewust expliciet bij: zonder die clausule mag een INSERT
-- een willekeurige user_id meegeven en belandt de meting bij iemand anders.
DROP POLICY IF EXISTS "Eigen herstelmetingen" ON daily_health;
CREATE POLICY "Eigen herstelmetingen" ON daily_health FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Persoonlijke sleutel voor de iOS Shortcut. Bewust PER GEBRUIKER en niet één
-- gedeeld app-geheim: deze sleutel staat straks in een Shortcut op de telefoon,
-- en als hij ooit uitlekt kan hij hier ingetrokken worden zonder dat iemand
-- anders daar last van heeft. Hij geeft alléén toegang tot POST /api/health/import.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS health_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_health_token_uniq
  ON profiles (health_token) WHERE health_token IS NOT NULL;
