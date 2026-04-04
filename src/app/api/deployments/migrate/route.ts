import { supabase } from '@/lib/supabase'

export async function POST() {
  const results: string[] = []

  // Check deployments table
  const { error: dErr } = await supabase.from('deployments').select('id').limit(1)
  if (dErr?.code === 'PGRST205') {
    results.push('deployments_missing')
  }

  // Check if client_machines has unit_price column
  const { data: testMachine } = await supabase.from('client_machines').select('unit_price').limit(1)
  const hasUnitPrice = testMachine !== null

  const sqlParts: string[] = []

  if (!hasUnitPrice) {
    sqlParts.push('ALTER TABLE client_machines ADD COLUMN IF NOT EXISTS unit_price numeric(10,2) DEFAULT 0;')
  }

  if (results.includes('deployments_missing')) {
    sqlParts.push(`
CREATE TABLE deployments (
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
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on deployments" ON deployments FOR ALL USING (true) WITH CHECK (true);`)
  }

  if (sqlParts.length === 0) {
    return Response.json({ status: 'ok', message: 'All tables up to date' })
  }

  return Response.json({
    status: 'needs_migration',
    message: 'Run this SQL in Supabase Dashboard > SQL Editor',
    sql: sqlParts.join('\n\n'),
  })
}
