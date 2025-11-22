import { describe, test, expect } from 'vitest'
import { supabase } from '../supabase'

describe('Supabase client', () => {
  // This test expects a local Supabase instance running on port 54321
  // Environment variables are mocked in setup.ts to allow client initialization
  test('should connect to Supabase', async () => {
    const { data, error } = await supabase.from('product_cache').select('count')
    expect(error).toBeNull()
    expect(data).toBeDefined()
  })
})
