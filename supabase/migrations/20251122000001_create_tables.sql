-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  created_at timestamp DEFAULT now(),
  preferences jsonb DEFAULT '{
    "household_size": 2,
    "dietary_restrictions": [],
    "expiration_buffer_days": 3
  }'::jsonb
);

-- Product cache table (shared across all users)
CREATE TABLE product_cache (
  barcode text PRIMARY KEY,
  product_data jsonb NOT NULL,
  last_updated timestamp DEFAULT now()
);

CREATE INDEX idx_product_cache_updated ON product_cache(last_updated);

-- Inventory table
CREATE TABLE inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  barcode text NOT NULL,
  product_name text NOT NULL,
  category text NOT NULL CHECK (category IN ('Dairy', 'Meat', 'Seafood', 'Produce_Leafy', 'Produce_Hard', 'Produce_Fruit', 'Bread', 'Eggs', 'Deli', 'Pantry', 'Frozen')),
  image_url text,
  quantity int DEFAULT 1 CHECK (quantity >= 0),
  added_date timestamp DEFAULT now(),
  expiration_date date NOT NULL,
  manual_expiry_override boolean DEFAULT false,

  -- Computed columns
  is_expired boolean GENERATED ALWAYS AS (expiration_date < CURRENT_DATE) STORED,
  days_until_expiry int GENERATED ALWAYS AS (expiration_date - CURRENT_DATE) STORED
);

CREATE INDEX idx_inventory_user_expiry ON inventory(user_id, expiration_date);
CREATE INDEX idx_inventory_barcode ON inventory(barcode);

-- Recipe history table
CREATE TABLE recipe_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  recipe_id text NOT NULL,
  recipe_name text NOT NULL,
  ingredients_used text[] NOT NULL,
  created_at timestamp DEFAULT now(),
  rating int CHECK (rating BETWEEN 1 AND 5)
);

CREATE INDEX idx_recipe_history_user ON recipe_history(user_id, created_at DESC);
