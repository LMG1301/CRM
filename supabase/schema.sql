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
  ('Client', 'client', 9, '#22C55E', true),
  ('Refusé', 'refuse', 10, '#EF4444', true),
  ('Bounced', 'bounced', 11, '#9CA3AF', true)
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
  type text NOT NULL CHECK (type IN ('note', 'call', 'email_sent', 'email_received', 'status_change', 'transcription')),
  content text DEFAULT '',
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

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
