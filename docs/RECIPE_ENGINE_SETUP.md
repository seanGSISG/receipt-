# Recipe Engine Setup Guide

## Prerequisites

1. Completed Phase 1 MVP (inventory system)
2. Supabase project with proper database schema
3. API keys for external services

## Required API Keys

### 1. Spoonacular API

1. Sign up at https://spoonacular.com/food-api
2. Get your API key from the dashboard
3. Free tier: 150 requests/day

### 2. Anthropic Claude API (Recommended)

1. Sign up at https://console.anthropic.com
2. Generate an API key
3. Pricing: ~$3 per 1M input tokens, ~$15 per 1M output tokens

### 3. OpenAI API (Alternative)

1. Sign up at https://platform.openai.com
2. Generate an API key
3. Recommended model: `gpt-4o-mini`

### 4. Ollama (Optional - Local LLM)

1. Install Ollama: https://ollama.ai
2. Pull model: `ollama pull llama3.2`
3. Run: `ollama serve`
4. Free and runs locally

## Supabase Edge Function Environment Variables

Add these secrets to your Supabase project:

```bash
# Navigate to your Supabase project dashboard
# Go to Settings > Edge Functions > Secrets

SPOONACULAR_API_KEY=your_spoonacular_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
OPENAI_API_KEY=your_openai_key_here
OLLAMA_BASE_URL=http://localhost:11434
```

### Using Supabase CLI

```bash
supabase secrets set SPOONACULAR_API_KEY=your_key_here
supabase secrets set ANTHROPIC_API_KEY=your_key_here
supabase secrets set OPENAI_API_KEY=your_key_here
```

## Local Development Setup

Create `.env.local` file:

```bash
# Not needed for frontend, all API calls go through edge functions
# Edge functions read from Supabase secrets
```

## Deploy Edge Functions

```bash
# Deploy suggest-recipes function
supabase functions deploy suggest-recipes

# Test deployment
supabase functions invoke suggest-recipes \
  --body '{"optimization":"longevity","household_size":2}' \
  --header "Authorization: Bearer YOUR_ANON_KEY"
```

## Testing

### Unit Tests

```bash
npm test
```

### E2E Tests

```bash
# Start dev server
npm run dev

# Run E2E tests
npx playwright test tests/e2e/recipe-suggestions.spec.ts
```

## Cost Estimation

For 1000 users with 10 recipe suggestions per week:

- **Spoonacular**: 40,000 requests/month = $0 (free tier) or $60/month (paid)
- **Claude API**: ~500K tokens/month = ~$10/month
- **OpenAI API**: ~500K tokens/month = ~$5/month (gpt-4o-mini)
- **Ollama**: Free (self-hosted)

**Recommended**: Start with Claude API for best results, fallback to Ollama for development.

## Troubleshooting

### "SPOONACULAR_API_KEY not configured"

- Verify secrets are set in Supabase dashboard
- Redeploy edge function after adding secrets

### "Claude API error: 401"

- Check API key is valid
- Verify billing is set up on Anthropic account

### "No recipes found"

- Ensure inventory has items
- Check Spoonacular API quota not exceeded
- Verify ingredient names match common food items

### LLM Ranking Fallback

If LLM fails, the system automatically falls back to simple scoring:
- Ranks by number of expiring ingredients used
- No reasoning provided
- Still functional but less intelligent

## Next Steps

1. Add user preferences (dietary restrictions, allergies)
2. Implement recipe ratings and history
3. Add caching for frequently requested recipes
4. Implement recipe search by cuisine type
