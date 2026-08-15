-- Wanneer je kunt lopen, per weekdag.
--
-- Naast beschikbaarheid, niet in plaats daarvan: dat veld zegt hoevéél uur je
-- hebt, dit zegt wélke uren. Voor het schema is het eerste genoeg, voor een
-- advies over de warmte van de dag heb je het tweede nodig.
--
-- JSONB en geen zeven kolommenparen: dit wordt als geheel gelezen en als geheel
-- geschreven, en er valt nooit op één losse dag te filteren.
--
-- NULL blijft geldig en betekent "geen voorkeur". De app valt dan terug op een
-- ruim standaardvenster, zodat een bestaand profiel niets kapot ziet gaan.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS looptijden JSONB;

COMMENT ON COLUMN profiles.looptijden IS
  'Uurvenster per weekdag waarin de gebruiker kan hardlopen, bv. {"ma":{"van":17,"tot":21}}. NULL = geen voorkeur.';
