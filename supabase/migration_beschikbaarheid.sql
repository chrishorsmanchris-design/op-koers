-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS beschikbaarheid JSONB DEFAULT '{"ma":2,"di":0,"wo":2,"do":3,"vr":2,"za":3,"zo":0}',
  ADD COLUMN IF NOT EXISTS opbouwtempo TEXT DEFAULT 'stabiel',
  ADD COLUMN IF NOT EXISTS ziek_geblesseerd BOOLEAN DEFAULT false;
