import { supabase } from '@/lib/supabase'

export async function POST() {
  const { error } = await supabase.from('deployments').select('id').limit(1)

  if (error?.code === 'PGRST205') {
    return Response.json({
      status: 'table_missing',
      message: 'Run this SQL in Supabase Dashboard > SQL Editor',
      sql: `
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

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_deployments_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_deployments_updated_at ON deployments;
CREATE TRIGGER set_deployments_updated_at
  BEFORE UPDATE ON deployments
  FOR EACH ROW EXECUTE FUNCTION update_deployments_updated_at();

ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on deployments" ON deployments FOR ALL USING (true) WITH CHECK (true);
      `.trim(),
    })
  }

  return Response.json({ status: 'ok', message: 'Deployments table already exists' })
}
