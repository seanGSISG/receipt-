# Recipe Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an intelligent recipe suggestion system that prioritizes expiring ingredients using LLM-powered ranking and external recipe APIs.

**Architecture:** Edge-function-heavy approach with suggest-recipes Deno function that orchestrates recipe API calls (Spoonacular), LLM ranking (Claude/OpenAI/Ollama), and inventory analysis. Frontend displays ranked recipes with expiring ingredient highlights and "Cook this" actions.

**Tech Stack:** React + TypeScript, Supabase Edge Functions (Deno), Spoonacular API, Anthropic Claude API, OpenAI API, Ollama (optional), Vitest, Playwright

---

## Prerequisites

Before starting, ensure:
- Phase 1 MVP is complete (inventory system working)
- Supabase project has `recipe_history` table and `get_expiring_items` function
- Development environment has access to API keys for testing

---

## Task 1: Setup Recipe API Integration Module

**Files:**
- Create: `supabase/functions/suggest-recipes/spoonacular.ts`
- Create: `supabase/functions/suggest-recipes/types.ts`

### Step 1: Write types for recipe data structures

Create `supabase/functions/suggest-recipes/types.ts`:

```typescript
export interface RecipeIngredient {
  id: number
  name: string
  amount: number
  unit: string
}

export interface SpoonacularRecipe {
  id: number
  title: string
  image: string
  usedIngredients: RecipeIngredient[]
  missedIngredients: RecipeIngredient[]
  unusedIngredients: RecipeIngredient[]
  likes: number
}

export interface RankedRecipe {
  id: string
  name: string
  image: string
  servings: number
  ingredients: string[]
  expiring_ingredients_used: string[]
  rank: number
  reasoning: string
  spoonacular_url?: string
}

export interface InventoryItem {
  id: string
  product_name: string
  category: string
  expiration_date: string
  days_until_expiry: number
  quantity: number
}
```

### Step 2: Commit types

```bash
git add supabase/functions/suggest-recipes/types.ts
git commit -m "feat: add recipe engine type definitions"
```

### Step 3: Write Spoonacular API client with error handling

Create `supabase/functions/suggest-recipes/spoonacular.ts`:

```typescript
import { SpoonacularRecipe } from './types.ts'

const SPOONACULAR_API_KEY = Deno.env.get('SPOONACULAR_API_KEY')
const BASE_URL = 'https://api.spoonacular.com'

export async function findRecipesByIngredients(
  ingredients: string[],
  number: number = 10
): Promise<SpoonacularRecipe[]> {
  if (!SPOONACULAR_API_KEY) {
    throw new Error('SPOONACULAR_API_KEY not configured')
  }

  const ingredientList = ingredients.join(',+')
  const url = `${BASE_URL}/recipes/findByIngredients?apiKey=${SPOONACULAR_API_KEY}&ingredients=${ingredientList}&number=${number}&ranking=2&ignorePantry=true`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (response.status === 402) {
      throw new Error('Spoonacular API quota exceeded')
    }

    if (!response.ok) {
      throw new Error(`Spoonacular API error: ${response.status}`)
    }

    const recipes: SpoonacularRecipe[] = await response.json()
    return recipes
  } catch (error) {
    console.error('Spoonacular API error:', error)
    throw error
  }
}

export async function getRecipeInformation(recipeId: number): Promise<any> {
  if (!SPOONACULAR_API_KEY) {
    throw new Error('SPOONACULAR_API_KEY not configured')
  }

  const url = `${BASE_URL}/recipes/${recipeId}/information?apiKey=${SPOONACULAR_API_KEY}&includeNutrition=false`

  try {
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Spoonacular API error: ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    console.error('Spoonacular getRecipeInformation error:', error)
    throw error
  }
}
```

### Step 4: Commit Spoonacular integration

```bash
git add supabase/functions/suggest-recipes/spoonacular.ts
git commit -m "feat: add Spoonacular API client"
```

---

## Task 2: Setup LLM Integration Module

**Files:**
- Create: `supabase/functions/suggest-recipes/llm.ts`

### Step 1: Write LLM integration with multi-provider support

Create `supabase/functions/suggest-recipes/llm.ts`:

```typescript
import { SpoonacularRecipe, InventoryItem } from './types.ts'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
const OLLAMA_BASE_URL = Deno.env.get('OLLAMA_BASE_URL') || 'http://localhost:11434'

export type LLMProvider = 'claude' | 'openai' | 'ollama'

interface LLMRankingResult {
  recipe_id: string
  rank: number
  reasoning: string
  expiring_ingredients_used: string[]
}

function buildPrompt(
  recipes: SpoonacularRecipe[],
  inventory: InventoryItem[],
  expiringItems: InventoryItem[],
  optimization: 'longevity' | 'serve_count',
  householdSize: number
): string {
  const allIngredients = inventory.map(i => i.product_name).join(', ')
  const expiringIngredients = expiringItems.map(i =>
    `${i.product_name} (expires in ${i.days_until_expiry} days)`
  ).join(', ')

  const recipeSummaries = recipes.map(r => ({
    id: r.id,
    name: r.title,
    used_ingredients: r.usedIngredients.map(i => i.name),
    missed_ingredients: r.missedIngredients.map(i => i.name),
  }))

  return `You are a meal planning assistant helping reduce food waste.

Available ingredients in pantry: ${allIngredients}

Ingredients expiring soon (PRIORITIZE THESE): ${expiringIngredients}

User preferences:
- Optimization mode: ${optimization === 'longevity' ? 'Reduce waste by using expiring items' : 'Maximize servings for household'}
- Household size: ${householdSize} people

Recipe candidates from API:
${JSON.stringify(recipeSummaries, null, 2)}

Task: Rank these recipes from 1-${recipes.length}, prioritizing those that:
1. Use the MOST expiring ingredients (highest priority)
2. Match the optimization preference
3. Require fewest additional ingredients

Return ONLY valid JSON in this exact format:
[
  {
    "recipe_id": "123",
    "rank": 1,
    "reasoning": "Uses milk (2 days left) and eggs (3 days left)",
    "expiring_ingredients_used": ["milk", "eggs"]
  }
]`
}

async function callClaude(prompt: string): Promise<LLMRankingResult[]> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`)
  }

  const data = await response.json()
  const content = data.content[0].text

  // Extract JSON from potential markdown code blocks
  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    throw new Error('Failed to parse Claude response')
  }

  return JSON.parse(jsonMatch[0])
}

async function callOpenAI(prompt: string): Promise<LLMRankingResult[]> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured')
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a meal planning assistant. Return only valid JSON.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`)
  }

  const data = await response.json()
  const content = data.choices[0].message.content

  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    throw new Error('Failed to parse OpenAI response')
  }

  return JSON.parse(jsonMatch[0])
}

async function callOllama(prompt: string): Promise<LLMRankingResult[]> {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama3.2',
      prompt: prompt,
      stream: false,
      format: 'json',
    }),
  })

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status}`)
  }

  const data = await response.json()
  const content = data.response

  return JSON.parse(content)
}

export async function rankRecipesWithLLM(
  recipes: SpoonacularRecipe[],
  inventory: InventoryItem[],
  expiringItems: InventoryItem[],
  optimization: 'longevity' | 'serve_count',
  householdSize: number,
  provider: LLMProvider = 'claude'
): Promise<LLMRankingResult[]> {
  const prompt = buildPrompt(recipes, inventory, expiringItems, optimization, householdSize)

  try {
    switch (provider) {
      case 'claude':
        return await callClaude(prompt)
      case 'openai':
        return await callOpenAI(prompt)
      case 'ollama':
        return await callOllama(prompt)
      default:
        throw new Error(`Unknown LLM provider: ${provider}`)
    }
  } catch (error) {
    console.error(`LLM ranking error (${provider}):`, error)
    // Fallback to simple scoring
    return fallbackRanking(recipes, expiringItems)
  }
}

function fallbackRanking(
  recipes: SpoonacularRecipe[],
  expiringItems: InventoryItem[]
): LLMRankingResult[] {
  const expiringNames = expiringItems.map(i => i.product_name.toLowerCase())

  return recipes
    .map((recipe, index) => {
      const usedIngredients = recipe.usedIngredients.map(i => i.name.toLowerCase())
      const expiringUsed = usedIngredients.filter(ing =>
        expiringNames.some(exp => ing.includes(exp) || exp.includes(ing))
      )

      return {
        recipe_id: recipe.id.toString(),
        rank: index + 1,
        reasoning: `Uses ${usedIngredients.length} available ingredients, ${expiringUsed.length} expiring`,
        expiring_ingredients_used: expiringUsed,
      }
    })
    .sort((a, b) => b.expiring_ingredients_used.length - a.expiring_ingredients_used.length)
    .map((result, index) => ({ ...result, rank: index + 1 }))
}
```

### Step 2: Commit LLM integration

```bash
git add supabase/functions/suggest-recipes/llm.ts
git commit -m "feat: add multi-provider LLM integration for recipe ranking"
```

---

## Task 3: Build suggest-recipes Edge Function

**Files:**
- Create: `supabase/functions/suggest-recipes/index.ts`

### Step 1: Write the main edge function

Create `supabase/functions/suggest-recipes/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { findRecipesByIngredients, getRecipeInformation } from './spoonacular.ts'
import { rankRecipesWithLLM, LLMProvider } from './llm.ts'
import { RankedRecipe, InventoryItem } from './types.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const {
      optimization = 'longevity',
      household_size = 2,
      llm_provider = 'claude',
      max_recipes = 10,
    } = await req.json()

    // Validate inputs
    if (!['longevity', 'serve_count'].includes(optimization)) {
      return new Response(
        JSON.stringify({ error: 'Invalid optimization mode' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch all inventory items
    const { data: inventory, error: invError } = await supabase
      .from('inventory')
      .select('id, product_name, category, expiration_date, days_until_expiry, quantity')
      .eq('user_id', user.id)
      .gt('quantity', 0)
      .order('days_until_expiry', { ascending: true })

    if (invError) {
      throw invError
    }

    if (!inventory || inventory.length === 0) {
      return new Response(
        JSON.stringify({
          recipes: [],
          message: 'Add ingredients to your inventory to get recipe suggestions'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get expiring items (7 days or less)
    const { data: expiringItems, error: expError } = await supabase
      .rpc('get_expiring_items', {
        p_user_id: user.id,
        p_days: 7,
      })

    if (expError) {
      throw expError
    }

    // Build ingredient list for recipe API
    const ingredientNames = inventory.map((item: InventoryItem) => item.product_name)

    // Call Spoonacular API
    const spoonacularRecipes = await findRecipesByIngredients(
      ingredientNames,
      max_recipes
    )

    if (spoonacularRecipes.length === 0) {
      return new Response(
        JSON.stringify({
          recipes: [],
          message: 'No recipes found with current ingredients'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Rank recipes with LLM
    const rankings = await rankRecipesWithLLM(
      spoonacularRecipes,
      inventory,
      expiringItems || [],
      optimization,
      household_size,
      llm_provider as LLMProvider
    )

    // Merge rankings with recipe data
    const rankedRecipes: RankedRecipe[] = await Promise.all(
      rankings.map(async (ranking) => {
        const recipe = spoonacularRecipes.find(r => r.id.toString() === ranking.recipe_id)

        if (!recipe) {
          throw new Error(`Recipe ${ranking.recipe_id} not found`)
        }

        // Get detailed recipe info for servings
        const detailedInfo = await getRecipeInformation(recipe.id)

        const allIngredients = [
          ...recipe.usedIngredients.map(i => i.name),
          ...recipe.missedIngredients.map(i => i.name),
        ]

        return {
          id: recipe.id.toString(),
          name: recipe.title,
          image: recipe.image,
          servings: detailedInfo.servings || 4,
          ingredients: allIngredients,
          expiring_ingredients_used: ranking.expiring_ingredients_used,
          rank: ranking.rank,
          reasoning: ranking.reasoning,
          spoonacular_url: `https://spoonacular.com/recipes/${recipe.title.replace(/\s+/g, '-')}-${recipe.id}`,
        }
      })
    )

    // Sort by rank
    rankedRecipes.sort((a, b) => a.rank - b.rank)

    return new Response(
      JSON.stringify({ recipes: rankedRecipes }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('suggest-recipes error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

### Step 2: Commit edge function

```bash
git add supabase/functions/suggest-recipes/index.ts
git commit -m "feat: add suggest-recipes edge function"
```

---

## Task 4: Add Frontend Recipe Types

**Files:**
- Create: `src/types/recipe.types.ts`

### Step 1: Define frontend recipe types

Create `src/types/recipe.types.ts`:

```typescript
export interface Recipe {
  id: string
  name: string
  image: string
  servings: number
  ingredients: string[]
  expiring_ingredients_used: string[]
  rank: number
  reasoning: string
  spoonacular_url?: string
}

export interface SuggestRecipesRequest {
  optimization: 'longevity' | 'serve_count'
  household_size: number
  llm_provider?: 'claude' | 'openai' | 'ollama'
  max_recipes?: number
}

export interface SuggestRecipesResponse {
  recipes: Recipe[]
  message?: string
}
```

### Step 2: Commit frontend types

```bash
git add src/types/recipe.types.ts
git commit -m "feat: add frontend recipe types"
```

---

## Task 5: Create useRecipes Hook

**Files:**
- Create: `src/hooks/useRecipes.ts`
- Create: `src/hooks/__tests__/useRecipes.test.ts`

### Step 1: Write test for useRecipes hook

Create `src/hooks/__tests__/useRecipes.test.ts`:

```typescript
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
```

### Step 2: Run test to verify it fails

Run: `npm test -- src/hooks/__tests__/useRecipes.test.ts`

Expected: FAIL with "Cannot find module '../useRecipes'"

### Step 3: Implement useRecipes hook

Create `src/hooks/useRecipes.ts`:

```typescript
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Recipe, SuggestRecipesRequest, SuggestRecipesResponse } from '../types/recipe.types'

export function useRecipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const fetchRecipes = async (request: SuggestRecipesRequest) => {
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const { data, error: invokeError } = await supabase.functions.invoke<SuggestRecipesResponse>(
        'suggest-recipes',
        {
          body: request,
        }
      )

      if (invokeError) {
        throw invokeError
      }

      if (data) {
        setRecipes(data.recipes || [])
        setMessage(data.message || null)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch recipes')
      setRecipes([])
    } finally {
      setLoading(false)
    }
  }

  const clearRecipes = () => {
    setRecipes([])
    setError(null)
    setMessage(null)
  }

  return {
    recipes,
    loading,
    error,
    message,
    fetchRecipes,
    clearRecipes,
  }
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- src/hooks/__tests__/useRecipes.test.ts`

Expected: PASS (all tests green)

### Step 5: Commit useRecipes hook

```bash
git add src/hooks/useRecipes.ts src/hooks/__tests__/useRecipes.test.ts
git commit -m "feat: add useRecipes hook with tests"
```

---

## Task 6: Create RecipeCard Component

**Files:**
- Create: `src/components/RecipeCard.tsx`
- Create: `src/components/__tests__/RecipeCard.test.tsx`

### Step 1: Write test for RecipeCard component

Create `src/components/__tests__/RecipeCard.test.tsx`:

```typescript
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

    const milkElement = screen.getByText(/milk/i)
    const eggsElement = screen.getByText(/eggs/i)

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
```

### Step 2: Run test to verify it fails

Run: `npm test -- src/components/__tests__/RecipeCard.test.tsx`

Expected: FAIL with "Cannot find module '../RecipeCard'"

### Step 3: Implement RecipeCard component

Create `src/components/RecipeCard.tsx`:

```typescript
import { Recipe } from '../types/recipe.types'

interface RecipeCardProps {
  recipe: Recipe
  onCook: (recipe: Recipe) => void
}

export function RecipeCard({ recipe, onCook }: RecipeCardProps) {
  const isExpiring = (ingredient: string) => {
    return recipe.expiring_ingredients_used.some(
      exp => exp.toLowerCase() === ingredient.toLowerCase()
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="relative">
        <img
          src={recipe.image}
          alt={recipe.name}
          className="w-full h-48 object-cover"
        />
        <div className="absolute top-2 left-2 bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
          #{recipe.rank}
        </div>
      </div>

      <div className="p-4">
        <h3 className="text-xl font-bold mb-2">{recipe.name}</h3>

        <p className="text-gray-600 text-sm mb-3">Serves {recipe.servings}</p>

        {recipe.reasoning && (
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 mb-3">
            <p className="text-sm text-yellow-800">
              <span className="font-semibold">Why this recipe: </span>
              {recipe.reasoning}
            </p>
          </div>
        )}

        <div className="mb-4">
          <h4 className="font-semibold text-sm mb-2">Ingredients:</h4>
          <div className="flex flex-wrap gap-2">
            {recipe.ingredients.map((ingredient, index) => (
              <span
                key={index}
                className={`px-2 py-1 rounded-full text-xs ${
                  isExpiring(ingredient)
                    ? 'bg-red-100 text-red-700 font-semibold'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                {ingredient}
                {isExpiring(ingredient) && ' ⚠️'}
              </span>
            ))}
          </div>
        </div>

        {recipe.expiring_ingredients_used.length > 0 && (
          <div className="mb-4">
            <p className="text-sm text-red-600">
              <strong>Expiring soon:</strong>{' '}
              {recipe.expiring_ingredients_used.join(', ')}
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => onCook(recipe)}
            className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 font-semibold"
          >
            Cook this
          </button>

          {recipe.spoonacular_url && (
            <a
              href={recipe.spoonacular_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-center font-semibold"
            >
              View full recipe
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- src/components/__tests__/RecipeCard.test.tsx`

Expected: PASS (all tests green)

### Step 5: Commit RecipeCard component

```bash
git add src/components/RecipeCard.tsx src/components/__tests__/RecipeCard.test.tsx
git commit -m "feat: add RecipeCard component with expiring ingredient highlights"
```

---

## Task 7: Create useCookRecipe Hook

**Files:**
- Create: `src/hooks/useCookRecipe.ts`
- Create: `src/hooks/__tests__/useCookRecipe.test.ts`

### Step 1: Write test for useCookRecipe hook

Create `src/hooks/__tests__/useCookRecipe.test.ts`:

```typescript
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

    await result.current.cookRecipe(mockRecipe)

    await waitFor(() => {
      expect(result.current.error).toBe('Database error')
    })
  })
})
```

### Step 2: Run test to verify it fails

Run: `npm test -- src/hooks/__tests__/useCookRecipe.test.ts`

Expected: FAIL with "Cannot find module '../useCookRecipe'"

### Step 3: Implement useCookRecipe hook

Create `src/hooks/useCookRecipe.ts`:

```typescript
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Recipe } from '../types/recipe.types'

export function useCookRecipe() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cookRecipe = async (recipe: Recipe) => {
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('User not authenticated')
      }

      // Get all inventory items matching recipe ingredients
      const { data: inventoryItems, error: fetchError } = await supabase
        .from('inventory')
        .select('id, product_name, quantity')
        .eq('user_id', user.id)
        .in('product_name', recipe.ingredients)

      if (fetchError) {
        throw fetchError
      }

      if (!inventoryItems || inventoryItems.length === 0) {
        throw new Error('No matching ingredients found in inventory')
      }

      // Decrement quantity for each ingredient (or delete if quantity becomes 0)
      for (const item of inventoryItems) {
        const newQuantity = (item.quantity || 1) - 1

        if (newQuantity <= 0) {
          // Delete item if quantity reaches 0
          const { error: deleteError } = await supabase
            .from('inventory')
            .delete()
            .eq('id', item.id)

          if (deleteError) {
            throw deleteError
          }
        } else {
          // Update quantity
          const { error: updateError } = await supabase
            .from('inventory')
            .update({ quantity: newQuantity })
            .eq('id', item.id)

          if (updateError) {
            throw updateError
          }
        }
      }

      // Log to recipe_history
      const { error: historyError } = await supabase
        .from('recipe_history')
        .insert({
          user_id: user.id,
          recipe_id: recipe.id,
          recipe_name: recipe.name,
          ingredients_used: recipe.ingredients,
        })

      if (historyError) {
        throw historyError
      }

    } catch (err: any) {
      setError(err.message || 'Failed to cook recipe')
      throw err
    } finally {
      setLoading(false)
    }
  }

  return {
    cookRecipe,
    loading,
    error,
  }
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- src/hooks/__tests__/useCookRecipe.test.ts`

Expected: PASS (all tests green)

### Step 5: Commit useCookRecipe hook

```bash
git add src/hooks/useCookRecipe.ts src/hooks/__tests__/useCookRecipe.test.ts
git commit -m "feat: add useCookRecipe hook for marking ingredients consumed"
```

---

## Task 8: Update RecipesPage Component

**Files:**
- Modify: `src/pages/RecipesPage.tsx`
- Create: `src/pages/__tests__/RecipesPage.test.tsx`

### Step 1: Write test for RecipesPage

Create `src/pages/__tests__/RecipesPage.test.tsx`:

```typescript
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

    render(<RecipesPage />)

    const cookButton = screen.getByText('Cook this')
    fireEvent.click(cookButton)

    await waitFor(() => {
      expect(mockCookRecipe).toHaveBeenCalledWith(mockRecipes[0])
    })
  })
})
```

### Step 2: Run test to verify it fails

Run: `npm test -- src/pages/__tests__/RecipesPage.test.tsx`

Expected: FAIL (RecipesPage doesn't have all features)

### Step 3: Update RecipesPage implementation

Read the existing file first:

```bash
cat src/pages/RecipesPage.tsx
```

### Step 4: Implement full RecipesPage with all features

Modify `src/pages/RecipesPage.tsx`:

```typescript
import { useState } from 'react'
import { useRecipes } from '../hooks/useRecipes'
import { useCookRecipe } from '../hooks/useCookRecipe'
import { RecipeCard } from '../components/RecipeCard'
import { Recipe } from '../types/recipe.types'

export function RecipesPage() {
  const [optimization, setOptimization] = useState<'longevity' | 'serve_count'>('longevity')
  const [householdSize, setHouseholdSize] = useState(2)
  const [llmProvider, setLlmProvider] = useState<'claude' | 'openai' | 'ollama'>('claude')

  const { recipes, loading, error, message, fetchRecipes, clearRecipes } = useRecipes()
  const { cookRecipe, loading: cookLoading, error: cookError } = useCookRecipe()

  const handleGetSuggestions = async () => {
    await fetchRecipes({
      optimization,
      household_size: householdSize,
      llm_provider: llmProvider,
      max_recipes: 10,
    })
  }

  const handleCookRecipe = async (recipe: Recipe) => {
    if (confirm(`Mark ingredients for "${recipe.name}" as consumed?`)) {
      try {
        await cookRecipe(recipe)
        alert('Recipe cooked! Ingredients marked as consumed.')
        clearRecipes()
      } catch (err) {
        // Error already set in useCookRecipe
      }
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Recipe Suggestions</h1>

      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-semibold mb-2">
              Optimization Mode
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setOptimization('longevity')}
                className={`flex-1 px-4 py-2 rounded-md ${
                  optimization === 'longevity'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                Make it last
              </button>
              <button
                onClick={() => setOptimization('serve_count')}
                className={`flex-1 px-4 py-2 rounded-md ${
                  optimization === 'serve_count'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700'
                }`}
              >
                Feed the family
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="household-size" className="block text-sm font-semibold mb-2">
              Household Size
            </label>
            <input
              id="household-size"
              type="number"
              min="1"
              max="12"
              value={householdSize}
              onChange={(e) => setHouseholdSize(parseInt(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label htmlFor="llm-provider" className="block text-sm font-semibold mb-2">
              LLM Provider
            </label>
            <select
              id="llm-provider"
              value={llmProvider}
              onChange={(e) => setLlmProvider(e.target.value as any)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md"
            >
              <option value="claude">Claude</option>
              <option value="openai">OpenAI</option>
              <option value="ollama">Ollama (local)</option>
            </select>
          </div>
        </div>

        <button
          onClick={handleGetSuggestions}
          disabled={loading}
          className="w-full bg-green-600 text-white px-6 py-3 rounded-md hover:bg-green-700 disabled:bg-gray-400 font-semibold"
        >
          {loading ? 'Loading recipes...' : 'Get Suggestions'}
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {cookError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {cookError}
        </div>
      )}

      {message && (
        <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">
          {message}
        </div>
      )}

      {recipes.length > 0 && (
        <div>
          <h2 className="text-2xl font-bold mb-4">
            Recommended Recipes ({recipes.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onCook={handleCookRecipe}
              />
            ))}
          </div>
        </div>
      )}

      {cookLoading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg">
            <p className="text-lg">Marking ingredients as consumed...</p>
          </div>
        </div>
      )}
    </div>
  )
}
```

### Step 5: Run test to verify it passes

Run: `npm test -- src/pages/__tests__/RecipesPage.test.tsx`

Expected: PASS (all tests green)

### Step 6: Commit updated RecipesPage

```bash
git add src/pages/RecipesPage.tsx src/pages/__tests__/RecipesPage.test.tsx
git commit -m "feat: update RecipesPage with optimization modes and cook action"
```

---

## Task 9: Add E2E Test for Recipe Flow

**Files:**
- Create: `tests/e2e/recipe-suggestions.spec.ts`

### Step 1: Write E2E test for complete recipe flow

Create `tests/e2e/recipe-suggestions.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test.describe('Recipe Suggestions Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('http://localhost:5173')
    await page.getByPlaceholder('Email').fill('test@example.com')
    await page.getByPlaceholder('Password').fill('password123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL('**/inventory')
  })

  test('user can get recipe suggestions and cook a recipe', async ({ page }) => {
    // Navigate to recipes page
    await page.goto('http://localhost:5173/recipes')

    // Verify page loaded
    await expect(page.getByText('Recipe Suggestions')).toBeVisible()

    // Set optimization mode
    await page.getByRole('button', { name: 'Make it last' }).click()

    // Set household size
    await page.getByLabel(/household size/i).fill('4')

    // Select LLM provider
    await page.getByLabel(/llm provider/i).selectOption('claude')

    // Click get suggestions
    await page.getByRole('button', { name: 'Get Suggestions' }).click()

    // Wait for recipes to load (this might take a while due to API calls)
    await expect(page.getByText('Recommended Recipes')).toBeVisible({ timeout: 30000 })

    // Verify at least one recipe card is displayed
    const recipeCards = page.locator('[class*="RecipeCard"]').first()
    await expect(recipeCards).toBeVisible()

    // Verify expiring ingredients are highlighted
    await expect(page.locator('.text-red-700').first()).toBeVisible()

    // Click "Cook this" on first recipe
    await page.getByRole('button', { name: 'Cook this' }).first().click()

    // Confirm the dialog
    page.on('dialog', dialog => dialog.accept())

    // Wait for success message
    await expect(page.getByText(/ingredients marked as consumed/i)).toBeVisible()
  })

  test('handles empty inventory gracefully', async ({ page }) => {
    // Clear all inventory first (would need API call or manual setup)

    await page.goto('http://localhost:5173/recipes')

    await page.getByRole('button', { name: 'Get Suggestions' }).click()

    // Should show message about adding ingredients
    await expect(
      page.getByText(/add ingredients to your inventory/i)
    ).toBeVisible({ timeout: 15000 })
  })

  test('user can switch optimization modes', async ({ page }) => {
    await page.goto('http://localhost:5173/recipes')

    // Click "Feed the family" mode
    await page.getByRole('button', { name: 'Feed the family' }).click()

    // Verify button is selected
    await expect(
      page.getByRole('button', { name: 'Feed the family' })
    ).toHaveClass(/bg-blue-600/)

    // Get suggestions with serve_count optimization
    await page.getByRole('button', { name: 'Get Suggestions' }).click()

    await expect(page.getByText('Recommended Recipes')).toBeVisible({ timeout: 30000 })
  })

  test('displays error message when API fails', async ({ page }) => {
    // Mock API failure (would need to set up mock interceptor)
    await page.route('**/functions/v1/suggest-recipes', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal server error' }),
      })
    })

    await page.goto('http://localhost:5173/recipes')

    await page.getByRole('button', { name: 'Get Suggestions' }).click()

    await expect(page.getByText(/error/i)).toBeVisible()
  })
})
```

### Step 2: Commit E2E tests

```bash
git add tests/e2e/recipe-suggestions.spec.ts
git commit -m "test: add E2E tests for recipe suggestion flow"
```

---

## Task 10: Update Environment Variables Documentation

**Files:**
- Create: `docs/RECIPE_ENGINE_SETUP.md`

### Step 1: Write setup documentation

Create `docs/RECIPE_ENGINE_SETUP.md`:

```markdown
# Recipe Engine Setup Guide

## Prerequisites

1. Completed Phase 1 MVP (inventory system)
2. Supabase project with proper database schema
3. API keys for external services

## Required API Keys

### 1. Spoonacular API

1. Sign up at https://spoonacular.com/food-api
2. Get your API key from the dashboard
3. Free tier: 150 requests/day

### 2. Anthropic Claude API (Recommended)

1. Sign up at https://console.anthropic.com
2. Generate an API key
3. Pricing: ~$3 per 1M input tokens, ~$15 per 1M output tokens

### 3. OpenAI API (Alternative)

1. Sign up at https://platform.openai.com
2. Generate an API key
3. Recommended model: `gpt-4o-mini`

### 4. Ollama (Optional - Local LLM)

1. Install Ollama: https://ollama.ai
2. Pull model: `ollama pull llama3.2`
3. Run: `ollama serve`
4. Free and runs locally

## Supabase Edge Function Environment Variables

Add these secrets to your Supabase project:

```bash
# Navigate to your Supabase project dashboard
# Go to Settings > Edge Functions > Secrets

SPOONACULAR_API_KEY=your_spoonacular_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
OPENAI_API_KEY=your_openai_key_here
OLLAMA_BASE_URL=http://localhost:11434
```

### Using Supabase CLI

```bash
supabase secrets set SPOONACULAR_API_KEY=your_key_here
supabase secrets set ANTHROPIC_API_KEY=your_key_here
supabase secrets set OPENAI_API_KEY=your_key_here
```

## Local Development Setup

Create `.env.local` file:

```bash
# Not needed for frontend, all API calls go through edge functions
# Edge functions read from Supabase secrets
```

## Deploy Edge Functions

```bash
# Deploy suggest-recipes function
supabase functions deploy suggest-recipes

# Test deployment
supabase functions invoke suggest-recipes \
  --body '{"optimization":"longevity","household_size":2}' \
  --header "Authorization: Bearer YOUR_ANON_KEY"
```

## Testing

### Unit Tests

```bash
npm test
```

### E2E Tests

```bash
# Start dev server
npm run dev

# Run E2E tests
npx playwright test tests/e2e/recipe-suggestions.spec.ts
```

## Cost Estimation

For 1000 users with 10 recipe suggestions per week:

- **Spoonacular**: 40,000 requests/month = $0 (free tier) or $60/month (paid)
- **Claude API**: ~500K tokens/month = ~$10/month
- **OpenAI API**: ~500K tokens/month = ~$5/month (gpt-4o-mini)
- **Ollama**: Free (self-hosted)

**Recommended**: Start with Claude API for best results, fallback to Ollama for development.

## Troubleshooting

### "SPOONACULAR_API_KEY not configured"

- Verify secrets are set in Supabase dashboard
- Redeploy edge function after adding secrets

### "Claude API error: 401"

- Check API key is valid
- Verify billing is set up on Anthropic account

### "No recipes found"

- Ensure inventory has items
- Check Spoonacular API quota not exceeded
- Verify ingredient names match common food items

### LLM Ranking Fallback

If LLM fails, the system automatically falls back to simple scoring:
- Ranks by number of expiring ingredients used
- No reasoning provided
- Still functional but less intelligent

## Next Steps

1. Add user preferences (dietary restrictions, allergies)
2. Implement recipe ratings and history
3. Add caching for frequently requested recipes
4. Implement recipe search by cuisine type
```

### Step 2: Commit documentation

```bash
git add docs/RECIPE_ENGINE_SETUP.md
git commit -m "docs: add recipe engine setup guide"
```

---

## Task 11: Update Main README

**Files:**
- Modify: `README.md`

### Step 1: Update README with Phase 2 information

Read existing README:

```bash
cat README.md
```

### Step 2: Add Phase 2 section to README

Add this section to `README.md` after Phase 1 section:

```markdown
## Phase 2: Recipe Engine ✅

Smart recipe suggestions powered by AI.

### Features

- 🤖 **AI-Powered Ranking**: Claude, OpenAI, or Ollama ranks recipes by expiring ingredients
- 🍳 **Recipe API Integration**: Spoonacular provides recipe data
- ⚠️ **Expiring Ingredient Highlights**: Visual indicators for soon-to-expire items
- 🎯 **Optimization Modes**:
  - Make it last: Prioritize using expiring ingredients
  - Feed the family: Maximize servings per household size
- ✅ **Cook This Action**: Mark ingredients as consumed, log to history

### Setup

See [RECIPE_ENGINE_SETUP.md](docs/RECIPE_ENGINE_SETUP.md) for detailed setup instructions.

Quick start:

```bash
# Add API keys to Supabase
supabase secrets set SPOONACULAR_API_KEY=your_key
supabase secrets set ANTHROPIC_API_KEY=your_key

# Deploy edge function
supabase functions deploy suggest-recipes

# Test
npm test
npx playwright test tests/e2e/recipe-suggestions.spec.ts
```
```

### Step 3: Commit updated README

```bash
git add README.md
git commit -m "docs: update README with Phase 2 recipe engine features"
```

---

## Verification Checklist

Before marking Phase 2 complete, verify:

### Edge Functions

- [ ] `supabase/functions/suggest-recipes/index.ts` exists and handles auth
- [ ] `supabase/functions/suggest-recipes/spoonacular.ts` fetches recipes correctly
- [ ] `supabase/functions/suggest-recipes/llm.ts` supports Claude, OpenAI, and Ollama
- [ ] Error handling works (API failures fall back gracefully)

### Frontend Components

- [ ] `RecipeCard` displays recipe info with expiring ingredient highlights
- [ ] `RecipesPage` has optimization mode toggles
- [ ] `RecipesPage` has household size input
- [ ] `RecipesPage` has LLM provider selector
- [ ] "Cook this" button marks ingredients as consumed

### Hooks

- [ ] `useRecipes` fetches recipes from edge function
- [ ] `useCookRecipe` decrements inventory quantities
- [ ] `useCookRecipe` logs to recipe_history table
- [ ] Error states are handled in all hooks

### Tests

- [ ] Unit tests pass: `npm test`
- [ ] E2E tests pass: `npx playwright test tests/e2e/recipe-suggestions.spec.ts`
- [ ] All test files have >80% coverage

### Database

- [ ] `recipe_history` table exists
- [ ] `get_expiring_items` function works correctly
- [ ] RLS policies prevent cross-user access

### Documentation

- [ ] `RECIPE_ENGINE_SETUP.md` has API key instructions
- [ ] README updated with Phase 2 features
- [ ] Code comments explain complex logic

### Run Full Verification

```bash
# Run all tests
npm test

# Run E2E tests
npx playwright test

# Build frontend
npm run build

# Deploy edge functions
supabase functions deploy suggest-recipes

# Test deployed function
supabase functions invoke suggest-recipes \
  --body '{"optimization":"longevity","household_size":2}' \
  --header "Authorization: Bearer YOUR_ANON_KEY"
```

---

## Success Criteria

Phase 2 is complete when:

1. ✅ User can request recipe suggestions from RecipesPage
2. ✅ Edge function fetches recipes from Spoonacular API
3. ✅ LLM (Claude/OpenAI/Ollama) ranks recipes intelligently
4. ✅ Recipes display with expiring ingredients highlighted in red
5. ✅ "Cook this" button marks ingredients as consumed
6. ✅ Recipe history is logged to database
7. ✅ Optimization modes (longevity vs serve_count) work correctly
8. ✅ All tests pass (unit + E2E)
9. ✅ Documentation is complete and accurate

---

## Notes

- **DRY**: Reuse types across frontend/backend where possible
- **YAGNI**: Don't add recipe caching yet, wait for Phase 3
- **TDD**: Write tests before implementation for all components
- **Commit Often**: Each task step should be a separate commit

**Estimated Total Time**: 3-4 hours (following bite-sized steps)

---

**Plan Version**: 1.0
**Created**: 2025-11-23
**Status**: Ready for Implementation
