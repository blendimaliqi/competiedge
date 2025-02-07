-- Create a function to disable monitoring rules in a transaction
CREATE OR REPLACE FUNCTION disable_monitoring_rules(
  p_website_id uuid,
  p_user_id uuid,
  p_rule_ids uuid[]
) RETURNS SETOF monitoring_rules AS $$
DECLARE
  v_updated_rules monitoring_rules[];
  v_failed_rules uuid[];
  v_error_message text;
BEGIN
  -- Verify all rules exist and belong to the user
  SELECT array_agg(id) INTO v_failed_rules
  FROM unnest(p_rule_ids) AS rule_id
  WHERE NOT EXISTS (
    SELECT 1 FROM monitoring_rules mr 
    WHERE mr.id = rule_id 
    AND mr.website_id = p_website_id 
    AND mr.created_by = p_user_id
  );

  IF v_failed_rules IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid rule IDs or unauthorized access: %', v_failed_rules;
  END IF;

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

  -- Check if any rules failed to update
  SELECT array_agg(id) INTO v_failed_rules
  FROM monitoring_rules 
  WHERE website_id = p_website_id 
    AND created_by = p_user_id 
    AND id = ANY(p_rule_ids)
    AND enabled = true;

  IF v_failed_rules IS NOT NULL THEN
    SELECT string_agg(id::text, ', ') INTO v_error_message FROM unnest(v_failed_rules) AS id;
    RAISE EXCEPTION 'Failed to disable rules: %', v_error_message;
  END IF;

  -- Return the updated rules
  RETURN QUERY SELECT * FROM unnest(v_updated_rules);
EXCEPTION
  WHEN OTHERS THEN
    -- Include the original error message in the raised exception
    RAISE EXCEPTION 'Failed to disable monitoring rules: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$ LANGUAGE plpgsql; 