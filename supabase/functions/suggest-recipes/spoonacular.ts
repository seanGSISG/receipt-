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
