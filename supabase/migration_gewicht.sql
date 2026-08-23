-- Lichaamsgewicht, voor het tankplan.
--
-- De voedingsrichtlijnen (ACSM/AND/DC position stand 2016) rekenen bijna alles
-- per kilo lichaamsgewicht: 1-4 g/kg koolhydraten vooraf, 5-10 ml/kg vocht
-- vooraf, 1-1,2 g/kg/uur koolhydraten en 0,25-0,3 g/kg eiwit erna. Zonder dit
-- getal kan de app alleen de formule tonen in plaats van een portie.
--
-- numeric en niet integer: mensen wegen 74,5 kg.
alter table profiles add column if not exists gewicht_kg numeric;
