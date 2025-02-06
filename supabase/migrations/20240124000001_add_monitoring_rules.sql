-- Create monitoring_rules table
CREATE TABLE IF NOT EXISTS monitoring_rules (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  website_id uuid REFERENCES websites(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('ARTICLE_COUNT', 'KEYWORD', 'CONTENT_CHANGE', 'SOCIAL_MENTIONS')),
  threshold integer,
  keyword text,
  enabled boolean DEFAULT true,
  notify_email text NOT NULL,
  last_triggered timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  created_by uuid REFERENCES auth.users(id)
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_monitoring_rules_website_id ON monitoring_rules(website_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_rules_type ON monitoring_rules(type);
CREATE INDEX IF NOT EXISTS idx_monitoring_rules_created_by ON monitoring_rules(created_by);

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for all users" ON monitoring_rules;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON monitoring_rules;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON monitoring_rules;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON monitoring_rules;

-- Add RLS policies
ALTER TABLE monitoring_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON monitoring_rules
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON monitoring_rules
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users only" ON monitoring_rules
  FOR UPDATE USING (
    auth.role() = 'authenticated' 
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM websites w 
      WHERE w.id = website_id 
      AND (w.created_by = auth.uid() OR w.is_public = true)
    )
  );

CREATE POLICY "Enable delete for authenticated users only" ON monitoring_rules
  FOR DELETE USING (
    auth.role() = 'authenticated' 
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM websites w 
      WHERE w.id = website_id 
      AND (w.created_by = auth.uid() OR w.is_public = true)
    )
  ); 