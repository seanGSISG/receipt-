interface OpenFoodFactsProduct {
  product_name?: string
  categories?: string
  image_url?: string
  categories_tags?: string[]
}

interface OpenFoodFactsResponse {
  status: number
  product?: OpenFoodFactsProduct
}

export async function fetchProductData(barcode: string) {
  const url = `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'SmartPantry/1.0',
    },
  })

  if (!response.ok) {
    throw new Error('Failed to fetch product data')
  }

  const data: OpenFoodFactsResponse = await response.json()

  if (data.status !== 1 || !data.product) {
    return null // Product not found
  }

  return {
    name: data.product.product_name || 'Unknown Product',
    category: inferCategory(data.product.categories_tags || []),
    image_url: data.product.image_url || null,
  }
}

function inferCategory(tags: string[]): string {
  // Map OpenFoodFacts categories to our categories
  const categoryMap: Record<string, string> = {
    'en:dairy': 'Dairy',
    'en:dairies': 'Dairy',
    'en:milk': 'Dairy',
    'en:cheese': 'Dairy',
    'en:yogurt': 'Dairy',
    'en:meats': 'Meat',
    'en:fresh-meat': 'Meat',
    'en:seafood': 'Seafood',
    'en:fish': 'Seafood',
    'en:vegetables': 'Produce_Hard',
    'en:fruits': 'Produce_Fruit',
    'en:leafy-vegetables': 'Produce_Leafy',
    'en:salads': 'Produce_Leafy',
    'en:bread': 'Bread',
    'en:bakery': 'Bread',
    'en:eggs': 'Eggs',
    'en:frozen-foods': 'Frozen',
    'en:canned-foods': 'Pantry',
    'en:dry-products': 'Pantry',
  }

  for (const tag of tags) {
    const category = categoryMap[tag.toLowerCase()]
    if (category) return category
  }

  return 'Pantry' // Default to longest shelf life
}
