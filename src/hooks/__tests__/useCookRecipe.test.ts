import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCookRecipe } from '../useCookRecipe'
import { supabase } from '../../lib/supabase'
import { Recipe } from '../../types/recipe.types'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => ({
            data: [
              { id: '1', product_name: 'milk', quantity: 2 },
              { id: '2', product_name: 'eggs', quantity: 6 },
            ],
            error: null,
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          data: {},
          error: null,
        })),
      })),
      insert: vi.fn(() => ({
        data: {},
        error: null,
      })),
    })),
  },
}))

describe('useCookRecipe', () => {
  const mockRecipe: Recipe = {
    id: '123',
    name: 'Pancakes',
    image: 'https://example.com/pancakes.jpg',
    servings: 4,
    ingredients: ['milk', 'eggs', 'flour'],
    expiring_ingredients_used: ['milk'],
    rank: 1,
    reasoning: 'Uses expiring milk',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: 'user-123' } as any },
      error: null,
    })
  })

  it('marks ingredients as consumed when cooking recipe', async () => {
    const { result } = renderHook(() => useCookRecipe())

    await result.current.cookRecipe(mockRecipe)

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBeNull()
    expect(supabase.from).toHaveBeenCalledWith('inventory')
  })

  it('handles errors when cooking recipe', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => ({
            data: null,
            error: new Error('Database error'),
          })),
        })),
      })),
    } as any)

    const { result } = renderHook(() => useCookRecipe())

    try {
      await result.current.cookRecipe(mockRecipe)
    } catch (err) {
      // Expected to throw
    }

    await waitFor(() => {
      expect(result.current.error).toBe('Database error')
    })
  })
})
