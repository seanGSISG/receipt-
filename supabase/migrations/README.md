# Database Migrations

## Running Migrations on Supabase Cloud

Since this project uses Supabase Cloud, migrations need to be run via the Supabase Dashboard SQL Editor.

### Steps to Run Migration 20251122000001_create_tables.sql:

1. Go to your Supabase project SQL Editor:
   - URL: https://supabase.com/dashboard/project/pubitfypwjfgnpddkclz/sql

2. Click "New Query" or use the SQL Editor

3. Copy the entire contents of:
   ```
   supabase/migrations/20251122000001_create_tables.sql
   ```

4. Paste into the SQL Editor

5. Click "Run" or press Cmd/Ctrl + Enter

6. Verify success - you should see output confirming table creation

### Expected Tables Created:

- `users` - User profiles extending auth.users
- `product_cache` - Shared product data cache
- `inventory` - User inventory items with expiration tracking
- `recipe_history` - Recipe usage history

### Verification:

After running the migration, verify tables exist by running:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expected output should include: inventory, product_cache, recipe_history, users

### Rollback (if needed):

To drop all tables created by this migration:

```sql
DROP TABLE IF EXISTS recipe_history CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS product_cache CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP EXTENSION IF EXISTS "uuid-ossp";
```

## Alternative: Using Supabase CLI

If you have the Supabase CLI installed and linked to your project:

```bash
# Link to your project
supabase link --project-ref pubitfypwjfgnpddkclz

# Push migrations
supabase db push
```
