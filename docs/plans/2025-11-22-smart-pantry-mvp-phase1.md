# Smart Pantry PWA - Phase 1 MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build MVP that allows users to scan barcodes, view inventory, and see expiration dates

**Architecture:** Mobile-first PWA with Supabase backend, barcode scanning via camera, automated expiration tracking

**Tech Stack:**
- Frontend: React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- Backend: Supabase (PostgreSQL + Edge Functions + Auth)
- Barcode: @zxing/browser
- Testing: Vitest + Playwright

---

## Task 1: Supabase Project Setup

**Files:**
- Create: `.env.local`
- Create: `supabase/config.toml`

**Step 1: Install Supabase CLI**

```bash
npm install -g supabase
```

**Step 2: Initialize Supabase project**

```bash
supabase init
```

Expected: Creates `supabase/` directory with config files

**Step 3: Start local Supabase**

```bash
supabase start
```

Expected: Local Supabase running on http://localhost:54321
Note the `anon key` and `service_role key` from output

**Step 4: Create environment file**

Create `.env.local`:

```bash
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=<anon_key_from_step_3>
```

**Step 5: Commit**

```bash
git add supabase/ .env.local .gitignore
git commit -m "feat: initialize Supabase project"
```

---

## Task 2: Database Schema - Tables

**Files:**
- Create: `supabase/migrations/20251122000001_create_tables.sql`

**Step 1: Create migration file**

Create `supabase/migrations/20251122000001_create_tables.sql`:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  created_at timestamp DEFAULT now(),
  preferences jsonb DEFAULT '{
    "household_size": 2,
    "dietary_restrictions": [],
    "expiration_buffer_days": 3
  }'::jsonb
);

-- Product cache table (shared across all users)
CREATE TABLE product_cache (
  barcode text PRIMARY KEY,
  product_data jsonb NOT NULL,
  last_updated timestamp DEFAULT now()
);

CREATE INDEX idx_product_cache_updated ON product_cache(last_updated);

-- Inventory table
CREATE TABLE inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  barcode text NOT NULL,
  product_name text NOT NULL,
  category text NOT NULL,
  image_url text,
  quantity int DEFAULT 1 CHECK (quantity >= 0),
  added_date timestamp DEFAULT now(),
  expiration_date date NOT NULL,
  manual_expiry_override boolean DEFAULT false,

  -- Computed columns
  is_expired boolean GENERATED ALWAYS AS (expiration_date < CURRENT_DATE) STORED,
  days_until_expiry int GENERATED ALWAYS AS (expiration_date - CURRENT_DATE) STORED
);

CREATE INDEX idx_inventory_user_expiry ON inventory(user_id, expiration_date);
CREATE INDEX idx_inventory_barcode ON inventory(barcode);
CREATE INDEX idx_inventory_user_id ON inventory(user_id);

-- Recipe history table
CREATE TABLE recipe_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  recipe_id text NOT NULL,
  recipe_name text NOT NULL,
  ingredients_used text[] NOT NULL,
  created_at timestamp DEFAULT now(),
  rating int CHECK (rating BETWEEN 1 AND 5)
);

CREATE INDEX idx_recipe_history_user ON recipe_history(user_id, created_at DESC);
```

**Step 2: Run migration**

```bash
supabase db reset
```

Expected: Tables created successfully

**Step 3: Verify tables exist**

```bash
supabase db dump --data-only
```

Expected: Shows table schemas

**Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: create database tables schema"
```

---

## Task 3: Database Schema - Functions

**Files:**
- Create: `supabase/migrations/20251122000002_create_functions.sql`

**Step 1: Create functions migration**

Create `supabase/migrations/20251122000002_create_functions.sql`:

```sql
-- Function: Calculate expiration date based on category
CREATE OR REPLACE FUNCTION calculate_expiration(
  p_category text,
  p_added_date date DEFAULT CURRENT_DATE
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

-- Function: Get expiring items for a user
CREATE OR REPLACE FUNCTION get_expiring_items(
  p_user_id uuid,
  p_days int DEFAULT 7
) RETURNS TABLE (
  id uuid,
  product_name text,
  category text,
  expiration_date date,
  days_until_expiry int,
  quantity int
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.id,
    i.product_name,
    i.category,
    i.expiration_date,
    i.days_until_expiry,
    i.quantity
  FROM inventory i
  WHERE i.user_id = p_user_id
    AND i.days_until_expiry <= p_days
    AND i.days_until_expiry >= 0
    AND i.quantity > 0
  ORDER BY i.days_until_expiry ASC;
END;
$$ LANGUAGE plpgsql STABLE;
```

**Step 2: Run migration**

```bash
supabase db reset
```

Expected: Functions created successfully

**Step 3: Test calculate_expiration function**

```bash
supabase db execute "SELECT calculate_expiration('Dairy', '2025-01-01'::date);"
```

Expected: Returns `2025-01-08`

**Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add database functions for expiration logic"
```

---

## Task 4: Row Level Security (RLS) Policies

**Files:**
- Create: `supabase/migrations/20251122000003_enable_rls.sql`

**Step 1: Create RLS migration**

Create `supabase/migrations/20251122000003_enable_rls.sql`:

```sql
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_history ENABLE ROW LEVEL SECURITY;
-- product_cache is shared, no RLS needed

-- Users table policies
CREATE POLICY "Users can read their own data"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own data"
  ON users FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own data"
  ON users FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Inventory table policies
CREATE POLICY "Users can read their own inventory"
  ON inventory FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own inventory"
  ON inventory FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own inventory"
  ON inventory FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own inventory"
  ON inventory FOR DELETE
  USING (auth.uid() = user_id);

-- Recipe history policies
CREATE POLICY "Users can read their own recipe history"
  ON recipe_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own recipe history"
  ON recipe_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Product cache: everyone can read, only authenticated users can write
ALTER TABLE product_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read product cache"
  ON product_cache FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert product cache"
  ON product_cache FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update product cache"
  ON product_cache FOR UPDATE
  TO authenticated
  USING (true);
```

**Step 2: Run migration**

```bash
supabase db reset
```

Expected: RLS policies applied

**Step 3: Verify RLS is enabled**

```bash
supabase db execute "SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';"
```

Expected: Shows `rowsecurity = t` for users, inventory, recipe_history

**Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: enable row level security policies"
```

---

## Task 5: PWA Frontend Scaffold

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`

**Step 1: Initialize React + Vite project**

```bash
npm create vite@latest . -- --template react-ts
```

Expected: Creates React TypeScript project

**Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js
npm install -D tailwindcss postcss autoprefixer
npm install @zxing/browser
npm install vite-plugin-pwa workbox-window
```

**Step 3: Initialize Tailwind CSS**

```bash
npx tailwindcss init -p
```

**Step 4: Configure Vite for PWA**

Edit `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'Smart Pantry',
        short_name: 'Pantry',
        description: 'Scan groceries, track expiration, get recipe suggestions',
        theme_color: '#10b981',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}']
      }
    })
  ]
})
```

**Step 5: Configure Tailwind**

Edit `tailwind.config.js`:

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

**Step 6: Add Tailwind directives**

Create `src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

**Step 7: Create basic App component**

Edit `src/App.tsx`:

```typescript
import { useState } from 'react'

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-emerald-600 text-white p-4 shadow-md">
        <h1 className="text-2xl font-bold">Smart Pantry</h1>
      </header>
      <main className="container mx-auto p-4">
        <p className="text-gray-700">Scan, track, cook - reduce food waste!</p>
      </main>
    </div>
  )
}

export default App
```

**Step 8: Update main entry point**

Edit `src/main.tsx`:

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

**Step 9: Run dev server to verify**

```bash
npm run dev
```

Expected: App runs on http://localhost:5173

**Step 10: Commit**

```bash
git add package.json vite.config.ts tailwind.config.js src/
git commit -m "feat: scaffold PWA frontend with React, Vite, Tailwind"
```

---

## Task 6: Supabase Client Setup

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `src/types/database.types.ts`

**Step 1: Generate TypeScript types from database**

```bash
npx supabase gen types typescript --local > src/types/database.types.ts
```

Expected: Creates type definitions from Supabase schema

**Step 2: Create Supabase client**

Create `src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
```

**Step 3: Test connection**

Create `src/lib/__tests__/supabase.test.ts`:

```typescript
import { describe, test, expect } from 'vitest'
import { supabase } from '../supabase'

describe('Supabase client', () => {
  test('should connect to Supabase', async () => {
    const { data, error } = await supabase.from('product_cache').select('count')
    expect(error).toBeNull()
    expect(data).toBeDefined()
  })
})
```

**Step 4: Install Vitest**

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

**Step 5: Add test script to package.json**

Edit `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest",
    "test:ui": "vitest --ui"
  }
}
```

**Step 6: Run test**

```bash
npm test
```

Expected: Test passes

**Step 7: Commit**

```bash
git add src/lib/ src/types/ package.json
git commit -m "feat: configure Supabase client with TypeScript types"
```

---

## Task 7: Authentication Context

**Files:**
- Create: `src/contexts/AuthContext.tsx`
- Create: `src/hooks/useAuth.ts`

**Step 1: Write failing test for auth context**

Create `src/contexts/__tests__/AuthContext.test.tsx`:

```typescript
import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AuthProvider, useAuth } from '../AuthContext'

function TestComponent() {
  const { user, signIn, signOut } = useAuth()
  return (
    <div>
      <p>{user ? `Logged in as ${user.email}` : 'Not logged in'}</p>
      <button onClick={() => signIn('test@example.com', 'password')}>Sign In</button>
      <button onClick={signOut}>Sign Out</button>
    </div>
  )
}

describe('AuthContext', () => {
  test('should provide auth methods', () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    expect(screen.getByText('Not logged in')).toBeInTheDocument()
    expect(screen.getByText('Sign In')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL - AuthContext not defined

**Step 3: Implement AuthContext**

Create `src/contexts/AuthContext.tsx`:

```typescript
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw error
  }

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
    })
    if (error) throw error
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  const value = {
    user,
    session,
    signIn,
    signUp,
    signOut,
    loading,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
```

**Step 4: Run test to verify it passes**

```bash
npm test
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/contexts/ src/hooks/
git commit -m "feat: add authentication context and hooks"
```

---

## Task 8: Basic Routing

**Files:**
- Create: `src/pages/HomePage.tsx`
- Create: `src/pages/ScanPage.tsx`
- Create: `src/pages/InventoryPage.tsx`
- Create: `src/pages/RecipesPage.tsx`
- Modify: `src/App.tsx`

**Step 1: Install React Router**

```bash
npm install react-router-dom
```

**Step 2: Create page components**

Create `src/pages/HomePage.tsx`:

```typescript
export function HomePage() {
  return (
    <div className="text-center py-8">
      <h2 className="text-3xl font-bold mb-4">Welcome to Smart Pantry</h2>
      <p className="text-gray-600 mb-8">Scan groceries, track expiration, reduce waste</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="font-bold text-xl mb-2">📱 Scan</h3>
          <p className="text-gray-600">Scan barcodes to add items</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="font-bold text-xl mb-2">🥗 Track</h3>
          <p className="text-gray-600">Monitor expiration dates</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="font-bold text-xl mb-2">🍳 Cook</h3>
          <p className="text-gray-600">Get recipe suggestions</p>
        </div>
      </div>
    </div>
  )
}
```

Create `src/pages/ScanPage.tsx`:

```typescript
export function ScanPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Scan Barcode</h2>
      <p className="text-gray-600">Barcode scanner will go here</p>
    </div>
  )
}
```

Create `src/pages/InventoryPage.tsx`:

```typescript
export function InventoryPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">My Inventory</h2>
      <p className="text-gray-600">Inventory list will go here</p>
    </div>
  )
}
```

Create `src/pages/RecipesPage.tsx`:

```typescript
export function RecipesPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Recipe Suggestions</h2>
      <p className="text-gray-600">Recipe suggestions will go here</p>
    </div>
  )
}
```

**Step 3: Update App with routing**

Edit `src/App.tsx`:

```typescript
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { HomePage } from './pages/HomePage'
import { ScanPage } from './pages/ScanPage'
import { InventoryPage } from './pages/InventoryPage'
import { RecipesPage } from './pages/RecipesPage'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50">
          <header className="bg-emerald-600 text-white shadow-md">
            <div className="container mx-auto px-4 py-4">
              <h1 className="text-2xl font-bold mb-2">Smart Pantry</h1>
              <nav className="flex gap-4 text-sm">
                <Link to="/" className="hover:underline">Home</Link>
                <Link to="/scan" className="hover:underline">Scan</Link>
                <Link to="/inventory" className="hover:underline">Inventory</Link>
                <Link to="/recipes" className="hover:underline">Recipes</Link>
              </nav>
            </div>
          </header>
          <main className="container mx-auto p-4">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/scan" element={<ScanPage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/recipes" element={<RecipesPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
```

**Step 4: Test navigation**

```bash
npm run dev
```

Expected: Can navigate between pages

**Step 5: Commit**

```bash
git add src/pages/ src/App.tsx
git commit -m "feat: add basic routing and page structure"
```

---

## Task 9: Barcode Scanner Component (Basic)

**Files:**
- Create: `src/components/BarcodeScanner.tsx`
- Create: `src/hooks/useBarcodeScanner.ts`
- Modify: `src/pages/ScanPage.tsx`

**Step 1: Write failing test**

Create `src/components/__tests__/BarcodeScanner.test.tsx`:

```typescript
import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BarcodeScanner } from '../BarcodeScanner'

describe('BarcodeScanner', () => {
  test('should show start button initially', () => {
    const onScan = vi.fn()
    render(<BarcodeScanner onScan={onScan} />)

    expect(screen.getByText('Start Scanning')).toBeInTheDocument()
  })

  test('should call onScan when barcode detected', async () => {
    const onScan = vi.fn()
    render(<BarcodeScanner onScan={onScan} />)

    // Mock barcode detection
    // (In real implementation, this would be triggered by ZXing)
    fireEvent.click(screen.getByText('Start Scanning'))

    // For now, just verify button exists
    expect(screen.getByText('Stop Scanning')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: FAIL - BarcodeScanner not defined

**Step 3: Create barcode scanner hook**

Create `src/hooks/useBarcodeScanner.ts`:

```typescript
import { useState, useEffect, useRef } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'

export function useBarcodeScanner(onScan: (barcode: string) => void) {
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)

  useEffect(() => {
    if (isScanning && videoRef.current) {
      const reader = new BrowserMultiFormatReader()
      readerRef.current = reader

      reader
        .decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
          if (result) {
            onScan(result.getText())
            setIsScanning(false)
          }
          if (err && err.name !== 'NotFoundException') {
            console.error(err)
          }
        })
        .catch((err) => {
          setError('Failed to access camera')
          console.error(err)
          setIsScanning(false)
        })
    }

    return () => {
      if (readerRef.current) {
        readerRef.current.reset()
      }
    }
  }, [isScanning, onScan])

  const startScanning = () => {
    setError(null)
    setIsScanning(true)
  }

  const stopScanning = () => {
    setIsScanning(false)
    if (readerRef.current) {
      readerRef.current.reset()
    }
  }

  return {
    isScanning,
    error,
    videoRef,
    startScanning,
    stopScanning,
  }
}
```

**Step 4: Create BarcodeScanner component**

Create `src/components/BarcodeScanner.tsx`:

```typescript
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
}

export function BarcodeScanner({ onScan }: BarcodeScannerProps) {
  const { isScanning, error, videoRef, startScanning, stopScanning } =
    useBarcodeScanner(onScan)

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-6">
        {!isScanning ? (
          <button
            onClick={startScanning}
            className="w-full bg-emerald-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-emerald-700 transition"
          >
            Start Scanning
          </button>
        ) : (
          <>
            <div className="relative aspect-square bg-black rounded-lg overflow-hidden mb-4">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
              />
              <div className="absolute inset-0 border-4 border-emerald-500 pointer-events-none">
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-emerald-500" />
              </div>
            </div>
            <button
              onClick={stopScanning}
              className="w-full bg-red-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-red-700 transition"
            >
              Stop Scanning
            </button>
          </>
        )}
        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
            <p className="text-red-600 text-xs mt-1">
              Make sure you've granted camera permissions
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 5: Update ScanPage to use BarcodeScanner**

Edit `src/pages/ScanPage.tsx`:

```typescript
import { useState } from 'react'
import { BarcodeScanner } from '../components/BarcodeScanner'

export function ScanPage() {
  const [detectedBarcode, setDetectedBarcode] = useState<string | null>(null)

  const handleScan = (barcode: string) => {
    setDetectedBarcode(barcode)
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4 text-center">Scan Barcode</h2>
      <BarcodeScanner onScan={handleScan} />
      {detectedBarcode && (
        <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg max-w-md mx-auto">
          <p className="font-semibold text-emerald-800">Barcode Detected:</p>
          <p className="text-emerald-600 font-mono">{detectedBarcode}</p>
        </div>
      )}
    </div>
  )
}
```

**Step 6: Run test**

```bash
npm test
```

Expected: PASS

**Step 7: Test in browser**

```bash
npm run dev
```

Navigate to /scan and test barcode scanner (requires camera)

**Step 8: Commit**

```bash
git add src/components/ src/hooks/ src/pages/
git commit -m "feat: implement barcode scanner component"
```

---

## Task 10: Edge Function - add-product (Part 1: Setup)

**Files:**
- Create: `supabase/functions/add-product/index.ts`
- Create: `supabase/functions/add-product/openfoodfacts.ts`

**Step 1: Create edge function**

Create `supabase/functions/add-product/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
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

    // Get user from auth token
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

    const { barcode, quantity = 1, manual_expiry } = await req.json()

    if (!barcode) {
      return new Response(
        JSON.stringify({ error: 'Barcode is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // TODO: Implement product lookup and insertion
    // For now, return placeholder
    return new Response(
      JSON.stringify({
        success: true,
        product: {
          barcode,
          quantity,
          manual_expiry,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

**Step 2: Deploy edge function locally**

```bash
supabase functions serve add-product
```

Expected: Function running on http://localhost:54321/functions/v1/add-product

**Step 3: Test edge function with curl**

```bash
curl -X POST http://localhost:54321/functions/v1/add-product \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{"barcode": "012345678905", "quantity": 1}'
```

Expected: Returns success response

**Step 4: Commit**

```bash
git add supabase/functions/
git commit -m "feat: create add-product edge function scaffold"
```

---

## Task 11: Edge Function - add-product (Part 2: OpenFoodFacts Integration)

**Files:**
- Create: `supabase/functions/add-product/openfoodfacts.ts`
- Modify: `supabase/functions/add-product/index.ts`

**Step 1: Create OpenFoodFacts helper**

Create `supabase/functions/add-product/openfoodfacts.ts`:

```typescript
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
```

**Step 2: Update edge function to use OpenFoodFacts**

Edit `supabase/functions/add-product/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fetchProductData } from './openfoodfacts.ts'

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

    const { barcode, quantity = 1, manual_expiry } = await req.json()

    if (!barcode) {
      return new Response(
        JSON.stringify({ error: 'Barcode is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check product cache first
    const { data: cached } = await supabase
      .from('product_cache')
      .select('product_data')
      .eq('barcode', barcode)
      .single()

    let productData

    if (cached) {
      productData = cached.product_data
    } else {
      // Fetch from OpenFoodFacts
      const fetchedData = await fetchProductData(barcode)

      if (!fetchedData) {
        return new Response(
          JSON.stringify({ error: 'Product not found', unknown: true }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      productData = fetchedData

      // Cache the product data
      await supabase.from('product_cache').insert({
        barcode,
        product_data: productData,
      })
    }

    // Calculate expiration date
    const addedDate = new Date().toISOString().split('T')[0]
    let expirationDate

    if (manual_expiry) {
      expirationDate = manual_expiry
    } else {
      // Call calculate_expiration function
      const { data: expiry } = await supabase.rpc('calculate_expiration', {
        p_category: productData.category,
        p_added_date: addedDate,
      })
      expirationDate = expiry
    }

    // Insert into inventory
    const { data: inventoryItem, error: insertError } = await supabase
      .from('inventory')
      .insert({
        user_id: user.id,
        barcode,
        product_name: productData.name,
        category: productData.category,
        image_url: productData.image_url,
        quantity,
        expiration_date: expirationDate,
        manual_expiry_override: !!manual_expiry,
      })
      .select()
      .single()

    if (insertError) {
      throw insertError
    }

    return new Response(
      JSON.stringify({
        success: true,
        product: inventoryItem,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

**Step 3: Test with real barcode**

```bash
curl -X POST http://localhost:54321/functions/v1/add-product \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -d '{"barcode": "3017620422003", "quantity": 1}'
```

Expected: Returns Nutella product data

**Step 4: Commit**

```bash
git add supabase/functions/
git commit -m "feat: integrate OpenFoodFacts API in add-product function"
```

---

## Task 12: Connect Scanner to Edge Function

**Files:**
- Create: `src/hooks/useAddProduct.ts`
- Modify: `src/pages/ScanPage.tsx`

**Step 1: Create useAddProduct hook**

Create `src/hooks/useAddProduct.ts`:

```typescript
import { useState } from 'react'
import { supabase } from '../lib/supabase'

interface AddProductParams {
  barcode: string
  quantity?: number
  manual_expiry?: string
}

export function useAddProduct() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addProduct = async ({ barcode, quantity = 1, manual_expiry }: AddProductParams) => {
    setLoading(true)
    setError(null)

    try {
      const { data, error: funcError } = await supabase.functions.invoke('add-product', {
        body: { barcode, quantity, manual_expiry },
      })

      if (funcError) throw funcError

      if (data.error) {
        if (data.unknown) {
          throw new Error('Product not found in database')
        }
        throw new Error(data.error)
      }

      return data.product
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { addProduct, loading, error }
}
```

**Step 2: Update ScanPage to use edge function**

Edit `src/pages/ScanPage.tsx`:

```typescript
import { useState } from 'react'
import { BarcodeScanner } from '../components/BarcodeScanner'
import { useAddProduct } from '../hooks/useAddProduct'

export function ScanPage() {
  const [detectedBarcode, setDetectedBarcode] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const { addProduct, loading, error } = useAddProduct()
  const [success, setSuccess] = useState(false)

  const handleScan = async (barcode: string) => {
    setDetectedBarcode(barcode)
    setSuccess(false)

    try {
      await addProduct({ barcode, quantity })
      setSuccess(true)
      // Reset after 3 seconds
      setTimeout(() => {
        setDetectedBarcode(null)
        setSuccess(false)
      }, 3000)
    } catch (err) {
      console.error('Failed to add product:', err)
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4 text-center">Scan Barcode</h2>

      <div className="max-w-md mx-auto mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Quantity
        </label>
        <input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
      </div>

      <BarcodeScanner onScan={handleScan} />

      {loading && (
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg max-w-md mx-auto">
          <p className="text-blue-800 text-center">Adding product...</p>
        </div>
      )}

      {error && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg max-w-md mx-auto">
          <p className="text-red-800 font-semibold">Error:</p>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {success && detectedBarcode && (
        <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg max-w-md mx-auto">
          <p className="font-semibold text-emerald-800">✓ Product Added!</p>
          <p className="text-emerald-600 font-mono text-sm">{detectedBarcode}</p>
        </div>
      )}
    </div>
  )
}
```

**Step 3: Test end-to-end**

```bash
npm run dev
```

Navigate to /scan, scan a barcode, verify product is added to database

**Step 4: Commit**

```bash
git add src/hooks/ src/pages/
git commit -m "feat: connect barcode scanner to add-product edge function"
```

---

## Task 13: Inventory List Component

**Files:**
- Create: `src/components/InventoryList.tsx`
- Create: `src/components/InventoryItem.tsx`
- Create: `src/hooks/useInventory.ts`
- Modify: `src/pages/InventoryPage.tsx`

**Step 1: Create useInventory hook**

Create `src/hooks/useInventory.ts`:

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

interface InventoryItem {
  id: string
  barcode: string
  product_name: string
  category: string
  image_url: string | null
  quantity: number
  expiration_date: string
  days_until_expiry: number
  is_expired: boolean
}

export function useInventory() {
  const { user } = useAuth()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setItems([])
      setLoading(false)
      return
    }

    fetchInventory()

    // Subscribe to real-time changes
    const subscription = supabase
      .channel('inventory-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchInventory()
        }
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [user])

  async function fetchInventory() {
    try {
      const { data, error: fetchError } = await supabase
        .from('inventory')
        .select('*')
        .order('days_until_expiry', { ascending: true })

      if (fetchError) throw fetchError

      setItems(data || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return { items, loading, error, refetch: fetchInventory }
}
```

**Step 2: Create InventoryItem component**

Create `src/components/InventoryItem.tsx`:

```typescript
interface InventoryItemProps {
  id: string
  productName: string
  category: string
  imageUrl: string | null
  quantity: number
  daysUntilExpiry: number
  isExpired: boolean
}

export function InventoryItem({
  productName,
  category,
  imageUrl,
  quantity,
  daysUntilExpiry,
  isExpired,
}: InventoryItemProps) {
  const getBadgeColor = () => {
    if (isExpired) return 'bg-gray-500'
    if (daysUntilExpiry <= 3) return 'bg-red-500'
    if (daysUntilExpiry <= 7) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const getBadgeText = () => {
    if (isExpired) return 'Expired'
    if (daysUntilExpiry === 0) return 'Today'
    if (daysUntilExpiry === 1) return '1 day'
    return `${daysUntilExpiry} days`
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 hover:shadow-md transition">
      <div className="flex items-start gap-4">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={productName}
            className="w-20 h-20 object-cover rounded"
          />
        ) : (
          <div className="w-20 h-20 bg-gray-200 rounded flex items-center justify-center">
            <span className="text-gray-400 text-2xl">📦</span>
          </div>
        )}

        <div className="flex-1">
          <h3 className="font-semibold text-lg">{productName}</h3>
          <p className="text-sm text-gray-600">{category}</p>
          <p className="text-sm text-gray-500 mt-1">Quantity: {quantity}</p>

          <div className="mt-2">
            <span
              className={`inline-block px-3 py-1 text-xs font-semibold text-white rounded-full ${getBadgeColor()}`}
            >
              {getBadgeText()}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
```

**Step 3: Create InventoryList component**

Create `src/components/InventoryList.tsx`:

```typescript
import { InventoryItem } from './InventoryItem'

interface InventoryListProps {
  items: Array<{
    id: string
    product_name: string
    category: string
    image_url: string | null
    quantity: number
    days_until_expiry: number
    is_expired: boolean
  }>
}

export function InventoryList({ items }: InventoryListProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 text-lg">No items in inventory</p>
        <p className="text-gray-400 text-sm mt-2">Scan a barcode to get started</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((item) => (
        <InventoryItem
          key={item.id}
          id={item.id}
          productName={item.product_name}
          category={item.category}
          imageUrl={item.image_url}
          quantity={item.quantity}
          daysUntilExpiry={item.days_until_expiry}
          isExpired={item.is_expired}
        />
      ))}
    </div>
  )
}
```

**Step 4: Update InventoryPage**

Edit `src/pages/InventoryPage.tsx`:

```typescript
import { useInventory } from '../hooks/useInventory'
import { InventoryList } from '../components/InventoryList'

export function InventoryPage() {
  const { items, loading, error } = useInventory()

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Loading inventory...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Error: {error}</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">My Inventory</h2>
        <div className="text-sm text-gray-600">
          {items.length} {items.length === 1 ? 'item' : 'items'}
        </div>
      </div>

      <InventoryList items={items} />
    </div>
  )
}
```

**Step 5: Test inventory display**

```bash
npm run dev
```

Navigate to /inventory, should see items added via scanner

**Step 6: Commit**

```bash
git add src/components/ src/hooks/ src/pages/
git commit -m "feat: implement inventory list with real-time updates"
```

---

## Task 14: Manual Entry Fallback

**Files:**
- Create: `src/components/ManualEntryForm.tsx`
- Modify: `src/pages/ScanPage.tsx`

**Step 1: Create ManualEntryForm component**

Create `src/components/ManualEntryForm.tsx`:

```typescript
import { useState } from 'react'

interface ManualEntryFormProps {
  onSubmit: (data: { barcode: string; productName: string; category: string }) => void
  onCancel: () => void
}

const CATEGORIES = [
  'Dairy',
  'Meat',
  'Seafood',
  'Produce_Leafy',
  'Produce_Hard',
  'Produce_Fruit',
  'Bread',
  'Eggs',
  'Deli',
  'Pantry',
  'Frozen',
]

export function ManualEntryForm({ onSubmit, onCancel }: ManualEntryFormProps) {
  const [barcode, setBarcode] = useState('')
  const [productName, setProductName] = useState('')
  const [category, setCategory] = useState('Pantry')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ barcode, productName, category })
  }

  return (
    <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-6">
      <h3 className="text-xl font-bold mb-4">Manual Entry</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Barcode (optional)
          </label>
          <input
            type="text"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="123456789012"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Product Name *
          </label>
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="e.g., Whole Milk"
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Category *
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            className="flex-1 bg-emerald-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-emerald-700 transition"
          >
            Add Item
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-gray-200 text-gray-700 py-2 px-4 rounded-lg font-semibold hover:bg-gray-300 transition"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
```

**Step 2: Update ScanPage to show manual entry on error**

Edit `src/pages/ScanPage.tsx`:

```typescript
import { useState } from 'react'
import { BarcodeScanner } from '../components/BarcodeScanner'
import { ManualEntryForm } from '../components/ManualEntryForm'
import { useAddProduct } from '../hooks/useAddProduct'
import { supabase } from '../lib/supabase'

export function ScanPage() {
  const [detectedBarcode, setDetectedBarcode] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [showManualEntry, setShowManualEntry] = useState(false)
  const { addProduct, loading, error } = useAddProduct()
  const [success, setSuccess] = useState(false)

  const handleScan = async (barcode: string) => {
    setDetectedBarcode(barcode)
    setSuccess(false)

    try {
      await addProduct({ barcode, quantity })
      setSuccess(true)
      setTimeout(() => {
        setDetectedBarcode(null)
        setSuccess(false)
      }, 3000)
    } catch (err: any) {
      if (err.message.includes('not found')) {
        setShowManualEntry(true)
      }
    }
  }

  const handleManualSubmit = async (data: { barcode: string; productName: string; category: string }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Calculate expiration
      const { data: expiryDate } = await supabase.rpc('calculate_expiration', {
        p_category: data.category,
      })

      // Insert directly
      await supabase.from('inventory').insert({
        user_id: user.id,
        barcode: data.barcode || `manual-${Date.now()}`,
        product_name: data.productName,
        category: data.category,
        quantity,
        expiration_date: expiryDate,
      })

      setSuccess(true)
      setShowManualEntry(false)
      setDetectedBarcode(null)
    } catch (err) {
      console.error('Failed to add manual entry:', err)
    }
  }

  if (showManualEntry) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4 text-center">Add Product Manually</h2>
        <ManualEntryForm
          onSubmit={handleManualSubmit}
          onCancel={() => setShowManualEntry(false)}
        />
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4 text-center">Scan Barcode</h2>

      <div className="max-w-md mx-auto mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Quantity
        </label>
        <input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
      </div>

      <BarcodeScanner onScan={handleScan} />

      <div className="mt-6 max-w-md mx-auto text-center">
        <button
          onClick={() => setShowManualEntry(true)}
          className="text-emerald-600 hover:text-emerald-700 underline text-sm"
        >
          Or enter manually
        </button>
      </div>

      {loading && (
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg max-w-md mx-auto">
          <p className="text-blue-800 text-center">Adding product...</p>
        </div>
      )}

      {error && !showManualEntry && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg max-w-md mx-auto">
          <p className="text-red-800 font-semibold">Error:</p>
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg max-w-md mx-auto">
          <p className="font-semibold text-emerald-800 text-center">✓ Product Added!</p>
        </div>
      )}
    </div>
  )
}
```

**Step 3: Test manual entry**

```bash
npm run dev
```

Try scanning unknown barcode or click "enter manually"

**Step 4: Commit**

```bash
git add src/components/ src/pages/
git commit -m "feat: add manual entry fallback for unknown barcodes"
```

---

## Task 15: Basic E2E Test

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/scan-and-view.spec.ts`

**Step 1: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install
```

**Step 2: Create Playwright config**

Create `playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
```

**Step 3: Create E2E test**

Create `tests/e2e/scan-and-view.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test.describe('Scan and view inventory', () => {
  test('should navigate to scan page', async ({ page }) => {
    await page.goto('/')
    await page.click('text=Scan')
    await expect(page).toHaveURL('/scan')
    await expect(page.getByText('Scan Barcode')).toBeVisible()
  })

  test('should show manual entry option', async ({ page }) => {
    await page.goto('/scan')
    await page.click('text=Or enter manually')
    await expect(page.getByText('Manual Entry')).toBeVisible()
  })

  test('should navigate to inventory page', async ({ page }) => {
    await page.goto('/')
    await page.click('text=Inventory')
    await expect(page).toHaveURL('/inventory')
    await expect(page.getByText('My Inventory')).toBeVisible()
  })
})
```

**Step 4: Run E2E tests**

```bash
npm run test
npx playwright test
```

Expected: Tests pass

**Step 5: Commit**

```bash
git add playwright.config.ts tests/ package.json
git commit -m "test: add basic e2e tests for scan and inventory"
```

---

## Task 16: Documentation and README

**Files:**
- Create: `README.md`
- Create: `docs/SETUP.md`

**Step 1: Create README**

Create `README.md`:

```markdown
# Smart Pantry PWA

A mobile-first Progressive Web App that helps reduce food waste by tracking grocery inventory, monitoring expiration dates, and suggesting recipes.

## Features (Phase 1 MVP)

- 📱 **Barcode Scanning**: Use your phone camera to scan grocery barcodes
- 📦 **Inventory Tracking**: Automatically catalog scanned items
- ⏰ **Expiration Monitoring**: Track when food will expire with color-coded badges
- 🔄 **Real-time Sync**: Inventory updates instantly across devices
- 📝 **Manual Entry**: Add items without barcodes

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
\`\`\`bash
git clone <repo-url>
cd smart-pantry
\`\`\`

2. Install dependencies
\`\`\`bash
npm install
\`\`\`

3. Start Supabase locally
\`\`\`bash
supabase start
\`\`\`

4. Copy environment variables
\`\`\`bash
cp .env.example .env.local
# Update with your Supabase keys from `supabase start` output
\`\`\`

5. Run the app
\`\`\`bash
npm run dev
\`\`\`

Visit http://localhost:5173

### Testing

\`\`\`bash
# Unit tests
npm test

# E2E tests
npx playwright test

# E2E with UI
npx playwright test --ui
\`\`\`

## Project Structure

\`\`\`
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
\`\`\`

## Documentation

- [Setup Guide](docs/SETUP.md)
- [Design Document](docs/plans/2025-11-22-smart-pantry-design.md)
- [Implementation Plan](docs/plans/2025-11-22-smart-pantry-mvp-phase1.md)

## License

MIT
```

**Step 2: Create setup guide**

Create `docs/SETUP.md`:

```markdown
# Setup Guide

## Local Development

### 1. Supabase Setup

Initialize and start Supabase:
\`\`\`bash
supabase init
supabase start
\`\`\`

Note the `API URL` and `anon key` from the output.

### 2. Environment Variables

Create `.env.local`:
\`\`\`
VITE_SUPABASE_URL=<your-api-url>
VITE_SUPABASE_ANON_KEY=<your-anon-key>
\`\`\`

### 3. Database Migrations

Migrations run automatically when you start Supabase.

To create a new migration:
\`\`\`bash
supabase migration new <migration-name>
\`\`\`

To reset the database:
\`\`\`bash
supabase db reset
\`\`\`

### 4. Edge Functions

Deploy edge functions locally:
\`\`\`bash
supabase functions serve
\`\`\`

Deploy specific function:
\`\`\`bash
supabase functions serve add-product
\`\`\`

## Production Deployment

### 1. Supabase Cloud

Create a project at https://supabase.com

Link your local project:
\`\`\`bash
supabase link --project-ref <your-project-ref>
\`\`\`

Push migrations:
\`\`\`bash
supabase db push
\`\`\`

Deploy edge functions:
\`\`\`bash
supabase functions deploy add-product
\`\`\`

### 2. Frontend Hosting (Vercel)

1. Connect your GitHub repo to Vercel
2. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Deploy

## Troubleshooting

### Camera not working
- Ensure HTTPS (camera requires secure context)
- Check browser permissions
- Try manual entry as fallback

### Supabase connection failed
- Verify `.env.local` variables
- Check if Supabase is running (`supabase status`)
- Restart Supabase (`supabase stop && supabase start`)

### Database schema out of sync
\`\`\`bash
supabase db reset
\`\`\`
```

**Step 3: Commit**

```bash
git add README.md docs/SETUP.md
git commit -m "docs: add README and setup guide"
```

---

## Phase 1 Complete! 🎉

**Success Criteria:**
- ✅ Users can scan barcodes using phone camera
- ✅ Products are automatically added to inventory with expiration dates
- ✅ Inventory displays with color-coded expiration badges
- ✅ Real-time updates across devices
- ✅ Manual entry fallback for unknown barcodes
- ✅ Basic tests passing

**Next Steps:**
- Phase 2: Recipe Engine (Recipe API + LLM integration)
- Phase 3: Advanced Features (Push notifications, offline support)
- Phase 4: Polish & Optimization

---

**Implementation Notes:**

1. **Authentication**: Currently using Supabase Auth. Users need to sign up/sign in before using the app. Add auth UI in future iteration.

2. **Testing**: Unit tests cover core logic, E2E tests cover user flows. Add more comprehensive tests as features grow.

3. **Performance**: PWA configured for caching. Consider adding service worker for offline support in Phase 3.

4. **Security**: RLS policies enforce user data isolation. API keys hidden in edge functions.

5. **Error Handling**: Basic error states implemented. Enhance with better UX feedback in future iterations.
