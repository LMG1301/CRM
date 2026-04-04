-- =============================================
-- BOOST CRM - Database Schema
-- =============================================

-- Pipeline stages (customizable)
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  position integer NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT '#6B7280',
  is_terminal boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Insert default stages
INSERT INTO pipeline_stages (name, slug, position, color, is_terminal) VALUES
  ('Ciblage', 'ciblage', 1, '#6B7280', false),
  ('Touch 1 (J0)', 'touch_1', 2, '#3B82F6', false),
  ('Touch 2 (J+3-5)', 'touch_2', 3, '#8B5CF6', false),
  ('Touch 3 (J+10)', 'touch_3', 4, '#F59E0B', false),
  ('Nurturing', 'nurturing', 5, '#10B981', false),
  ('A répondu', 'repondu', 6, '#06B6D4', false),
  ('Call découverte', 'call_decouverte', 7, '#F97316', false),
  ('Devis envoyé', 'devis', 8, '#EC4899', false),
  ('Onboarding', 'onboarding', 9, '#F97316', false),
  ('Client', 'client', 10, '#22C55E', true),
  ('Refusé', 'refuse', 11, '#EF4444', true),
  ('Bounced', 'bounced', 12, '#9CA3AF', true)
ON CONFLICT (slug) DO NOTHING;

-- Prospects
CREATE TABLE IF NOT EXISTS prospects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  prenom text DEFAULT '',
  nom text DEFAULT '',
  entreprise text DEFAULT '',
  fonction text DEFAULT '',
  email text DEFAULT '',
  email_pro text DEFAULT '',
  telephone text DEFAULT '',
  localisation text DEFAULT '',
  linkedin_url text DEFAULT '',
  pays text DEFAULT '',
  source text DEFAULT '',
  pipeline_stage text NOT NULL DEFAULT 'ciblage' REFERENCES pipeline_stages(slug),
  statut_commercial text DEFAULT '',
  categorie text DEFAULT '',
  date_premier_contact date,
  date_dernier_contact date,
  date_prochaine_action date,
  type_prochaine_action text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Activities (timeline entries)
CREATE TABLE IF NOT EXISTS activities (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('note', 'call', 'email_sent', 'email_received', 'status_change', 'transcription', 'linkedin_interaction', 'presentation', 'meeting')),
  content text DEFAULT '',
  metadata jsonb DEFAULT '{}',
  activity_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz
);

-- Migration: add columns if they don't exist (for existing DBs)
ALTER TABLE activities ADD COLUMN IF NOT EXISTS activity_date date;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_prospects_pipeline_stage ON prospects(pipeline_stage);
CREATE INDEX IF NOT EXISTS idx_prospects_categorie ON prospects(categorie);
CREATE INDEX IF NOT EXISTS idx_prospects_entreprise ON prospects(entreprise);
CREATE INDEX IF NOT EXISTS idx_activities_prospect_id ON activities(prospect_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON prospects;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON prospects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies (disabled for simplicity - solo use)
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on pipeline_stages" ON pipeline_stages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on prospects" ON prospects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on activities" ON activities FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- CONTENTS (LinkedIn posts, articles, case studies, etc.)
-- =============================================

CREATE TABLE IF NOT EXISTS contents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('post_linkedin', 'article', 'case_study', 'video', 'infographie', 'temoignage')),
  url text,
  body text,
  themes text[] DEFAULT '{}',
  products text[] DEFAULT '{}',
  pipeline_stages text[] DEFAULT '{}',
  target_sectors text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- GIN indexes for array-based filtering
CREATE INDEX IF NOT EXISTS idx_contents_themes ON contents USING GIN (themes);
CREATE INDEX IF NOT EXISTS idx_contents_products ON contents USING GIN (products);
CREATE INDEX IF NOT EXISTS idx_contents_pipeline_stages ON contents USING GIN (pipeline_stages);
CREATE INDEX IF NOT EXISTS idx_contents_target_sectors ON contents USING GIN (target_sectors);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS set_updated_at ON contents;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON contents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE contents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on contents" ON contents FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- SEQUENCES (email automation)
-- =============================================

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

-- =============================================
-- AI CHAT MESSAGES (persistent chat history per prospect)
-- =============================================

CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  prospect_id uuid REFERENCES prospects(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  model text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_prospect ON ai_chat_messages(prospect_id, created_at);

ALTER TABLE ai_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on ai_chat_messages" ON ai_chat_messages FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- PROSPECT FORECASTS
-- =============================================

CREATE TABLE IF NOT EXISTS prospect_forecasts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  product_type text NOT NULL CHECK (product_type IN ('screenkit', 'smart_fridge', 'smart_freezer', 'autre')),
  unit_price numeric NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  total_amount numeric GENERATED ALWAYS AS (unit_price * quantity) STORED,
  probability integer NOT NULL CHECK (probability BETWEEN 0 AND 100),
  expected_month text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_forecasts_prospect ON prospect_forecasts(prospect_id);
CREATE INDEX IF NOT EXISTS idx_forecasts_month ON prospect_forecasts(expected_month);

ALTER TABLE prospect_forecasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on prospect_forecasts" ON prospect_forecasts FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- CLIENT MACHINES
-- =============================================

CREATE TABLE IF NOT EXISTS client_machines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  entreprise text,
  machine_type text NOT NULL CHECK (machine_type IN ('screenkit', 'smart_fridge', 'smart_freezer', 'boostbar', 'autre')),
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(10,2) DEFAULT 0,
  notes text,
  installed_at date,
  created_at timestamptz DEFAULT now()
);

-- Migration: add unit_price if not exists
ALTER TABLE client_machines ADD COLUMN IF NOT EXISTS unit_price numeric(10,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_machines_prospect ON client_machines(prospect_id);
CREATE INDEX IF NOT EXISTS idx_machines_entreprise ON client_machines(entreprise);

ALTER TABLE client_machines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on client_machines" ON client_machines FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- DEPLOYMENTS (signed/deployed machines - pipeline + manual)
-- =============================================

CREATE TABLE IF NOT EXISTS deployments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_name text NOT NULL,
  prospect_id uuid REFERENCES prospects(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 1,
  product text NOT NULL CHECK (product IN ('screenkit', 'smart_fridge', 'smart_freezer', 'boostbar', 'autre')),
  unit_price numeric(10,2) NOT NULL DEFAULT 0,
  hardware_revenue numeric(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  deployment_date date NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('pipeline', 'manual')),
  status text NOT NULL DEFAULT 'deployed' CHECK (status IN ('deployed', 'pending_installation')),
  forecast_id uuid REFERENCES prospect_forecasts(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deployments_date ON deployments(deployment_date);
CREATE INDEX IF NOT EXISTS idx_deployments_client ON deployments(client_name);
CREATE INDEX IF NOT EXISTS idx_deployments_forecast ON deployments(forecast_id);

ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on deployments" ON deployments FOR ALL USING (true) WITH CHECK (true);
