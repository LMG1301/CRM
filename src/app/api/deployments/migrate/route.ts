import { supabase } from '@/lib/supabase'

// One-time migration endpoint to create the deployments table
// Call this once: POST /api/deployments/migrate
export async function POST() {
  // Try to create the table using Supabase's rpc or a simple test
  // Since we can't run DDL through the anon key, we'll check if table exists
  // and return instructions if not
  const { error } = await supabase.from('deployments').select('id').limit(1)

  if (error?.code === 'PGRST205') {
    // Table doesn't exist - return the SQL to run in Supabase dashboard
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
  hardware_revenue numeric(10,2) DEFAULT 0,
  deployment_date date NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('pipeline', 'manual')),
  forecast_id uuid REFERENCES prospect_forecasts(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deployments_date ON deployments(deployment_date);
CREATE INDEX IF NOT EXISTS idx_deployments_client ON deployments(client_name);
CREATE INDEX IF NOT EXISTS idx_deployments_forecast ON deployments(forecast_id);

ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on deployments" ON deployments FOR ALL USING (true) WITH CHECK (true);
      `.trim(),
    })
  }

  return Response.json({ status: 'ok', message: 'Deployments table already exists' })
}
