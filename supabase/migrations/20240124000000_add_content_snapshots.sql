-- Create content_snapshots table
CREATE TABLE IF NOT EXISTS content_snapshots (
  id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
  website_id uuid REFERENCES websites(id) ON DELETE CASCADE,
  metrics jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_content_snapshots_website_id ON content_snapshots(website_id);
CREATE INDEX IF NOT EXISTS idx_content_snapshots_created_at ON content_snapshots(created_at);

-- Add RLS policies
ALTER TABLE content_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON content_snapshots
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON content_snapshots
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users only" ON content_snapshots
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable delete for authenticated users only" ON content_snapshots
  FOR DELETE USING (auth.role() = 'authenticated'); 