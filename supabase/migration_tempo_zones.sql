-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Voegt opslag toe voor per-gebruiker tempo-zones (D1/D2/D3/H/W), zodat de
-- wekelijkse kalibratie-cron de doelpaces kan bijstellen op basis van
-- werkelijke Strava-resultaten in plaats van het statische standaardschema.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tempo_zones JSONB,
  ADD COLUMN IF NOT EXISTS tempo_zones_updated_at TIMESTAMPTZ;
