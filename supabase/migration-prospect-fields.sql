-- Migration: Add segment, region, activite, groupement, site_web columns to prospects
-- Run this in Supabase SQL Editor

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS segment text DEFAULT '';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS region text DEFAULT '';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS activite text DEFAULT '';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS groupement text DEFAULT '';
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS site_web text DEFAULT '';
