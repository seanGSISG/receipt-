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
