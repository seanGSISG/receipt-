-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_history ENABLE ROW LEVEL SECURITY;
-- product_cache is shared, no RLS needed

-- Users table policies
CREATE POLICY "Users can read their own data"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own data"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own data"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Inventory table policies
CREATE POLICY "Users can read their own inventory"
  ON inventory FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own inventory"
  ON inventory FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own inventory"
  ON inventory FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own inventory"
  ON inventory FOR DELETE
  USING (auth.uid() = user_id);

-- Recipe history policies
CREATE POLICY "Users can read their own recipe history"
  ON recipe_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recipe history"
  ON recipe_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Product cache: everyone can read, only authenticated users can write
ALTER TABLE product_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read product cache"
  ON product_cache FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert product cache"
  ON product_cache FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update product cache"
  ON product_cache FOR UPDATE
  TO authenticated
  USING (true);
