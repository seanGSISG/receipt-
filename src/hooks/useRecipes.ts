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
