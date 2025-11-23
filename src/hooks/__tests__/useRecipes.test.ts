import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useRecipes } from '../useRecipes'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}))

describe('useRecipes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches recipes successfully', async () => {
    const mockRecipes = [
      {
        id: '1',
        name: 'Pancakes',
        image: 'https://example.com/pancakes.jpg',
        servings: 4,
        ingredients: ['milk', 'eggs', 'flour'],
        expiring_ingredients_used: ['milk'],
        rank: 1,
        reasoning: 'Uses milk expiring in 2 days',
      },
    ]

    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { recipes: mockRecipes },
      error: null,
    })

    const { result } = renderHook(() => useRecipes())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await result.current.fetchRecipes({
      optimization: 'longevity',
      household_size: 2,
    })

    await waitFor(() => {
      expect(result.current.recipes).toEqual(mockRecipes)
      expect(result.current.error).toBeNull()
    })
  })

  it('handles API errors gracefully', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: new Error('API Error'),
    })

    const { result } = renderHook(() => useRecipes())

    await result.current.fetchRecipes({
      optimization: 'longevity',
      household_size: 2,
    })

    await waitFor(() => {
      expect(result.current.error).toBe('API Error')
      expect(result.current.recipes).toEqual([])
    })
  })

  it('handles empty inventory message', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: {
        recipes: [],
        message: 'Add ingredients to get suggestions'
      },
      error: null,
    })

    const { result } = renderHook(() => useRecipes())

    await result.current.fetchRecipes({
      optimization: 'longevity',
      household_size: 2,
    })

    await waitFor(() => {
      expect(result.current.recipes).toEqual([])
      expect(result.current.message).toBe('Add ingredients to get suggestions')
    })
  })
})
