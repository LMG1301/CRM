-- ============================================================
-- Boost CRM - Migration V2 : Multi-source integrations
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Table emails : stocke les emails syncs depuis Gmail via n8n
CREATE TABLE IF NOT EXISTS emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prospect_id UUID REFERENCES prospects(id) ON DELETE CASCADE,
  gmail_message_id TEXT UNIQUE NOT NULL,
  gmail_thread_id TEXT,
  subject TEXT,
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  body_preview TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('sent', 'received')),
  labels TEXT[] DEFAULT '{}',
  is_read BOOLEAN DEFAULT true,
  gmail_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_emails_prospect_id ON emails(prospect_id);
CREATE INDEX IF NOT EXISTS idx_emails_gmail_thread_id ON emails(gmail_thread_id);
CREATE INDEX IF NOT EXISTS idx_emails_gmail_date ON emails(gmail_date DESC);
CREATE INDEX IF NOT EXISTS idx_emails_from ON emails(from_email);
CREATE INDEX IF NOT EXISTS idx_emails_to ON emails(to_email);

-- 2. Table integrations : statut des services connectes
CREATE TABLE IF NOT EXISTS integrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  service TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
  config JSONB DEFAULT '{}',
  last_sync TIMESTAMPTZ,
  sync_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default integration entries
INSERT INTO integrations (service, status) VALUES
  ('gmail', 'disconnected'),
  ('linkedin', 'disconnected'),
  ('n8n', 'disconnected'),
  ('transcription', 'disconnected')
ON CONFLICT (service) DO NOTHING;

-- 3. RLS policies
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for emails" ON emails;
CREATE POLICY "Allow all for emails" ON emails FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for integrations" ON integrations;
CREATE POLICY "Allow all for integrations" ON integrations FOR ALL USING (true) WITH CHECK (true);

-- 4. Function to auto-match emails to prospects by email address
CREATE OR REPLACE FUNCTION match_email_to_prospect()
RETURNS TRIGGER AS $$
BEGIN
  -- Try to match by from_email or to_email against prospect email/email_pro
  IF NEW.prospect_id IS NULL THEN
    SELECT id INTO NEW.prospect_id
    FROM prospects
    WHERE email = NEW.from_email
       OR email = NEW.to_email
       OR email_pro = NEW.from_email
       OR email_pro = NEW.to_email
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_match_email ON emails;
CREATE TRIGGER auto_match_email
  BEFORE INSERT ON emails
  FOR EACH ROW
  EXECUTE FUNCTION match_email_to_prospect();

-- 5. Updated_at trigger for integrations
CREATE OR REPLACE FUNCTION update_integration_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_integration_updated ON integrations;
CREATE TRIGGER set_integration_updated
  BEFORE UPDATE ON integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_integration_timestamp();
