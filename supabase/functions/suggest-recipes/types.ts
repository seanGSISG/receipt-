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
