-- Onderweg getankt, ja of nee.
--
-- Eén kolom, drie waarden, en NULL voor alles waar de vraag niet gesteld is —
-- korte sessies dus. Bewust geen aparte tabel: dit hoort bij hoe één training
-- verliep, net als de rating, en niet bij een voedingsdagboek dat niemand
-- volhoudt.
--
-- De CHECK staat er zodat een typefout in de client hier stopt en niet pas
-- maanden later opvalt als een run stilletjes uit de efficiëntie-index verdwijnt.

ALTER TABLE session_feedback
  ADD COLUMN IF NOT EXISTS getankt TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'session_feedback_getankt_check'
  ) THEN
    ALTER TABLE session_feedback
      ADD CONSTRAINT session_feedback_getankt_check
      CHECK (getankt IS NULL OR getankt IN ('ja', 'deels', 'nee'));
  END IF;
END $$;
