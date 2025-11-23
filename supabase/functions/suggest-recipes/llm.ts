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

function extractJSON(content: string): LLMRankingResult[] {
  // Extract JSON from potential markdown code blocks
  const jsonMatch = content.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    throw new Error('Failed to extract JSON array from LLM response')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch (error) {
    throw new Error('Failed to parse JSON from LLM response')
  }

  // Validate structure
  if (!Array.isArray(parsed)) {
    throw new Error('LLM response is not an array')
  }

  if (parsed.length === 0) {
    throw new Error('LLM response returned empty array')
  }

  // Validate each result has required fields
  for (let i = 0; i < parsed.length; i++) {
    const result = parsed[i]
    if (typeof result !== 'object' || result === null) {
      throw new Error(`LLM response item ${i} is not an object`)
    }

    const requiredFields = ['recipe_id', 'rank', 'reasoning', 'expiring_ingredients_used']
    for (const field of requiredFields) {
      if (!(field in result)) {
        throw new Error(`LLM response item ${i} missing required field: ${field}`)
      }
    }

    // Type-check specific fields
    if (typeof result.recipe_id !== 'string') {
      throw new Error(`LLM response item ${i} has invalid recipe_id type`)
    }
    if (typeof result.rank !== 'number') {
      throw new Error(`LLM response item ${i} has invalid rank type`)
    }
    if (typeof result.reasoning !== 'string') {
      throw new Error(`LLM response item ${i} has invalid reasoning type`)
    }
    if (!Array.isArray(result.expiring_ingredients_used)) {
      throw new Error(`LLM response item ${i} has invalid expiring_ingredients_used type`)
    }
  }

  return parsed as LLMRankingResult[]
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

  return extractJSON(content)
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

  return extractJSON(content)
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

  return extractJSON(content)
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
