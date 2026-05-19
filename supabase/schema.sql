-- Op Koers — Database Schema

-- Profielen (uitbreiding op auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  naam TEXT NOT NULL,
  geboortedatum DATE,
  geslacht TEXT CHECK (geslacht IN ('man', 'vrouw', 'anders')),
  km_per_week NUMERIC(5,1),
  runs_per_week INTEGER,
  max_hartslag INTEGER,
  runkeeper_token TEXT,
  push_subscription JSONB,
  onboarding_voltooid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Doelen
CREATE TABLE IF NOT EXISTS goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('marathon', 'halve_marathon', 'triathlon_heel', 'triathlon_half', 'anders')),
  naam TEXT NOT NULL,
  datum DATE NOT NULL,
  tijdsdoel TEXT,
  actief BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Eerdere resultaten
CREATE TABLE IF NOT EXISTS previous_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('marathon', 'halve_marathon', 'triathlon_heel', 'triathlon_half', 'anders')),
  datum DATE NOT NULL,
  tijd TEXT NOT NULL,
  notitie TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vakanties
CREATE TABLE IF NOT EXISTS vacations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  naam TEXT NOT NULL,
  start_datum DATE NOT NULL,
  eind_datum DATE NOT NULL,
  kan_trainen TEXT NOT NULL CHECK (kan_trainen IN ('ja', 'nee', 'beperkt')),
  notitie TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trainingsessies
CREATE TABLE IF NOT EXISTS training_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES goals(id) ON DELETE SET NULL,
  datum DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('hardlopen', 'rust', 'krachttraining', 'cross')),
  beschrijving TEXT NOT NULL,
  duur_minuten INTEGER,
  afstand_km NUMERIC(5,2),
  intensiteit TEXT CHECK (intensiteit IN ('herstel', 'makkelijk', 'gemiddeld', 'zwaar', 'interval')),
  voltooid BOOLEAN DEFAULT FALSE,
  overgeslagen BOOLEAN DEFAULT FALSE,
  runkeeper_id TEXT,
  volgorde INTEGER DEFAULT 0,
  week_nummer INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feedback op trainingsessies
CREATE TABLE IF NOT EXISTS session_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating TEXT NOT NULL CHECK (rating IN ('te_zwaar', 'zwaar', 'goed', 'beter_dan_verwacht', 'topdag')),
  notitie TEXT,
  hartslag_gem INTEGER,
  hartslag_max INTEGER,
  werkelijke_duur INTEGER,
  werkelijke_afstand NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fysio-oefeningen
CREATE TABLE IF NOT EXISTS physio_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  naam TEXT NOT NULL,
  beschrijving TEXT,
  sets INTEGER,
  reps INTEGER,
  duur_seconden INTEGER,
  video_url TEXT,
  video_start_seconden INTEGER DEFAULT 0,
  actief BOOLEAN DEFAULT TRUE,
  categorie TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fysio sessies
CREATE TABLE IF NOT EXISTS physio_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  datum DATE NOT NULL,
  voltooid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feedback op fysio-oefeningen
CREATE TABLE IF NOT EXISTS physio_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  physio_session_id UUID NOT NULL REFERENCES physio_sessions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES physio_exercises(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pijn_score INTEGER NOT NULL CHECK (pijn_score IN (0, 1, 2)),
  notitie TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS inschakelen
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE previous_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacations ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE physio_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE physio_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE physio_feedback ENABLE ROW LEVEL SECURITY;

-- RLS policies (gebruiker ziet alleen eigen data)
CREATE POLICY "Eigen profiel" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Eigen doelen" ON goals FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Eigen resultaten" ON previous_results FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Eigen vakanties" ON vacations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Eigen sessies" ON training_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Eigen feedback" ON session_feedback FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Eigen oefeningen" ON physio_exercises FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Eigen fysio sessies" ON physio_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Eigen fysio feedback" ON physio_feedback FOR ALL USING (auth.uid() = user_id);

-- Trigger: profiel aanmaken bij registratie
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, naam)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'naam', split_part(new.email, '@', 1)));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Trigger: updated_at bijhouden
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
CREATE TRIGGER training_sessions_updated_at BEFORE UPDATE ON training_sessions FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
CREATE TRIGGER physio_exercises_updated_at BEFORE UPDATE ON physio_exercises FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
