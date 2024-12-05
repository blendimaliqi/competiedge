-- Create a function to safely create the system_settings table
CREATE OR REPLACE FUNCTION create_system_settings_if_not_exists()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Check if the table exists
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'system_settings') THEN
        -- Create the table
        CREATE TABLE public.system_settings (
            id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
            key text NOT NULL UNIQUE,
            value jsonb NOT NULL,
            updated_at timestamptz DEFAULT now() NOT NULL,
            updated_by uuid REFERENCES auth.users(id)
        );

        -- Add RLS policies
        ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

        -- Add policies
        CREATE POLICY "Enable read access for all users" ON public.system_settings
            FOR SELECT USING (true);

        CREATE POLICY "Enable update for authenticated users only" ON public.system_settings
            FOR UPDATE USING (auth.role() = 'authenticated');

        -- Insert initial monitoring status
        INSERT INTO public.system_settings (key, value)
        VALUES ('monitoring_status', '{"enabled": true, "paused_at": null, "paused_by": null}'::jsonb);
    END IF;
END;
$$; 