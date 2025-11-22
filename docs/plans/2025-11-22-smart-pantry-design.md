# Smart Pantry PWA - Design Document

**Date**: 2025-11-22
**Status**: Approved Design
**Architecture**: Edge-Function-Heavy PWA with Supabase Backend

---

## 1. Overview

### Purpose
A mobile-first Progressive Web App that helps users reduce food waste by:
- Scanning grocery barcodes to build an inventory database
- Automatically tracking expiration dates based on product categories
- Suggesting recipes that prioritize soon-to-expire ingredients
- Optimizing meal planning by longevity or serving count

### Core Value Proposition
Enable users to scan barcodes, automatically track what's in their pantry/fridge, get intelligent recipe suggestions, and receive alerts before food expires.

---

## 2. High-Level Architecture

### System Components

1. **PWA Frontend** (React/Vue/Svelte + TypeScript)
   - Camera-based barcode scanner
   - Inventory dashboard with expiration warnings
   - Recipe suggestion interface
   - Offline-capable with service workers

2. **Supabase Backend**
   - PostgreSQL database
   - Authentication (email/OAuth)
   - Edge Functions (Deno runtime)
   - Real-time subscriptions

3. **External APIs**
   - OpenFoodFacts API (product metadata)
   - Recipe API (Spoonacular or Edamam)
   - LLM API (Claude or GPT-4)

### Architecture Pattern: Edge-Function-Heavy

- **Frontend PWA**: Handles UI, barcode scanning, camera integration
- **Supabase Edge Functions**: Orchestrates all external API calls, implements business logic
- **PostgreSQL**: Stores user inventory, preferences, cached product data
- **Real-time Subscriptions**: Live updates when items expire or new recipes available

**Rationale**: This approach keeps API keys secure, centralizes business logic for easy updates, and provides fast real-time updates while maintaining a clean frontend.

---

## 3. Data Flow

### Barcode Scanning Flow

```
User scans barcode
  → PWA captures camera image
  → Decode barcode number (ZXing/Quagga)
  → Call Edge Function "add-product" with barcode + quantity
  → Edge Function checks product_cache table
  → If not cached: Query OpenFoodFacts API
  → Extract product metadata (name, category, image)
  → Calculate expiration date based on category
  → Insert into inventory table
  → Real-time subscription triggers UI update
  → Display product card with expiration badge
```

### Recipe Suggestion Flow

```
User requests recipes
  → Call Edge Function "suggest-recipes"
  → Fetch current user inventory from PostgreSQL
  → Identify items expiring soon (< 3-7 days)
  → Build ingredient list
  → Call Recipe API with available ingredients
  → Receive recipe candidates
  → Format LLM prompt:
      "Given ingredients: [list]
       Prioritize using: [expiring items]
       Optimization: [longevity/serve_count]
       Rank these recipes: [API results]"
  → Call Claude/GPT API for intelligent ranking
  → Return ranked recipe list to PWA
  → Display recipes with expiring ingredients highlighted
```

---

## 4. Database Schema

### PostgreSQL Tables

#### users
```sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  created_at timestamp DEFAULT now(),
  preferences jsonb DEFAULT '{
    "household_size": 2,
    "dietary_restrictions": [],
    "expiration_buffer_days": 3
  }'::jsonb
);
```

#### inventory
```sql
CREATE TABLE inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  barcode text NOT NULL,
  product_name text NOT NULL,
  category text NOT NULL,
  image_url text,
  quantity int DEFAULT 1,
  added_date timestamp DEFAULT now(),
  expiration_date date NOT NULL,
  manual_expiry_override boolean DEFAULT false,

  -- Computed columns
  is_expired boolean GENERATED ALWAYS AS (expiration_date < CURRENT_DATE) STORED,
  days_until_expiry int GENERATED ALWAYS AS (expiration_date - CURRENT_DATE) STORED
);

CREATE INDEX idx_inventory_user_expiry ON inventory(user_id, expiration_date);
CREATE INDEX idx_inventory_barcode ON inventory(barcode);
```

#### product_cache
```sql
CREATE TABLE product_cache (
  barcode text PRIMARY KEY,
  product_data jsonb NOT NULL,
  last_updated timestamp DEFAULT now()
);

CREATE INDEX idx_product_cache_updated ON product_cache(last_updated);
```

#### recipe_history
```sql
CREATE TABLE recipe_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  recipe_id text NOT NULL,
  recipe_name text NOT NULL,
  ingredients_used text[] NOT NULL,
  created_at timestamp DEFAULT now(),
  rating int CHECK (rating BETWEEN 1 AND 5)
);

CREATE INDEX idx_recipe_history_user ON recipe_history(user_id, created_at DESC);
```

### PostgreSQL Functions

#### calculate_expiration
```sql
CREATE OR REPLACE FUNCTION calculate_expiration(
  p_category text,
  p_added_date date
) RETURNS date AS $$
DECLARE
  expiration_days int;
BEGIN
  expiration_days := CASE p_category
    WHEN 'Dairy' THEN 7
    WHEN 'Meat' THEN 3
    WHEN 'Seafood' THEN 2
    WHEN 'Produce_Leafy' THEN 5
    WHEN 'Produce_Hard' THEN 14
    WHEN 'Produce_Fruit' THEN 7
    WHEN 'Bread' THEN 5
    WHEN 'Eggs' THEN 21
    WHEN 'Deli' THEN 5
    WHEN 'Pantry' THEN 365
    WHEN 'Frozen' THEN 90
    ELSE 7  -- Conservative default
  END;

  RETURN p_added_date + expiration_days;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

#### get_expiring_items
```sql
CREATE OR REPLACE FUNCTION get_expiring_items(
  p_user_id uuid,
  p_days int DEFAULT 7
) RETURNS TABLE (
  id uuid,
  product_name text,
  category text,
  expiration_date date,
  days_until_expiry int
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.product_name,
    i.category,
    i.expiration_date,
    i.days_until_expiry
  FROM inventory i
  WHERE i.user_id = p_user_id
    AND i.days_until_expiry <= p_days
    AND i.days_until_expiry >= 0
    AND i.quantity > 0
  ORDER BY i.days_until_expiry ASC;
END;
$$ LANGUAGE plpgsql STABLE;
```

---

## 5. Supabase Edge Functions

### add-product

**Endpoint**: `POST /functions/v1/add-product`

**Input**:
```typescript
{
  barcode: string;
  quantity: number;
  manual_expiry?: string; // ISO date string
}
```

**Process**:
1. Authenticate user via Supabase Auth
2. Check `product_cache` table for barcode
3. If not cached:
   - Call OpenFoodFacts API: `https://world.openfoodfacts.org/api/v0/product/{barcode}.json`
   - Extract product name, category, image URL
   - Store in `product_cache`
4. Determine category from product data
5. If `manual_expiry` provided, use it; otherwise call `calculate_expiration(category, today)`
6. Insert into `inventory` table
7. Return product details + expiration date

**Output**:
```typescript
{
  success: boolean;
  product: {
    id: string;
    name: string;
    category: string;
    image_url: string;
    expiration_date: string;
  };
}
```

**Error Handling**:
- OpenFoodFacts timeout → Return error, prompt manual entry
- Unknown barcode → Return `unknown: true`, allow manual entry
- Database error → Rollback, return 500

---

### suggest-recipes

**Endpoint**: `POST /functions/v1/suggest-recipes`

**Input**:
```typescript
{
  optimization: "longevity" | "serve_count";
  household_size?: number;
}
```

**Process**:
1. Authenticate user
2. Call `get_expiring_items(user_id, 7)` to find items expiring within 7 days
3. Fetch all user inventory items
4. Build ingredient list from inventory
5. Call Recipe API (Spoonacular):
   ```
   GET /recipes/findByIngredients?ingredients={comma_separated_list}&number=10
   ```
6. Format LLM prompt:
   ```
   You are a meal planning assistant.

   Available ingredients: {all_inventory_items}
   Expiring soon (prioritize these): {expiring_items}
   User preference: {optimization}
   Household size: {household_size}

   Recipe candidates from API: {recipe_api_results}

   Task: Rank these recipes from 1-10, prioritizing those that:
   - Use the most expiring ingredients
   - Match the optimization preference (longevity = use expiring items, serve_count = maximize servings)

   Return JSON: [{ recipe_id, rank, reasoning, expiring_ingredients_used }]
   ```
7. Call Claude API with prompt
8. Parse LLM response
9. Merge LLM rankings with recipe data
10. Return ranked recipe list

**Output**:
```typescript
{
  recipes: Array<{
    id: string;
    name: string;
    image: string;
    servings: number;
    ingredients: string[];
    expiring_ingredients_used: string[];
    rank: number;
    reasoning: string;
  }>;
}
```

**Error Handling**:
- Recipe API rate limit → Use cached results, show retry timer
- LLM API error → Fall back to simple scoring (sort by expiring ingredients count)
- No recipes found → Return message: "Add [these ingredients] to make more recipes"

---

### update-inventory

**Endpoint**: `POST /functions/v1/update-inventory`

**Input**:
```typescript
{
  item_id: string;
  action: "consume" | "update_quantity" | "extend_expiry";
  value?: number | string; // quantity or new expiry date
}
```

**Process**:
1. Authenticate user
2. Verify item belongs to user
3. Perform action:
   - `consume`: Decrement quantity by 1 (or delete if quantity = 0)
   - `update_quantity`: Set new quantity
   - `extend_expiry`: Update expiration_date, set manual_expiry_override = true
4. Log to recipe_history if consumed as part of recipe
5. Return updated item

---

## 6. Frontend Components

### Technology Stack

- **Framework**: React + TypeScript (recommended) or Vue/Svelte
- **Barcode Scanning**: `@zxing/browser` or `quagga2`
- **State Management**: React Context + Supabase real-time subscriptions
- **UI Library**: Tailwind CSS + shadcn/ui (mobile-optimized components)
- **PWA Features**: Workbox for service workers, manifest.json for installability
- **Build Tool**: Vite

### Component Architecture

#### `<BarcodeScanner>`

**Responsibilities**:
- Open device camera
- Display viewfinder with scanning overlay
- Use ZXing to decode barcodes in real-time
- Show visual feedback (green checkmark) when barcode detected
- Call `add-product` edge function
- Handle quantity input before adding

**State**:
```typescript
{
  isScanning: boolean;
  detectedBarcode: string | null;
  quantity: number;
  isLoading: boolean;
  error: string | null;
}
```

**Error Handling**:
- Camera permission denied → Show manual entry fallback
- Poor lighting → Display "Move to better lighting" tip + torch toggle
- Invalid barcode → Allow retry or manual entry

---

#### `<InventoryDashboard>`

**Responsibilities**:
- Display grid of inventory items with product images
- Show color-coded expiration badges:
  - Red: < 3 days
  - Yellow: 3-7 days
  - Green: > 7 days
- Quick actions: mark as consumed, adjust quantity, extend expiry
- Filter by category or expiration status
- Pull-to-refresh for real-time sync
- Search functionality

**Real-time Subscription**:
```typescript
supabase
  .from('inventory')
  .on('*', payload => {
    // Update UI when inventory changes
    updateInventoryState(payload);
  })
  .subscribe();
```

**UI Layout**:
```
┌─────────────────────────────────┐
│  🔍 Search   │  Filter ▾  Sort ▾│
├─────────────────────────────────┤
│ ┌────────┐  ┌────────┐         │
│ │ 🥛    │  │ 🥚    │         │
│ │ Milk   │  │ Eggs   │         │
│ │ 🔴 2d  │  │ 🟢 10d │         │
│ └────────┘  └────────┘         │
└─────────────────────────────────┘
```

---

#### `<RecipeEngine>`

**Responsibilities**:
- Toggle between optimization modes:
  - "Make it last" (prioritize expiring ingredients)
  - "Feed X people" (maximize servings)
- Show household size selector
- Display recipe cards with:
  - Recipe image and name
  - Ingredients you have vs. need
  - Expiring ingredients highlighted in red
  - Estimated servings
  - "Cook this" button
- Handle "Cook this" action:
  - Mark ingredients as consumed
  - Log to recipe_history
  - Optional: prompt for rating

**State**:
```typescript
{
  optimization: "longevity" | "serve_count";
  householdSize: number;
  recipes: Recipe[];
  isLoading: boolean;
}
```

---

#### `<ExpirationAlerts>`

**Responsibilities**:
- Display in-app notifications for expiring items
- Push notifications (if user opts in):
  - Daily summary of expiring items
  - Smart timing: morning reminder (8am)
  - "Your milk expires tomorrow"
- Notification actions: "View inventory" or "Find recipes"

**Push Notification Setup**:
- Request permission on first app load
- Use Service Worker Push API
- Backend scheduled job (Supabase Edge Function + cron) sends notifications

---

## 7. Expiration Prioritization Algorithm

### Category-Based Expiration Estimation

**Logic**:
```python
def calculate_expiration(category: str, added_date: date) -> date:
    """
    Estimates expiration date based on product category.
    Uses conservative estimates to minimize food waste.
    """
    EXPIRATION_RULES = {
        "Dairy": 7,           # Milk, yogurt, cheese
        "Meat": 3,            # Fresh meat, poultry
        "Seafood": 2,         # Fish, shellfish
        "Produce_Leafy": 5,   # Lettuce, spinach, herbs
        "Produce_Hard": 14,   # Carrots, potatoes, onions
        "Produce_Fruit": 7,   # Apples, berries, bananas
        "Bread": 5,           # Bakery items
        "Eggs": 21,           # Refrigerated eggs
        "Deli": 5,            # Deli meats, prepared foods
        "Pantry": 365,        # Canned goods, dry goods
        "Frozen": 90,         # Frozen items
        "Unknown": 7          # Conservative default
    }

    days_to_add = EXPIRATION_RULES.get(category, 7)
    return added_date + timedelta(days=days_to_add)
```

**Rationale**:
- Conservative estimates err on the side of caution
- User can override with manual expiration date
- Categories based on FDA food safety guidelines

---

### Recipe Prioritization Scoring

**Pseudo-code**:
```python
def prioritize_recipes(
    recipes: list,
    inventory: list,
    optimization: str
) -> list:
    """
    Ranks recipes based on expiring ingredients and user preference.
    Higher score = higher priority.
    """
    for recipe in recipes:
        score = 0
        expiring_ingredients = []
        matched_ingredients = []

        # Match recipe ingredients with user inventory
        for ingredient in recipe.ingredients:
            inventory_item = find_in_inventory(ingredient, inventory)

            if inventory_item:
                matched_ingredients.append(ingredient)
                days_left = (inventory_item.expiration_date - today()).days

                # Exponential priority for urgency
                if days_left <= 1:
                    score += 20  # Critical
                    expiring_ingredients.append(ingredient)
                elif days_left <= 3:
                    score += 10  # High priority
                    expiring_ingredients.append(ingredient)
                elif days_left <= 7:
                    score += 5   # Medium priority
                    expiring_ingredients.append(ingredient)
                else:
                    score += 1   # Base match bonus

        # Bonus for using multiple expiring items
        score += len(expiring_ingredients) * 3

        # Apply optimization preference
        if optimization == "longevity":
            # Strongly prefer recipes using most expiring items
            score += len(expiring_ingredients) * 10

        elif optimization == "serve_count":
            # Prefer recipes with higher yield per ingredient
            efficiency = recipe.servings / len(recipe.ingredients)
            score += efficiency * 5

        # Penalty for missing too many ingredients
        missing_count = len(recipe.ingredients) - len(matched_ingredients)
        if missing_count > 3:
            score -= missing_count * 2

        recipe.priority_score = score
        recipe.expiring_ingredients = expiring_ingredients
        recipe.matched_ingredients = matched_ingredients

    # Sort by score descending
    return sorted(recipes, key=lambda r: r.priority_score, reverse=True)
```

**Key Features**:
- Exponential scoring for urgency (1 day = 20 points vs 7 days = 5 points)
- Bonus for using multiple expiring items together
- Optimization modes adjust weighting
- Penalty for recipes requiring too many missing ingredients

---

## 8. Error Handling & Edge Cases

### Barcode Scanning Errors

| Error | Handling Strategy |
|-------|-------------------|
| Unknown barcode (not in OpenFoodFacts) | Prompt user for manual entry: product name + category selector |
| Camera permission denied | Show fallback UI: manual barcode number input field |
| Poor lighting / blurry image | Display overlay tip: "Move to better lighting" + torch toggle button |
| Invalid barcode format | Show error message + allow retry or switch to manual entry |
| Multiple barcodes in frame | Highlight detected barcode, ignore others |

### API Failures

| API | Failure Mode | Fallback Strategy |
|-----|--------------|-------------------|
| OpenFoodFacts | Timeout (> 5s) | Use cached data if available, else prompt manual entry |
| OpenFoodFacts | Rate limit | Cache aggressively, show "Try again in X minutes" |
| Recipe API | Timeout | Show cached recipes from recipe_history |
| Recipe API | Rate limit | Display error: "Recipe limit reached, try again in 1 hour" |
| LLM API | Error / timeout | Fall back to simple scoring algorithm (sort by expiring ingredients) |
| Network offline | All APIs unavailable | Queue actions locally, sync when reconnected (Supabase handles this) |

### Data Quality Issues

| Issue | Handling Strategy |
|-------|-------------------|
| Missing product category | Default to "Pantry" (longest shelf life), flag item for user review |
| Duplicate barcode scan | Ask user: "Add to existing item quantity or create new entry?" |
| Expired items lingering | Auto-archive items 7 days past expiry (soft delete, can restore) |
| Invalid expiration date | Validate dates, reject if > 2 years in future or in the past |
| Empty ingredient list | Recipe engine shows: "Add ingredients to get suggestions" |
| No matching recipes | LLM suggests: "You can make X with these additional ingredients: [list]" |

### State Management Edge Cases

| Scenario | Handling Strategy |
|----------|-------------------|
| Concurrent edits (multi-device) | Supabase real-time handles conflicts, last-write-wins |
| Optimistic update fails | Rollback UI state, show error toast |
| User adds item while offline | Queue in IndexedDB, sync when online, show "pending sync" badge |
| Barcode scan during network outage | Store scan locally, show "Will sync when online" |

---

## 9. Testing Strategy

### Unit Tests (Vitest/Jest)

**Expiration Calculation**:
```typescript
describe('calculateExpiration', () => {
  test('dairy products expire in 7 days', () => {
    const result = calculateExpiration('Dairy', new Date('2025-01-01'));
    expect(result).toEqual(new Date('2025-01-08'));
  });

  test('unknown category defaults to 7 days', () => {
    const result = calculateExpiration('RandomCategory', new Date('2025-01-01'));
    expect(result).toEqual(new Date('2025-01-08'));
  });

  test('frozen items expire in 90 days', () => {
    const result = calculateExpiration('Frozen', new Date('2025-01-01'));
    expect(result).toEqual(new Date('2025-04-01'));
  });
});
```

**Recipe Prioritization**:
```typescript
describe('prioritizeRecipes', () => {
  test('prioritizes recipes with expiring ingredients', () => {
    const inventory = [
      { name: 'milk', category: 'Dairy', days_until_expiry: 2 },
      { name: 'eggs', category: 'Eggs', days_until_expiry: 10 }
    ];
    const recipes = [
      { id: '1', name: 'Pancakes', ingredients: ['milk', 'eggs', 'flour'] },
      { id: '2', name: 'Salad', ingredients: ['lettuce', 'tomato'] }
    ];

    const ranked = prioritizeRecipes(recipes, inventory, 'longevity');

    expect(ranked[0].id).toBe('1'); // Pancakes uses expiring milk
    expect(ranked[0].expiring_ingredients).toContain('milk');
  });

  test('serve_count optimization prefers high-yield recipes', () => {
    const inventory = [
      { name: 'rice', days_until_expiry: 100 },
      { name: 'beans', days_until_expiry: 100 }
    ];
    const recipes = [
      { id: '1', name: 'Rice Bowl', ingredients: ['rice'], servings: 1 },
      { id: '2', name: 'Rice & Beans', ingredients: ['rice', 'beans'], servings: 6 }
    ];

    const ranked = prioritizeRecipes(recipes, inventory, 'serve_count');

    expect(ranked[0].id).toBe('2'); // Higher servings per ingredient
  });
});
```

---

### Edge Function Integration Tests

```typescript
import { createClient } from '@supabase/supabase-js';

describe('add-product edge function', () => {
  const supabase = createClient(TEST_URL, TEST_KEY);

  beforeEach(async () => {
    // Clear test database
    await supabase.from('inventory').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  });

  test('adds product and caches OpenFoodFacts data', async () => {
    const { data, error } = await supabase.functions.invoke('add-product', {
      body: { barcode: '3017620422003', quantity: 1 } // Nutella barcode
    });

    expect(error).toBeNull();
    expect(data.product.name).toContain('Nutella');
    expect(data.product.category).toBe('Pantry');

    // Verify cache was updated
    const { data: cached } = await supabase
      .from('product_cache')
      .select()
      .eq('barcode', '3017620422003')
      .single();

    expect(cached).toBeDefined();
    expect(cached.product_data.product_name).toContain('Nutella');
  });

  test('uses cached data on second scan', async () => {
    // First scan
    await supabase.functions.invoke('add-product', {
      body: { barcode: '3017620422003', quantity: 1 }
    });

    // Mock OpenFoodFacts API to verify it's not called
    const spy = jest.spyOn(global, 'fetch');

    // Second scan
    await supabase.functions.invoke('add-product', {
      body: { barcode: '3017620422003', quantity: 1 }
    });

    expect(spy).not.toHaveBeenCalledWith(
      expect.stringContaining('openfoodfacts.org')
    );
  });

  test('handles manual expiry override', async () => {
    const manualExpiry = '2025-12-31';

    const { data } = await supabase.functions.invoke('add-product', {
      body: {
        barcode: '3017620422003',
        quantity: 1,
        manual_expiry: manualExpiry
      }
    });

    expect(data.product.expiration_date).toBe(manualExpiry);

    const { data: item } = await supabase
      .from('inventory')
      .select('manual_expiry_override')
      .eq('id', data.product.id)
      .single();

    expect(item.manual_expiry_override).toBe(true);
  });
});
```

---

### E2E Tests (Playwright)

```typescript
import { test, expect } from '@playwright/test';

test.describe('Complete user flow', () => {
  test('scan barcode → view inventory → get recipes', async ({ page, context }) => {
    // Grant camera permissions
    await context.grantPermissions(['camera']);

    // Navigate to scanner
    await page.goto('/scan');

    // Mock barcode detection (in real test, use mock camera stream)
    await page.evaluate(() => {
      window.mockBarcodeDetected('3017620422003'); // Nutella
    });

    // Verify product added
    await expect(page.getByText('Nutella')).toBeVisible();
    await page.getByRole('button', { name: 'Add to Inventory' }).click();

    // Navigate to inventory
    await page.goto('/inventory');
    await expect(page.getByText('Nutella')).toBeVisible();
    await expect(page.getByText(/\d+ days/)).toBeVisible(); // Expiration badge

    // Navigate to recipes
    await page.goto('/recipes');
    await page.getByRole('button', { name: 'Suggest Recipes' }).click();

    // Wait for recipes to load
    await expect(page.getByTestId('recipe-card')).toHaveCount(10, { timeout: 10000 });

    // Verify expiring ingredients are highlighted
    const firstRecipe = page.getByTestId('recipe-card').first();
    await expect(firstRecipe.getByText('Expiring soon:', { exact: false })).toBeVisible();
  });

  test('offline mode queues scans for sync', async ({ page, context }) => {
    await page.goto('/scan');

    // Simulate offline
    await context.setOffline(true);

    // Scan barcode
    await page.evaluate(() => {
      window.mockBarcodeDetected('012345678905');
    });

    // Verify queued status
    await expect(page.getByText('Will sync when online')).toBeVisible();

    // Go back online
    await context.setOffline(false);

    // Verify sync happens
    await expect(page.getByText('Synced successfully')).toBeVisible({ timeout: 5000 });
  });
});
```

---

### PWA-Specific Tests

**Service Worker Caching**:
```typescript
test('caches assets for offline use', async ({ page }) => {
  await page.goto('/');

  // Verify service worker registered
  const swRegistered = await page.evaluate(() => {
    return navigator.serviceWorker.controller !== null;
  });
  expect(swRegistered).toBe(true);

  // Go offline
  await page.context().setOffline(true);

  // Navigate to cached page
  await page.goto('/inventory');

  // Page should still load from cache
  await expect(page.getByText('My Inventory')).toBeVisible();
});
```

**Camera API Integration**:
```typescript
test('handles camera permission flow', async ({ page, context }) => {
  await page.goto('/scan');

  // Deny camera permission
  await context.grantPermissions([]);

  await page.getByRole('button', { name: 'Start Scanning' }).click();

  // Verify fallback UI shown
  await expect(page.getByText('Camera access denied')).toBeVisible();
  await expect(page.getByPlaceholder('Enter barcode manually')).toBeVisible();
});
```

**Push Notifications**:
```typescript
test('requests notification permission', async ({ page, context }) => {
  await page.goto('/');

  // Mock notification API
  await context.grantPermissions(['notifications']);

  await page.getByRole('button', { name: 'Enable Expiration Alerts' }).click();

  const permissionGranted = await page.evaluate(() => {
    return Notification.permission === 'granted';
  });
  expect(permissionGranted).toBe(true);
});
```

---

## 10. Implementation Phases

### Phase 1: MVP (Core Functionality)
- ✅ Supabase project setup (database, auth, edge functions)
- ✅ Database schema implementation
- ✅ PWA scaffold with basic UI
- ✅ Barcode scanner component (camera integration)
- ✅ `add-product` edge function (OpenFoodFacts integration)
- ✅ Inventory dashboard with expiration badges
- ✅ Manual expiry override UI

**Success Criteria**: User can scan barcodes, view inventory, see expiration dates

---

### Phase 2: Recipe Engine
- ✅ Recipe API integration (Spoonacular or Edamam)
- ✅ `suggest-recipes` edge function
- ✅ LLM integration (Claude API)
- ✅ Recipe prioritization algorithm
- ✅ Recipe display UI with expiring ingredient highlights
- ✅ "Cook this" action (mark ingredients consumed)

**Success Criteria**: User gets intelligent recipe suggestions based on inventory

---

### Phase 3: Advanced Features
- ✅ Real-time subscriptions (live inventory updates)
- ✅ Push notifications (expiration alerts)
- ✅ Offline support (service workers, IndexedDB queue)
- ✅ Search and filter inventory
- ✅ Recipe history and ratings
- ✅ Household size optimization

**Success Criteria**: Full PWA experience with notifications and offline capability

---

### Phase 4: Polish & Optimization
- ✅ Performance optimization (lazy loading, code splitting)
- ✅ Accessibility audit (WCAG 2.1 AA compliance)
- ✅ Analytics integration (track feature usage)
- ✅ User onboarding flow
- ✅ Error monitoring (Sentry)
- ✅ Cost optimization (cache aggressively, batch API calls)

**Success Criteria**: Production-ready app with excellent UX and performance

---

## 11. Technology Decisions

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite
- **UI Components**: shadcn/ui (Radix + Tailwind)
- **Barcode Scanning**: @zxing/browser
- **State**: React Context + Supabase subscriptions
- **PWA**: Workbox (via vite-plugin-pwa)

### Backend
- **BaaS**: Supabase (PostgreSQL + Edge Functions + Auth + Storage)
- **Edge Runtime**: Deno
- **Database**: PostgreSQL 15

### External Services
- **Product Data**: OpenFoodFacts API (free, open-source)
- **Recipes**: Spoonacular API (freemium) or Edamam (free tier)
- **LLM**: Anthropic Claude 3.5 Sonnet (recommended) or OpenAI GPT-4

### DevOps
- **Hosting**: Vercel or Netlify (PWA hosting)
- **Database**: Supabase Cloud (managed PostgreSQL)
- **CI/CD**: GitHub Actions
- **Monitoring**: Sentry (errors) + Supabase Analytics

---

## 12. Cost Estimates

### API Costs (Monthly, assuming 1000 active users)

| Service | Usage | Cost |
|---------|-------|------|
| Supabase | 1000 users, 50GB storage, 100GB bandwidth | $25/month (Pro plan) |
| OpenFoodFacts | Unlimited API calls | Free (open-source) |
| Spoonacular | 5000 requests/month | $0 (free tier) |
| Claude API | 10,000 recipe ranking calls (~50k tokens) | ~$15/month |
| Vercel Hosting | 100GB bandwidth | $20/month (Pro plan) |
| **Total** | | **~$60/month** |

### Scaling Costs (10,000 users)
- Supabase: ~$100/month (increased compute + storage)
- Claude API: ~$150/month (10x usage)
- Vercel: ~$50/month (increased bandwidth)
- **Total**: ~$300/month

---

## 13. Security Considerations

### Authentication
- Use Supabase Auth (email + social OAuth)
- Row Level Security (RLS) policies:
  ```sql
  ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

  CREATE POLICY "Users can only access their own inventory"
    ON inventory
    FOR ALL
    USING (auth.uid() = user_id);
  ```

### API Keys
- Never expose API keys in frontend code
- All external API calls go through Edge Functions
- Use Supabase Vault for secret management

### Data Privacy
- User data isolated via RLS policies
- No sharing of inventory data between users
- GDPR-compliant data deletion (cascade delete on user removal)

### Input Validation
- Validate barcode format before API calls
- Sanitize user input (product names, manual entries)
- Rate limiting on Edge Functions (prevent abuse)

---

## 14. Future Enhancements

### V2 Features (Post-MVP)
- **Shopping list generation**: "You need milk and eggs to make pancakes"
- **Meal planning calendar**: Schedule recipes for the week
- **Nutrition tracking**: Calorie and macro information from recipes
- **Barcode printing**: Print labels for homemade items
- **Family sharing**: Share inventory with household members
- **Voice input**: "Add milk to inventory"
- **Image recognition**: Scan receipts via OCR instead of individual barcodes

### Advanced AI Features
- **Personalized recommendations**: Learn user preferences over time
- **Waste analytics**: "You throw away lettuce 30% of the time"
- **Smart reminders**: "You usually buy milk every 2 weeks"
- **Budget tracking**: "This recipe costs $12 based on ingredient prices"

---

## 15. Success Metrics

### Key Performance Indicators (KPIs)

| Metric | Target |
|--------|--------|
| Daily Active Users (DAU) | 60% of registered users |
| Average items scanned per user per week | 10+ |
| Recipe suggestions viewed per week | 3+ |
| Food waste reduction (self-reported) | 30% improvement |
| User retention (30-day) | 50% |
| Average time to scan item | < 5 seconds |
| Recipe suggestion accuracy (rated 4+/5) | 70% |

### Technical Metrics
- Page load time (LCP): < 2.5s
- Time to Interactive (TTI): < 3.5s
- Lighthouse PWA score: 100
- Uptime: 99.9%
- API error rate: < 1%

---

## Conclusion

This design provides a comprehensive foundation for building a Smart Pantry PWA. The edge-function-heavy architecture ensures security and maintainability, while the hybrid recipe approach balances cost and quality. The expiration tracking and intelligent recipe suggestions address the core user need: reducing food waste through better pantry management.

**Next Steps**:
1. Set up Supabase project and implement database schema
2. Create PWA scaffold with barcode scanning component
3. Build `add-product` edge function with OpenFoodFacts integration
4. Iterate on MVP features with user testing

---

**Document Version**: 1.0
**Last Updated**: 2025-11-22
**Status**: Ready for Implementation
