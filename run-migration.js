import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const supabaseUrl = 'https://pubitfypwjfgnpddkclz.supabase.co'
// Using service role key for admin operations
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB1Yml0Znlwd2pmZ25wZGRrY2x6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mzc2MzM3OCwiZXhwIjoyMDc5MzM5Mzc4fQ.gXCVlKPd5E2HpbDrEiDQgPh_qE2mZgGSbbhFXa8DLpA'

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function runMigration() {
  console.log('Running database migration...\n')

  // Read migration file
  const migrationSQL = readFileSync('/home/user/receipt-/supabase/migrations/20251122000001_create_tables.sql', 'utf8')

  try {
    // Execute the SQL via RPC
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL })

    if (error) {
      console.error('Migration failed:', error.message)

      // Try alternative: execute via REST API
      console.log('\nTrying alternative method...')
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': serviceRoleKey,
          'Authorization': `Bearer ${serviceRoleKey}`
        },
        body: JSON.stringify({ query: migrationSQL })
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`)
      }

      console.log('✓ Migration executed successfully!')
    } else {
      console.log('✓ Migration executed successfully!')
      console.log('Data:', data)
    }

  } catch (err) {
    console.error('Error:', err.message)
    console.log('\n⚠️  Could not run migration programmatically.')
    console.log('Please run the migration manually via Supabase Dashboard:')
    console.log('1. Go to: https://supabase.com/dashboard/project/pubitfypwjfgnpddkclz/sql')
    console.log('2. Copy contents of: supabase/migrations/20251122000001_create_tables.sql')
    console.log('3. Paste and click "Run"')
    process.exit(1)
  }
}

runMigration()
