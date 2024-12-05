-- Create system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  updated_by uuid REFERENCES auth.users(id)
);

-- Add initial settings
INSERT INTO system_settings (key, value) VALUES
  ('monitoring_status', '{"enabled": true, "paused_at": null, "paused_by": null}'::jsonb);

-- Add RLS policies
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON system_settings
  FOR SELECT USING (true);

CREATE POLICY "Enable update for authenticated users only" ON system_settings
  FOR UPDATE USING (auth.role() = 'authenticated'); 