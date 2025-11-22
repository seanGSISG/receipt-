-- Function: Calculate expiration date based on category
CREATE OR REPLACE FUNCTION calculate_expiration(
  p_category text,
  p_added_date date DEFAULT CURRENT_DATE
) RETURNS date AS $$
DECLARE
  expiration_days int;
BEGIN
  expiration_days := CASE p_category
    WHEN 'Dairy' THEN 7
    WHEN 'Meat' THEN 3
    WHEN 'Seafood' THEN 2
    WHEN 'Produce_Leafy' THEN 5
    WHEN 'Produce_Hard' THEN 14
    WHEN 'Produce_Fruit' THEN 7
    WHEN 'Bread' THEN 5
    WHEN 'Eggs' THEN 21
    WHEN 'Deli' THEN 5
    WHEN 'Pantry' THEN 365
    WHEN 'Frozen' THEN 90
    ELSE 7  -- Conservative default
  END;

  RETURN p_added_date + expiration_days;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Get expiring items for a user
CREATE OR REPLACE FUNCTION get_expiring_items(
  p_user_id uuid,
  p_days int DEFAULT 7
) RETURNS TABLE (
  id uuid,
  product_name text,
  category text,
  expiration_date date,
  days_until_expiry int,
  quantity int
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.product_name,
    i.category,
    i.expiration_date,
    i.days_until_expiry,
    i.quantity
  FROM inventory i
  WHERE i.user_id = p_user_id
    AND i.days_until_expiry <= p_days
    AND i.days_until_expiry >= 0
    AND i.quantity > 0
  ORDER BY i.days_until_expiry ASC;
END;
$$ LANGUAGE plpgsql STABLE;
