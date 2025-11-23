import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RecipeCard } from '../RecipeCard'
import { Recipe } from '../../types/recipe.types'

describe('RecipeCard', () => {
  const mockRecipe: Recipe = {
    id: '1',
    name: 'Pancakes',
    image: 'https://example.com/pancakes.jpg',
    servings: 4,
    ingredients: ['milk', 'eggs', 'flour', 'sugar'],
    expiring_ingredients_used: ['milk', 'eggs'],
    rank: 1,
    reasoning: 'Uses milk (2 days) and eggs (3 days)',
    spoonacular_url: 'https://spoonacular.com/recipes/pancakes-123',
  }

  it('renders recipe information correctly', () => {
    render(<RecipeCard recipe={mockRecipe} onCook={() => {}} />)

    expect(screen.getByText('Pancakes')).toBeInTheDocument()
    expect(screen.getByText('Serves 4')).toBeInTheDocument()
    expect(screen.getByAltText('Pancakes')).toHaveAttribute('src', mockRecipe.image)
  })

  it('highlights expiring ingredients in red', () => {
    render(<RecipeCard recipe={mockRecipe} onCook={() => {}} />)

    // Look for ingredient badges with warning emoji (unique to expiring ingredients)
    const milkElement = screen.getByText(/milk\s+⚠️/i)
    const eggsElement = screen.getByText(/eggs\s+⚠️/i)

    expect(milkElement.className).toContain('text-red')
    expect(eggsElement.className).toContain('text-red')
  })

  it('shows reasoning when provided', () => {
    render(<RecipeCard recipe={mockRecipe} onCook={() => {}} />)

    expect(screen.getByText(/Uses milk \(2 days\) and eggs \(3 days\)/i)).toBeInTheDocument()
  })

  it('calls onCook when "Cook this" button clicked', () => {
    const onCookMock = vi.fn()
    render(<RecipeCard recipe={mockRecipe} onCook={onCookMock} />)

    const cookButton = screen.getByText('Cook this')
    fireEvent.click(cookButton)

    expect(onCookMock).toHaveBeenCalledWith(mockRecipe)
  })

  it('shows external recipe link', () => {
    render(<RecipeCard recipe={mockRecipe} onCook={() => {}} />)

    const link = screen.getByText('View full recipe')
    expect(link).toHaveAttribute('href', mockRecipe.spoonacular_url)
    expect(link).toHaveAttribute('target', '_blank')
  })
})
