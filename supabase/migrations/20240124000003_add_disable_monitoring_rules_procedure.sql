-- Create a function to disable monitoring rules in a transaction
CREATE OR REPLACE FUNCTION disable_monitoring_rules(
  p_website_id uuid,
  p_user_id uuid,
  p_rule_ids uuid[]
) RETURNS SETOF monitoring_rules AS $$
DECLARE
  v_updated_rules monitoring_rules[];
BEGIN
  -- Update the rules and store the results
  WITH updated AS (
    UPDATE monitoring_rules
    SET 
      enabled = false,
      last_triggered = NOW()
    WHERE 
      website_id = p_website_id
      AND created_by = p_user_id
      AND id = ANY(p_rule_ids)
      AND enabled = true
    RETURNING *
  )
  SELECT array_agg(u.*) INTO v_updated_rules FROM updated u;

  -- Verify all rules were disabled
  IF EXISTS (
    SELECT 1 
    FROM monitoring_rules 
    WHERE website_id = p_website_id 
      AND created_by = p_user_id 
      AND id = ANY(p_rule_ids)
      AND enabled = true
  ) THEN
    RAISE EXCEPTION 'Failed to disable all monitoring rules';
  END IF;

  -- Return the updated rules
  RETURN QUERY SELECT * FROM unnest(v_updated_rules);
EXCEPTION
  WHEN OTHERS THEN
    -- On error, the transaction will automatically roll back
    RAISE EXCEPTION 'Failed to disable monitoring rules: %', SQLERRM;
END;
$$ LANGUAGE plpgsql; 