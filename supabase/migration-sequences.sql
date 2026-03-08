-- =============================================
-- BOOST CRM - Sequences Migration
-- Run this in Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qbypfqpwrrtzntxgouww/sql/new
-- =============================================

-- Sequences (email automation templates)
CREATE TABLE IF NOT EXISTS sequences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text DEFAULT '',
  steps jsonb NOT NULL DEFAULT '[]',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on sequences" ON sequences FOR ALL USING (true) WITH CHECK (true);

-- Sequence enrollments (prospect <-> sequence link)
CREATE TABLE IF NOT EXISTS sequence_enrollments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id uuid NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','stopped_reply','stopped_manual','paused')),
  current_step integer NOT NULL DEFAULT 0,
  next_step_date date,
  pending_email jsonb,
  send_mode text NOT NULL DEFAULT 'semi_auto'
    CHECK (send_mode IN ('semi_auto','auto')),
  enrolled_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  stopped_at timestamptz,
  stopped_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enrollments_active ON sequence_enrollments(next_step_date) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_enrollments_prospect ON sequence_enrollments(prospect_id);

ALTER TABLE sequence_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on sequence_enrollments" ON sequence_enrollments FOR ALL USING (true) WITH CHECK (true);
