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
