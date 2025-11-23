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
