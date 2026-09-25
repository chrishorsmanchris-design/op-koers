-- Pasfrequentie per sessie, in passen per minuut (beide benen).
--
-- Strava levert dit al mee bij elke hardloopactiviteit en we gooiden het weg.
-- Let op de eenheid: Strava rapporteert cadans voor hardlopen als "steps per
-- minute of one foot", dus ongeveer 80 tot 95. In deze kolom staat het
-- verdubbelde getal, want in passen per minuut praat iedereen — zie
-- cadansUitStrava() in src/lib/cadans.ts.
--
-- Waarvoor: niet om zuiniger te lopen (hardlopers kiezen hun paslengte vanzelf
-- binnen ~3% van het metabool optimum, Cavanagh & Williams 1982), maar om
-- gewrichten te ontzien. 5 tot 10% boven je eigen basislijn verlaagt de
-- energie-absorptie in knie en heup aanzienlijk (Heiderscheit et al. 2011).
--
-- integer: een halve pas per minuut bestaat niet als eenheid van betekenis.

ALTER TABLE session_feedback
  ADD COLUMN IF NOT EXISTS cadans_spm INTEGER;

COMMENT ON COLUMN session_feedback.cadans_spm IS
  'Gemiddelde pasfrequentie in passen per minuut (beide benen). Strava levert per been; wordt verdubbeld bij import.';
