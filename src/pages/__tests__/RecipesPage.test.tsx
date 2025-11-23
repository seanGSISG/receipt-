import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RecipesPage } from '../RecipesPage'
import * as useRecipesModule from '../../hooks/useRecipes'
import * as useCookRecipeModule from '../../hooks/useCookRecipe'

vi.mock('../../hooks/useRecipes')
vi.mock('../../hooks/useCookRecipe')

describe('RecipesPage', () => {
  const mockFetchRecipes = vi.fn()
  const mockCookRecipe = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useRecipesModule.useRecipes).mockReturnValue({
      recipes: [],
      loading: false,
      error: null,
      message: null,
      fetchRecipes: mockFetchRecipes,
      clearRecipes: vi.fn(),
    })

    vi.mocked(useCookRecipeModule.useCookRecipe).mockReturnValue({
      cookRecipe: mockCookRecipe,
      loading: false,
      error: null,
    })
  })

  it('renders optimization mode selector', () => {
    render(<RecipesPage />)

    expect(screen.getByText('Make it last')).toBeInTheDocument()
    expect(screen.getByText('Feed the family')).toBeInTheDocument()
  })

  it('renders household size input', () => {
    render(<RecipesPage />)

    expect(screen.getByLabelText(/household size/i)).toBeInTheDocument()
  })

  it('fetches recipes when "Get Suggestions" clicked', async () => {
    render(<RecipesPage />)

    const button = screen.getByText('Get Suggestions')
    fireEvent.click(button)

    await waitFor(() => {
      expect(mockFetchRecipes).toHaveBeenCalledWith({
        optimization: 'longevity',
        household_size: 2,
        llm_provider: 'claude',
        max_recipes: 10,
      })
    })
  })

  it('displays recipes when available', () => {
    const mockRecipes = [
      {
        id: '1',
        name: 'Pancakes',
        image: 'https://example.com/pancakes.jpg',
        servings: 4,
        ingredients: ['milk', 'eggs'],
        expiring_ingredients_used: ['milk'],
        rank: 1,
        reasoning: 'Uses expiring milk',
      },
    ]

    vi.mocked(useRecipesModule.useRecipes).mockReturnValue({
      recipes: mockRecipes,
      loading: false,
      error: null,
      message: null,
      fetchRecipes: mockFetchRecipes,
      clearRecipes: vi.fn(),
    })

    render(<RecipesPage />)

    expect(screen.getByText('Pancakes')).toBeInTheDocument()
  })

  it('calls cookRecipe when "Cook this" clicked', async () => {
    const mockRecipes = [
      {
        id: '1',
        name: 'Pancakes',
        image: 'https://example.com/pancakes.jpg',
        servings: 4,
        ingredients: ['milk', 'eggs'],
        expiring_ingredients_used: ['milk'],
        rank: 1,
        reasoning: 'Uses expiring milk',
      },
    ]

    vi.mocked(useRecipesModule.useRecipes).mockReturnValue({
      recipes: mockRecipes,
      loading: false,
      error: null,
      message: null,
      fetchRecipes: mockFetchRecipes,
      clearRecipes: vi.fn(),
    })

    // Mock window.confirm
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

    render(<RecipesPage />)

    const cookButton = screen.getByText('Cook this')
    fireEvent.click(cookButton)

    await waitFor(() => {
      expect(confirmSpy).toHaveBeenCalledWith('Mark ingredients for "Pancakes" as consumed?')
      expect(mockCookRecipe).toHaveBeenCalledWith(mockRecipes[0])
    })

    confirmSpy.mockRestore()
    alertSpy.mockRestore()
  })
})
