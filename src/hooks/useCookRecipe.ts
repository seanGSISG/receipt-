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
