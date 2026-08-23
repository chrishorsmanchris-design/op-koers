-- Wanneer je kunt lopen, per weekdag.
--
-- Per dag een lijst met hele uren waarop je vrij bent, bv. {"ma":[7,8,12,17,18]}.
-- Een uur in de lijst betekent dat je dat hele uur kunt: 19 staat voor 19:00 tot
-- 20:00. Bewust losse uren en geen van-tot, want een werkdag is zelden één blok:
-- voor werktijd, in de lunchpauze, en 's avonds weer, met werk ertussen.
--
-- Dit vervangt het handmatig invullen van profiles.beschikbaarheid. Die kolom
-- blijft bestaan omdat de planner en het AI-schema hem lezen, maar wordt nu bij
-- het opslaan berekend uit dit rooster: het langste aaneengesloten vrije blok,
-- gemaximeerd op vier uur. Een lege lijst is een rustdag.
--
-- JSONB en geen zeven kolommenparen: dit wordt als geheel gelezen en als geheel
-- geschreven, en er valt nooit op één losse dag te filteren.
--
-- NULL blijft geldig en betekent "nog niet ingevuld". De app valt dan terug op
-- een ruim standaardvenster, zodat een bestaand profiel niets kapot ziet gaan.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS looptijden JSONB;

COMMENT ON COLUMN profiles.looptijden IS
  'Vrije uren per weekdag waarin de gebruiker kan hardlopen, bv. {"ma":[7,8,17,18,19]}. Lege lijst = rustdag, NULL = niet ingevuld.';
