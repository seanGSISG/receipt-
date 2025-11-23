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
