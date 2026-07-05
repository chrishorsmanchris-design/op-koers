-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)
-- Voegt opslag toe voor de (versimpelde) GPS-route van gesynchroniseerde Strava-runs,
-- zodat er een klein route-miniatuur getoond kan worden bij gesynchroniseerde activiteiten.

ALTER TABLE session_feedback
  ADD COLUMN IF NOT EXISTS route_polyline TEXT;
