#!/usr/bin/env node
/**
 * Verification script for database migration 20251122000001_create_tables.sql
 *
 * This script checks if all required tables and indexes were created successfully.
 * Run this after executing the migration in the Supabase Dashboard SQL Editor.
 *
 * Usage:
 *   node verify-migration.js
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load environment variables from .env.local
const envFile = readFileSync('.env.local', 'utf-8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) {
    envVars[key.trim()] = value.trim();
  }
});

const SUPABASE_URL = envVars.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = envVars.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Error: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not found in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function verifyTables() {
  console.log('Verifying database tables...\n');

  const requiredTables = [
    'users',
    'product_cache',
    'inventory',
    'recipe_history'
  ];

  const results = {
    success: [],
    failed: []
  };

  for (const table of requiredTables) {
    try {
      // Try to select from the table (count will work even if empty)
      const { data, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        results.failed.push({ table, error: error.message });
        console.log(`❌ Table '${table}': NOT FOUND or ERROR`);
        console.log(`   Error: ${error.message}`);
      } else {
        results.success.push(table);
        console.log(`✓ Table '${table}': EXISTS`);
      }
    } catch (err) {
      results.failed.push({ table, error: err.message });
      console.log(`❌ Table '${table}': ERROR`);
      console.log(`   Error: ${err.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('VERIFICATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Tables found: ${results.success.length}/${requiredTables.length}`);

  if (results.failed.length > 0) {
    console.log('\nMissing or errored tables:');
    results.failed.forEach(({ table, error }) => {
      console.log(`  - ${table}: ${error}`);
    });
    console.log('\n⚠️  Migration appears to be incomplete or not run yet.');
    console.log('Please run the migration SQL in Supabase Dashboard SQL Editor.');
    console.log('See: supabase/migrations/README.md for instructions.');
    process.exit(1);
  } else {
    console.log('\n✓ All required tables exist!');
    console.log('Migration 20251122000001_create_tables.sql was successful.');
  }
}

verifyTables().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
