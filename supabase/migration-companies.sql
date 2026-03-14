-- ============================================================
-- Migration: Companies table + company_id on prospects
-- Run this AFTER reviewing the mapping report from /api/companies/mapping
-- ============================================================

-- 1. Create companies table
CREATE TABLE IF NOT EXISTS companies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  aliases text[] DEFAULT '{}',
  sector text,
  website text,
  location text,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- 2. Add company_id FK on prospects
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- 3. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_prospects_company_id ON prospects(company_id);
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);

-- 4. RLS policies (match existing pattern — public read/write for anon key)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow full access to companies" ON companies
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- AFTER running the mapping script and populating companies,
-- link existing prospects:
--
-- UPDATE prospects p SET company_id = c.id
-- FROM companies c
-- WHERE LOWER(TRIM(p.entreprise)) = LOWER(TRIM(c.name))
--    OR LOWER(TRIM(p.entreprise)) = ANY(
--         SELECT LOWER(TRIM(a)) FROM unnest(c.aliases) a
--       );
-- ============================================================
