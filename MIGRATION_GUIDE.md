# Migration Guide - Task 2: Database Schema

## Overview

This guide walks you through running the database migration for Task 2: Database Schema - Tables.

The migration file has been created at:
```
supabase/migrations/20251122000001_create_tables.sql
```

## Step 1: Run the Migration

Since we're using Supabase Cloud (https://pubitfypwjfgnpddkclz.supabase.co), you need to run the migration via the Supabase Dashboard SQL Editor.

### Instructions:

1. **Open the Supabase SQL Editor**
   - Go to: https://supabase.com/dashboard/project/pubitfypwjfgnpddkclz/sql
   - Or navigate to: Dashboard → Your Project → SQL Editor

2. **Create a New Query**
   - Click "New Query" button

3. **Copy the Migration SQL**
   - Open `supabase/migrations/20251122000001_create_tables.sql`
   - Copy all the contents (Ctrl+A, Ctrl+C)

4. **Paste and Run**
   - Paste the SQL into the editor
   - Click "Run" or press Cmd/Ctrl + Enter

5. **Verify Success**
   - You should see output confirming the tables were created
   - Look for messages like "CREATE TABLE" and "CREATE INDEX"

## Step 2: Verify Tables

After running the migration, verify the tables were created successfully.

### Option A: Use the Verification Script

Run the provided verification script:

```bash
npm run verify-db
```

This will check if all required tables exist:
- users
- product_cache
- inventory
- recipe_history

### Option B: Manual Verification in SQL Editor

Run this query in the Supabase SQL Editor:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expected output should include: **inventory**, **product_cache**, **recipe_history**, **users**

### Option C: Check in Supabase Dashboard

1. Go to: Dashboard → Table Editor
2. You should see all four tables listed

## Step 3: Test Database Functions

The migration also creates database functions. Test the expiration calculation:

```sql
SELECT calculate_expiration('Dairy', '2025-01-01'::date);
```

Expected result: `2025-01-08` (7 days after Jan 1, 2025)

## What This Migration Creates

### Tables:

1. **users**
   - Extends Supabase auth.users with preferences
   - Stores household size, dietary restrictions, expiration buffer

2. **product_cache**
   - Shared cache of product data from OpenFoodFacts API
   - Reduces API calls for commonly scanned items

3. **inventory**
   - User's food inventory with expiration tracking
   - Includes computed columns: is_expired, days_until_expiry

4. **recipe_history**
   - Tracks recipes used and ingredients consumed
   - Enables personalized recommendations

### Indexes:

- Optimizes queries for user inventory by expiration date
- Enables fast product lookups by barcode
- Speeds up recipe history queries

## Troubleshooting

### Error: "extension 'uuid-ossp' does not exist"

This should auto-create, but if you see this error:
1. Make sure you have the required permissions
2. Or manually enable it first: `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`

### Error: "permission denied for table"

- You might be using the wrong key
- Make sure you're logged in to the Supabase Dashboard with admin access

### Tables already exist

If you've run the migration before:
1. Drop the existing tables first (see Rollback section)
2. Or modify the migration to use `CREATE TABLE IF NOT EXISTS`

## Rollback (if needed)

To remove all tables created by this migration:

```sql
DROP TABLE IF EXISTS recipe_history CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS product_cache CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP EXTENSION IF EXISTS "uuid-ossp";
```

## Next Steps

After successfully running this migration, you can:

1. ✅ Mark Task 2 as complete
2. Move on to Task 3: Database Schema - Functions
3. Run `npm run verify-db` periodically to ensure DB health

## Alternative: Using Supabase CLI (Future)

If you install and link the Supabase CLI later, you can push migrations with:

```bash
supabase link --project-ref pubitfypwjfgnpddkclz
supabase db push
```

This will automatically detect and run all pending migrations.
