# Smart Pantry PWA

A mobile-first Progressive Web App that helps reduce food waste by tracking grocery inventory, monitoring expiration dates, and suggesting recipes.

## Features (Phase 1 MVP)

- 📱 **Barcode Scanning**: Use your phone camera to scan grocery barcodes
- 📦 **Inventory Tracking**: Automatically catalog scanned items
- ⏰ **Expiration Monitoring**: Track when food will expire with color-coded badges
- 🔄 **Real-time Sync**: Inventory updates instantly across devices
- 📝 **Manual Entry**: Add items without barcodes

## Phase 2: Recipe Engine ✅

Smart recipe suggestions powered by AI.

### Features

- 🤖 **AI-Powered Ranking**: Claude, OpenAI, or Ollama ranks recipes by expiring ingredients
- 🍳 **Recipe API Integration**: Spoonacular provides recipe data
- ⚠️ **Expiring Ingredient Highlights**: Visual indicators for soon-to-expire items
- 🎯 **Optimization Modes**:
  - Make it last: Prioritize using expiring ingredients
  - Feed the family: Maximize servings per household size
- ✅ **Cook This Action**: Mark ingredients as consumed, log to history

### Setup

See [RECIPE_ENGINE_SETUP.md](docs/RECIPE_ENGINE_SETUP.md) for detailed setup instructions.

Quick start:

```bash
# Add API keys to Supabase
supabase secrets set SPOONACULAR_API_KEY=your_key
supabase secrets set ANTHROPIC_API_KEY=your_key

# Deploy edge function
supabase functions deploy suggest-recipes

# Test
npm test
npx playwright test tests/e2e/recipe-suggestions.spec.ts
```

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Edge Functions + Auth)
- **Barcode**: @zxing/browser
- **Testing**: Vitest + Playwright

## Quick Start

### Prerequisites

- Node.js 18+
- Supabase CLI

### Installation

1. Clone the repository
```bash
git clone <repo-url>
cd smart-pantry
```

2. Install dependencies
```bash
npm install
```

3. Start Supabase locally
```bash
supabase start
```

4. Copy environment variables
```bash
cp .env.example .env.local
# Update with your Supabase keys from `supabase start` output
```

5. Run the app
```bash
npm run dev
```

Visit http://localhost:5173

### Testing

```bash
# Unit tests
npm test

# E2E tests
npx playwright test

# E2E with UI
npx playwright test --ui
```

## Project Structure

```
smart-pantry/
├── src/
│   ├── components/      # React components
│   ├── pages/           # Page components
│   ├── hooks/           # Custom React hooks
│   ├── contexts/        # React contexts (Auth, etc.)
│   ├── lib/             # Utilities (Supabase client)
│   └── types/           # TypeScript types
├── supabase/
│   ├── migrations/      # Database migrations
│   └── functions/       # Edge Functions
├── tests/
│   └── e2e/             # Playwright tests
└── docs/                # Documentation
```

## Documentation

- [Setup Guide](docs/SETUP.md)
- [Design Document](docs/plans/2025-11-22-smart-pantry-design.md)
- [Implementation Plan](docs/plans/2025-11-22-smart-pantry-mvp-phase1.md)

## License

MIT
