import { describe, test, expect } from 'vitest'
import { supabase } from '../supabase'

describe('Supabase client', () => {
  test('should connect to Supabase', async () => {
    const { data, error } = await supabase.from('product_cache').select('count')
    expect(error).toBeNull()
    expect(data).toBeDefined()
  })
})
