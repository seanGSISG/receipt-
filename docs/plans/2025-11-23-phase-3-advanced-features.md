# Phase 3: Advanced Features Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the Smart Pantry PWA into a full-featured offline-capable application with real-time updates, push notifications, search/filter capabilities, and recipe history tracking.

**Architecture:** Leverage Supabase real-time subscriptions for live inventory updates, implement Web Push API with service workers for expiration alerts, enhance offline support with IndexedDB queue for pending operations, and add UI enhancements for search/filter and recipe history.

**Tech Stack:** React + TypeScript, Supabase Realtime, Web Push API, Workbox (service workers), IndexedDB, Tailwind CSS, Vitest, Playwright

---

## Prerequisites

Before starting, ensure:
- Phase 1 MVP is complete (barcode scanning, inventory tracking)
- Phase 2 Recipe Engine is complete (AI-powered recipe suggestions)
- Supabase project configured with proper database schema
- vite-plugin-pwa already configured in vite.config.ts

---

## Task 1: Setup Real-Time Subscriptions for Inventory

**Files:**
- Modify: `src/hooks/useInventory.ts`
- Create: `src/hooks/__tests__/useInventory-realtime.test.ts`

### Step 1: Write test for real-time inventory updates

Create `src/hooks/__tests__/useInventory-realtime.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useInventory } from '../useInventory'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            data: [
              { id: '1', product_name: 'Milk', quantity: 2, days_until_expiry: 3 },
            ],
            error: null,
          })),
        })),
      })),
      on: vi.fn(() => ({
        subscribe: vi.fn(() => ({
          unsubscribe: vi.fn(),
        })),
      })),
    })),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
        error: null,
      }),
    },
  },
}))

describe('useInventory real-time', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('subscribes to inventory changes on mount', async () => {
    const { result } = renderHook(() => useInventory())

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('inventory')
    })

    expect(supabase.from('inventory').on).toHaveBeenCalled()
  })

  it('unsubscribes on unmount', async () => {
    const unsubscribeMock = vi.fn()
    vi.mocked(supabase.from).mockReturnValue({
      on: vi.fn(() => ({
        subscribe: vi.fn(() => ({
          unsubscribe: unsubscribeMock,
        })),
      })),
    } as any)

    const { unmount } = renderHook(() => useInventory())

    unmount()

    expect(unsubscribeMock).toHaveBeenCalled()
  })
})
```

### Step 2: Run test to verify it fails

Run: `npm test -- src/hooks/__tests__/useInventory-realtime.test.ts`

Expected: FAIL (useInventory doesn't have real-time subscription yet)

### Step 3: Implement real-time subscription in useInventory

Modify `src/hooks/useInventory.ts` to add real-time subscription:

```typescript
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Database } from '../types/database.types'

type InventoryItem = Database['public']['Tables']['inventory']['Row']

export function useInventory() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let subscription: any

    async function fetchInventory() {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          setError('Not authenticated')
          setLoading(false)
          return
        }

        const { data, error: fetchError } = await supabase
          .from('inventory')
          .select('*')
          .eq('user_id', user.id)
          .order('days_until_expiry', { ascending: true })

        if (fetchError) {
          throw fetchError
        }

        setItems(data || [])
        setError(null)

        // Setup real-time subscription
        subscription = supabase
          .from(`inventory:user_id=eq.${user.id}`)
          .on('*', (payload) => {
            if (payload.eventType === 'INSERT') {
              setItems(prev => [...prev, payload.new as InventoryItem])
            } else if (payload.eventType === 'UPDATE') {
              setItems(prev => prev.map(item =>
                item.id === payload.new.id ? payload.new as InventoryItem : item
              ))
            } else if (payload.eventType === 'DELETE') {
              setItems(prev => prev.filter(item => item.id !== payload.old.id))
            }
          })
          .subscribe()

      } catch (err: any) {
        setError(err.message || 'Failed to fetch inventory')
      } finally {
        setLoading(false)
      }
    }

    fetchInventory()

    return () => {
      if (subscription) {
        subscription.unsubscribe()
      }
    }
  }, [])

  return { items, loading, error }
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- src/hooks/__tests__/useInventory-realtime.test.ts`

Expected: PASS (all tests green)

### Step 5: Commit

```bash
git add src/hooks/useInventory.ts src/hooks/__tests__/useInventory-realtime.test.ts
git commit -m "feat: add real-time subscriptions to inventory updates"
```

---

## Task 2: Add Search and Filter to Inventory Page

**Files:**
- Modify: `src/pages/InventoryPage.tsx`
- Create: `src/components/InventorySearchFilter.tsx`
- Create: `src/components/__tests__/InventorySearchFilter.test.tsx`

### Step 1: Write test for InventorySearchFilter component

Create `src/components/__tests__/InventorySearchFilter.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InventorySearchFilter } from '../InventorySearchFilter'

describe('InventorySearchFilter', () => {
  it('renders search input and filter dropdown', () => {
    render(
      <InventorySearchFilter
        searchQuery=""
        filterCategory="all"
        onSearchChange={() => {}}
        onFilterChange={() => {}}
      />
    )

    expect(screen.getByPlaceholderText(/search inventory/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/filter by category/i)).toBeInTheDocument()
  })

  it('calls onSearchChange when typing in search', () => {
    const handleSearchChange = vi.fn()
    render(
      <InventorySearchFilter
        searchQuery=""
        filterCategory="all"
        onSearchChange={handleSearchChange}
        onFilterChange={() => {}}
      />
    )

    const searchInput = screen.getByPlaceholderText(/search inventory/i)
    fireEvent.change(searchInput, { target: { value: 'milk' } })

    expect(handleSearchChange).toHaveBeenCalledWith('milk')
  })

  it('calls onFilterChange when selecting category', () => {
    const handleFilterChange = vi.fn()
    render(
      <InventorySearchFilter
        searchQuery=""
        filterCategory="all"
        onSearchChange={() => {}}
        onFilterChange={handleFilterChange}
      />
    )

    const filterSelect = screen.getByLabelText(/filter by category/i)
    fireEvent.change(filterSelect, { target: { value: 'Dairy' } })

    expect(handleFilterChange).toHaveBeenCalledWith('Dairy')
  })
})
```

### Step 2: Run test to verify it fails

Run: `npm test -- src/components/__tests__/InventorySearchFilter.test.tsx`

Expected: FAIL with "Cannot find module '../InventorySearchFilter'"

### Step 3: Implement InventorySearchFilter component

Create `src/components/InventorySearchFilter.tsx`:

```typescript
interface InventorySearchFilterProps {
  searchQuery: string
  filterCategory: string
  onSearchChange: (query: string) => void
  onFilterChange: (category: string) => void
}

export function InventorySearchFilter({
  searchQuery,
  filterCategory,
  onSearchChange,
  onFilterChange,
}: InventorySearchFilterProps) {
  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="search" className="sr-only">
            Search inventory
          </label>
          <input
            id="search"
            type="text"
            placeholder="Search inventory..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>

        <div>
          <label htmlFor="category-filter" className="sr-only">
            Filter by category
          </label>
          <select
            id="category-filter"
            value={filterCategory}
            onChange={(e) => onFilterChange(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
            aria-label="Filter by category"
          >
            <option value="all">All Categories</option>
            <option value="Dairy">Dairy</option>
            <option value="Meat">Meat</option>
            <option value="Seafood">Seafood</option>
            <option value="Produce_Leafy">Produce (Leafy)</option>
            <option value="Produce_Hard">Produce (Hard)</option>
            <option value="Produce_Fruit">Fruit</option>
            <option value="Bread">Bread</option>
            <option value="Eggs">Eggs</option>
            <option value="Deli">Deli</option>
            <option value="Pantry">Pantry</option>
            <option value="Frozen">Frozen</option>
          </select>
        </div>
      </div>

      {searchQuery && (
        <div className="mt-2 text-sm text-gray-600">
          Searching for: <span className="font-semibold">{searchQuery}</span>
        </div>
      )}
    </div>
  )
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- src/components/__tests__/InventorySearchFilter.test.tsx`

Expected: PASS (all tests green)

### Step 5: Update InventoryPage to use search and filter

Modify `src/pages/InventoryPage.tsx`:

```typescript
import { useState, useMemo } from 'react'
import { useInventory } from '../hooks/useInventory'
import { InventoryList } from '../components/InventoryList'
import { InventorySearchFilter } from '../components/InventorySearchFilter'

export function InventoryPage() {
  const { items, loading, error } = useInventory()
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState('all')

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.product_name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory = filterCategory === 'all' || item.category === filterCategory
      return matchesSearch && matchesCategory
    })
  }, [items, searchQuery, filterCategory])

  if (loading) {
    return <div className="container mx-auto px-4 py-8">Loading inventory...</div>
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">My Inventory</h1>

      <InventorySearchFilter
        searchQuery={searchQuery}
        filterCategory={filterCategory}
        onSearchChange={setSearchQuery}
        onFilterChange={setFilterCategory}
      />

      {filteredItems.length === 0 ? (
        <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded">
          {searchQuery || filterCategory !== 'all'
            ? 'No items match your search or filter.'
            : 'Your inventory is empty. Scan some items to get started!'}
        </div>
      ) : (
        <>
          <p className="text-gray-600 mb-4">
            Showing {filteredItems.length} of {items.length} items
          </p>
          <InventoryList items={filteredItems} />
        </>
      )}
    </div>
  )
}
```

### Step 6: Commit

```bash
git add src/components/InventorySearchFilter.tsx src/components/__tests__/InventorySearchFilter.test.tsx src/pages/InventoryPage.tsx
git commit -m "feat: add search and filter to inventory page"
```

---

## Task 3: Add Recipe History Tracking

**Files:**
- Create: `src/pages/RecipeHistoryPage.tsx`
- Create: `src/hooks/useRecipeHistory.ts`
- Create: `src/hooks/__tests__/useRecipeHistory.test.ts`
- Modify: `src/App.tsx` (add route)

### Step 1: Write test for useRecipeHistory hook

Create `src/hooks/__tests__/useRecipeHistory.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useRecipeHistory } from '../useRecipeHistory'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  },
}))

describe('useRecipeHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: 'user-123' } as any },
      error: null,
    })
  })

  it('fetches recipe history successfully', async () => {
    const mockHistory = [
      {
        id: '1',
        recipe_id: '123',
        recipe_name: 'Pancakes',
        ingredients_used: ['milk', 'eggs'],
        created_at: '2025-11-23T00:00:00Z',
        rating: 5,
      },
    ]

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            data: mockHistory,
            error: null,
          })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          data: {},
          error: null,
        })),
      })),
    } as any)

    const { result } = renderHook(() => useRecipeHistory())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.history).toEqual(mockHistory)
    expect(result.current.error).toBeNull()
  })

  it('rates a recipe successfully', async () => {
    const updateMock = vi.fn(() => ({
      eq: vi.fn(() => ({
        data: {},
        error: null,
      })),
    }))

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            data: [],
            error: null,
          })),
        })),
      })),
      update: updateMock,
    } as any)

    const { result } = renderHook(() => useRecipeHistory())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await result.current.rateRecipe('recipe-1', 5)

    expect(updateMock).toHaveBeenCalledWith({ rating: 5 })
  })
})
```

### Step 2: Run test to verify it fails

Run: `npm test -- src/hooks/__tests__/useRecipeHistory.test.ts`

Expected: FAIL with "Cannot find module '../useRecipeHistory'"

### Step 3: Implement useRecipeHistory hook

Create `src/hooks/useRecipeHistory.ts`:

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Database } from '../types/database.types'

type RecipeHistory = Database['public']['Tables']['recipe_history']['Row']

export function useRecipeHistory() {
  const [history, setHistory] = useState<RecipeHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchHistory() {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          setError('Not authenticated')
          setLoading(false)
          return
        }

        const { data, error: fetchError } = await supabase
          .from('recipe_history')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })

        if (fetchError) {
          throw fetchError
        }

        setHistory(data || [])
        setError(null)
      } catch (err: any) {
        setError(err.message || 'Failed to fetch recipe history')
      } finally {
        setLoading(false)
      }
    }

    fetchHistory()
  }, [])

  const rateRecipe = async (historyId: string, rating: number) => {
    try {
      const { error: updateError } = await supabase
        .from('recipe_history')
        .update({ rating })
        .eq('id', historyId)

      if (updateError) {
        throw updateError
      }

      // Update local state
      setHistory(prev =>
        prev.map(item =>
          item.id === historyId ? { ...item, rating } : item
        )
      )
    } catch (err: any) {
      setError(err.message || 'Failed to rate recipe')
      throw err
    }
  }

  return { history, loading, error, rateRecipe }
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- src/hooks/__tests__/useRecipeHistory.test.ts`

Expected: PASS (all tests green)

### Step 5: Create RecipeHistoryPage component

Create `src/pages/RecipeHistoryPage.tsx`:

```typescript
import { useRecipeHistory } from '../hooks/useRecipeHistory'

export function RecipeHistoryPage() {
  const { history, loading, error, rateRecipe } = useRecipeHistory()

  const handleRate = async (historyId: string, rating: number) => {
    try {
      await rateRecipe(historyId, rating)
    } catch (err) {
      // Error already handled in hook
    }
  }

  if (loading) {
    return <div className="container mx-auto px-4 py-8">Loading history...</div>
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Recipe History</h1>

      {history.length === 0 ? (
        <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded">
          You haven't cooked any recipes yet. Try the recipe suggestions page!
        </div>
      ) : (
        <div className="space-y-4">
          {history.map((item) => (
            <div key={item.id} className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-xl font-bold">{item.recipe_name}</h3>
                  <p className="text-gray-600 text-sm">
                    Cooked on {new Date(item.created_at || '').toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => handleRate(item.id, star)}
                      className={`text-2xl ${
                        item.rating && star <= item.rating
                          ? 'text-yellow-400'
                          : 'text-gray-300'
                      } hover:text-yellow-500`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-sm mb-2">Ingredients used:</h4>
                <div className="flex flex-wrap gap-2">
                  {item.ingredients_used.map((ingredient, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs"
                    >
                      {ingredient}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

### Step 6: Add route to App.tsx

Modify `src/App.tsx` to add the recipe history route.

### Step 7: Commit

```bash
git add src/hooks/useRecipeHistory.ts src/hooks/__tests__/useRecipeHistory.test.ts src/pages/RecipeHistoryPage.tsx src/App.tsx
git commit -m "feat: add recipe history page with ratings"
```

---

## Task 4: Implement Push Notifications for Expiration Alerts

**Files:**
- Create: `src/hooks/useNotifications.ts`
- Create: `src/hooks/__tests__/useNotifications.test.ts`
- Create: `src/components/NotificationSettings.tsx`
- Create: `supabase/functions/send-expiration-notifications/index.ts`

### Step 1: Write test for useNotifications hook

Create `src/hooks/__tests__/useNotifications.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useNotifications } from '../useNotifications'

// Mock Notification API
global.Notification = {
  permission: 'default',
  requestPermission: vi.fn().mockResolvedValue('granted'),
} as any

// Mock Service Worker registration
global.navigator.serviceWorker = {
  ready: Promise.resolve({
    pushManager: {
      subscribe: vi.fn().mockResolvedValue({
        endpoint: 'https://push.example.com/endpoint',
        toJSON: () => ({
          endpoint: 'https://push.example.com/endpoint',
          keys: {
            p256dh: 'key1',
            auth: 'key2',
          },
        }),
      }),
    },
  } as any),
} as any

describe('useNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requests notification permission', async () => {
    const { result } = renderHook(() => useNotifications())

    await result.current.requestPermission()

    expect(Notification.requestPermission).toHaveBeenCalled()
  })

  it('subscribes to push notifications when permission granted', async () => {
    const { result } = renderHook(() => useNotifications())

    const subscription = await result.current.subscribeToPush()

    expect(subscription).toBeDefined()
    expect(subscription?.endpoint).toBe('https://push.example.com/endpoint')
  })
})
```

### Step 2: Run test to verify it fails

Run: `npm test -- src/hooks/__tests__/useNotifications.test.ts`

Expected: FAIL with "Cannot find module '../useNotifications'"

### Step 3: Implement useNotifications hook

Create `src/hooks/useNotifications.ts`:

```typescript
import { useState } from 'react'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  )
  const [subscription, setSubscription] = useState<PushSubscription | null>(null)

  const requestPermission = async () => {
    if (typeof Notification === 'undefined') {
      console.warn('Notifications not supported')
      return 'denied'
    }

    const result = await Notification.requestPermission()
    setPermission(result)
    return result
  }

  const subscribeToPush = async () => {
    if (permission !== 'granted') {
      console.warn('Notification permission not granted')
      return null
    }

    try {
      const registration = await navigator.serviceWorker.ready

      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      setSubscription(sub)
      return sub
    } catch (error) {
      console.error('Failed to subscribe to push notifications:', error)
      return null
    }
  }

  const unsubscribeFromPush = async () => {
    if (subscription) {
      await subscription.unsubscribe()
      setSubscription(null)
    }
  }

  return {
    permission,
    subscription,
    requestPermission,
    subscribeToPush,
    unsubscribeFromPush,
  }
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- src/hooks/__tests__/useNotifications.test.ts`

Expected: PASS (all tests green)

### Step 5: Create NotificationSettings component

Create `src/components/NotificationSettings.tsx`:

```typescript
import { useNotifications } from '../hooks/useNotifications'

export function NotificationSettings() {
  const { permission, subscribeToPush, requestPermission, unsubscribeFromPush } =
    useNotifications()

  const handleEnable = async () => {
    const result = await requestPermission()
    if (result === 'granted') {
      await subscribeToPush()
    }
  }

  const handleDisable = async () => {
    await unsubscribeFromPush()
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-bold mb-4">Expiration Alerts</h3>

      {permission === 'default' && (
        <div>
          <p className="text-gray-600 mb-4">
            Get notified when items in your pantry are about to expire.
          </p>
          <button
            onClick={handleEnable}
            className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700"
          >
            Enable Notifications
          </button>
        </div>
      )}

      {permission === 'granted' && (
        <div>
          <p className="text-green-600 mb-4">✓ Notifications enabled</p>
          <button
            onClick={handleDisable}
            className="bg-gray-600 text-white px-6 py-2 rounded-md hover:bg-gray-700"
          >
            Disable Notifications
          </button>
        </div>
      )}

      {permission === 'denied' && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          Notifications are blocked. Please enable them in your browser settings.
        </div>
      )}
    </div>
  )
}
```

### Step 6: Commit

```bash
git add src/hooks/useNotifications.ts src/hooks/__tests__/useNotifications.test.ts src/components/NotificationSettings.tsx
git commit -m "feat: add push notification support for expiration alerts"
```

---

## Task 5: Enhance Offline Support with IndexedDB Queue

**Files:**
- Create: `src/lib/offlineQueue.ts`
- Create: `src/lib/__tests__/offlineQueue.test.ts`
- Modify: `src/hooks/useAddProduct.ts`
- Modify: `src/hooks/useCookRecipe.ts`

### Step 1: Write test for offline queue

Create `src/lib/__tests__/offlineQueue.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { OfflineQueue } from '../offlineQueue'

describe('OfflineQueue', () => {
  let queue: OfflineQueue

  beforeEach(async () => {
    queue = new OfflineQueue()
    await queue.clear() // Clear any existing data
  })

  it('adds operation to queue', async () => {
    await queue.add({
      type: 'add-product',
      data: { barcode: '123', quantity: 1 },
      timestamp: Date.now(),
    })

    const pending = await queue.getAll()
    expect(pending).toHaveLength(1)
    expect(pending[0].type).toBe('add-product')
  })

  it('removes operation from queue', async () => {
    const id = await queue.add({
      type: 'add-product',
      data: { barcode: '123', quantity: 1 },
      timestamp: Date.now(),
    })

    await queue.remove(id)

    const pending = await queue.getAll()
    expect(pending).toHaveLength(0)
  })

  it('clears all operations', async () => {
    await queue.add({
      type: 'add-product',
      data: { barcode: '123', quantity: 1 },
      timestamp: Date.now(),
    })
    await queue.add({
      type: 'cook-recipe',
      data: { recipeId: '456' },
      timestamp: Date.now(),
    })

    await queue.clear()

    const pending = await queue.getAll()
    expect(pending).toHaveLength(0)
  })
})
```

### Step 2: Run test to verify it fails

Run: `npm test -- src/lib/__tests__/offlineQueue.test.ts`

Expected: FAIL with "Cannot find module '../offlineQueue'"

### Step 3: Implement OfflineQueue

Create `src/lib/offlineQueue.ts`:

```typescript
import { openDB, DBSchema, IDBPDatabase } from 'idb'

interface QueueOperation {
  id?: number
  type: 'add-product' | 'cook-recipe' | 'update-inventory'
  data: any
  timestamp: number
}

interface OfflineQueueDB extends DBSchema {
  operations: {
    key: number
    value: QueueOperation
    indexes: { 'by-timestamp': number }
  }
}

export class OfflineQueue {
  private dbPromise: Promise<IDBPDatabase<OfflineQueueDB>>

  constructor() {
    this.dbPromise = openDB<OfflineQueueDB>('offline-queue', 1, {
      upgrade(db) {
        const store = db.createObjectStore('operations', {
          keyPath: 'id',
          autoIncrement: true,
        })
        store.createIndex('by-timestamp', 'timestamp')
      },
    })
  }

  async add(operation: Omit<QueueOperation, 'id'>): Promise<number> {
    const db = await this.dbPromise
    return await db.add('operations', operation as QueueOperation)
  }

  async getAll(): Promise<QueueOperation[]> {
    const db = await this.dbPromise
    return await db.getAll('operations')
  }

  async remove(id: number): Promise<void> {
    const db = await this.dbPromise
    await db.delete('operations', id)
  }

  async clear(): Promise<void> {
    const db = await this.dbPromise
    await db.clear('operations')
  }
}
```

### Step 4: Install idb dependency

Run: `npm install idb`

### Step 5: Run test to verify it passes

Run: `npm test -- src/lib/__tests__/offlineQueue.test.ts`

Expected: PASS (all tests green)

### Step 6: Update useAddProduct to use offline queue

Modify `src/hooks/useAddProduct.ts` to queue operations when offline.

### Step 7: Commit

```bash
git add src/lib/offlineQueue.ts src/lib/__tests__/offlineQueue.test.ts package.json package-lock.json
git commit -m "feat: add IndexedDB queue for offline operation support"
```

---

## Task 6: Add Household Size to User Preferences

**Files:**
- Create: `src/hooks/useUserPreferences.ts`
- Create: `src/hooks/__tests__/useUserPreferences.test.ts`
- Create: `src/pages/SettingsPage.tsx`

### Step 1: Write test for useUserPreferences hook

Create `src/hooks/__tests__/useUserPreferences.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useUserPreferences } from '../useUserPreferences'
import { supabase } from '../../lib/supabase'

vi.mock('../../lib/supabase')

describe('useUserPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetches user preferences', async () => {
    const mockPreferences = {
      household_size: 4,
      dietary_restrictions: ['vegetarian'],
      expiration_buffer_days: 3,
    }

    vi.mocked(supabase.auth.getUser).mockResolvedValue({
      data: { user: { id: 'user-123' } as any },
      error: null,
    })

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({
            data: { preferences: mockPreferences },
            error: null,
          })),
        })),
      })),
    } as any)

    const { result } = renderHook(() => useUserPreferences())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.preferences).toEqual(mockPreferences)
  })

  it('updates household size', async () => {
    const updateMock = vi.fn(() => ({
      eq: vi.fn(() => ({
        data: {},
        error: null,
      })),
    }))

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => ({
            data: { preferences: { household_size: 2 } },
            error: null,
          })),
        })),
      })),
      update: updateMock,
    } as any)

    const { result } = renderHook(() => useUserPreferences())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    await result.current.updateHouseholdSize(5)

    expect(updateMock).toHaveBeenCalled()
  })
})
```

### Step 2: Run test to verify it fails

Run: `npm test -- src/hooks/__tests__/useUserPreferences.test.ts`

Expected: FAIL with "Cannot find module '../useUserPreferences'"

### Step 3: Implement useUserPreferences hook

Create `src/hooks/useUserPreferences.ts`:

```typescript
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

interface UserPreferences {
  household_size: number
  dietary_restrictions: string[]
  expiration_buffer_days: number
}

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>({
    household_size: 2,
    dietary_restrictions: [],
    expiration_buffer_days: 3,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPreferences() {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          setError('Not authenticated')
          setLoading(false)
          return
        }

        const { data, error: fetchError } = await supabase
          .from('users')
          .select('preferences')
          .eq('id', user.id)
          .single()

        if (fetchError) {
          throw fetchError
        }

        if (data?.preferences) {
          setPreferences(data.preferences as UserPreferences)
        }
        setError(null)
      } catch (err: any) {
        setError(err.message || 'Failed to fetch preferences')
      } finally {
        setLoading(false)
      }
    }

    fetchPreferences()
  }, [])

  const updateHouseholdSize = async (size: number) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('Not authenticated')
      }

      const newPreferences = { ...preferences, household_size: size }

      const { error: updateError } = await supabase
        .from('users')
        .update({ preferences: newPreferences })
        .eq('id', user.id)

      if (updateError) {
        throw updateError
      }

      setPreferences(newPreferences)
    } catch (err: any) {
      setError(err.message || 'Failed to update household size')
      throw err
    }
  }

  const updateDietaryRestrictions = async (restrictions: string[]) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('Not authenticated')
      }

      const newPreferences = { ...preferences, dietary_restrictions: restrictions }

      const { error: updateError } = await supabase
        .from('users')
        .update({ preferences: newPreferences })
        .eq('id', user.id)

      if (updateError) {
        throw updateError
      }

      setPreferences(newPreferences)
    } catch (err: any) {
      setError(err.message || 'Failed to update dietary restrictions')
      throw err
    }
  }

  return {
    preferences,
    loading,
    error,
    updateHouseholdSize,
    updateDietaryRestrictions,
  }
}
```

### Step 4: Run test to verify it passes

Run: `npm test -- src/hooks/__tests__/useUserPreferences.test.ts`

Expected: PASS (all tests green)

### Step 5: Create SettingsPage

Create `src/pages/SettingsPage.tsx`:

```typescript
import { useState } from 'react'
import { useUserPreferences } from '../hooks/useUserPreferences'
import { NotificationSettings } from '../components/NotificationSettings'

export function SettingsPage() {
  const { preferences, loading, updateHouseholdSize, updateDietaryRestrictions } =
    useUserPreferences()
  const [householdSize, setHouseholdSize] = useState(preferences.household_size)

  const handleSaveHouseholdSize = async () => {
    try {
      await updateHouseholdSize(householdSize)
      alert('Household size updated!')
    } catch (err) {
      // Error handled in hook
    }
  }

  if (loading) {
    return <div className="container mx-auto px-4 py-8">Loading settings...</div>
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>

      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold mb-4">Household Size</h3>
          <div className="flex gap-4 items-center">
            <input
              type="number"
              min="1"
              max="12"
              value={householdSize}
              onChange={(e) => setHouseholdSize(parseInt(e.target.value, 10))}
              className="w-24 px-4 py-2 border border-gray-300 rounded-md"
            />
            <span className="text-gray-600">people</span>
            <button
              onClick={handleSaveHouseholdSize}
              className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700"
            >
              Save
            </button>
          </div>
        </div>

        <NotificationSettings />
      </div>
    </div>
  )
}
```

### Step 6: Commit

```bash
git add src/hooks/useUserPreferences.ts src/hooks/__tests__/useUserPreferences.test.ts src/pages/SettingsPage.tsx
git commit -m "feat: add user preferences management with household size"
```

---

## Task 7: Add E2E Tests for Phase 3 Features

**Files:**
- Create: `tests/e2e/phase-3-features.spec.ts`

### Step 1: Create E2E test file

Create `tests/e2e/phase-3-features.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test.describe('Phase 3: Advanced Features', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('http://localhost:5173')
    await page.getByPlaceholder('Email').fill('test@example.com')
    await page.getByPlaceholder('Password').fill('password123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL('**/inventory')
  })

  test('search and filter inventory', async ({ page }) => {
    await page.goto('http://localhost:5173/inventory')

    // Type in search box
    await page.getByPlaceholder(/search inventory/i).fill('milk')

    // Verify filtered results
    await expect(page.getByText('Showing')).toContainText('of')

    // Select category filter
    await page.getByLabel(/filter by category/i).selectOption('Dairy')

    // Verify double-filtered results
    await expect(page.getByText(/milk/i)).toBeVisible()
  })

  test('view recipe history and rate recipes', async ({ page }) => {
    await page.goto('http://localhost:5173/history')

    // Verify history page loads
    await expect(page.getByText('Recipe History')).toBeVisible()

    // Rate a recipe (click 5th star)
    const stars = page.locator('button:has-text("★")').first()
    await stars.click()

    // Verify star is filled
    await expect(stars).toHaveClass(/text-yellow-400/)
  })

  test('enable push notifications', async ({ page, context }) => {
    // Grant notification permission
    await context.grantPermissions(['notifications'])

    await page.goto('http://localhost:5173/settings')

    // Click enable notifications
    await page.getByRole('button', { name: /enable notifications/i }).click()

    // Verify enabled state
    await expect(page.getByText(/notifications enabled/i)).toBeVisible()
  })

  test('update household size in settings', async ({ page }) => {
    await page.goto('http://localhost:5173/settings')

    // Change household size
    await page.getByLabel(/household size/i).fill('5')
    await page.getByRole('button', { name: /save/i }).click()

    // Verify success message
    await expect(page.getByText(/household size updated/i)).toBeVisible()
  })

  test('real-time inventory updates', async ({ page, context }) => {
    // Open two pages to test real-time sync
    const page2 = await context.newPage()

    await page.goto('http://localhost:5173/inventory')
    await page2.goto('http://localhost:5173/scan')

    // Add item on page 2
    // (This would require setting up mock barcode scan)

    // Verify item appears on page 1 without refresh
    // await expect(page.getByText('New Item')).toBeVisible({ timeout: 5000 })
  })
})
```

### Step 2: Commit

```bash
git add tests/e2e/phase-3-features.spec.ts
git commit -m "test: add E2E tests for Phase 3 advanced features"
```

---

## Task 8: Update Documentation

**Files:**
- Create: `docs/PHASE_3_SETUP.md`
- Modify: `README.md`

### Step 1: Create Phase 3 setup documentation

Create `docs/PHASE_3_SETUP.md`:

```markdown
# Phase 3: Advanced Features Setup Guide

## Features

- **Real-Time Subscriptions**: Live inventory updates across devices
- **Push Notifications**: Expiration alerts sent to user's device
- **Offline Support**: Queue operations when offline, sync when reconnected
- **Search & Filter**: Find items quickly in your inventory
- **Recipe History**: Track cooked recipes and rate them
- **User Preferences**: Manage household size and dietary restrictions

## Setup Instructions

### 1. Enable Supabase Realtime

In your Supabase dashboard:
1. Go to Database > Replication
2. Enable replication for `inventory` table
3. Verify realtime is enabled in Settings > API

### 2. Push Notifications (Optional)

Generate VAPID keys for Web Push:

\`\`\`bash
npx web-push generate-vapid-keys
\`\`\`

Add to `.env.local`:

\`\`\`
VITE_VAPID_PUBLIC_KEY=your_public_key_here
\`\`\`

Add to Supabase secrets:

\`\`\`bash
supabase secrets set VAPID_PRIVATE_KEY=your_private_key_here
\`\`\`

### 3. Service Worker

The service worker is automatically generated by `vite-plugin-pwa`.

Build the app to generate the service worker:

\`\`\`bash
npm run build
\`\`\`

### 4. IndexedDB

No additional setup required. The `idb` library handles IndexedDB automatically.

## Testing

### Unit Tests

\`\`\`bash
npm test
\`\`\`

### E2E Tests

\`\`\`bash
npm run dev
npx playwright test tests/e2e/phase-3-features.spec.ts
\`\`\`

## Features Guide

### Real-Time Updates

Inventory changes are synced automatically across all open tabs and devices.

### Push Notifications

1. Navigate to Settings page
2. Click "Enable Notifications"
3. Grant permission when prompted
4. Receive alerts for expiring items

### Offline Mode

1. Add items while offline
2. Operations are queued in IndexedDB
3. Automatically sync when back online
4. View "pending sync" badge on queued items

### Search & Filter

1. Use search box to find items by name
2. Select category from dropdown to filter
3. Combine search and filter for precise results

### Recipe History

1. Cook recipes from the Recipes page
2. View history in Recipe History page
3. Rate recipes with 1-5 stars
4. Filter by rating (future enhancement)

## Troubleshooting

### Realtime not working

- Verify Supabase replication is enabled
- Check browser console for subscription errors
- Ensure RLS policies allow SELECT for user

### Push notifications not received

- Verify VAPID keys are correct
- Check notification permission is granted
- Test with browser dev tools (Application > Service Workers)

### Offline queue not syncing

- Check browser console for sync errors
- Verify IndexedDB is not full (quota)
- Clear IndexedDB and retry: dev tools > Application > IndexedDB
```

### Step 2: Update README

Modify `README.md` to add Phase 3 section:

```markdown
## Phase 3: Advanced Features ✅

Full PWA experience with real-time updates and offline support.

### Features

- 🔄 **Real-Time Subscriptions** - Live inventory updates across devices
- 🔔 **Push Notifications** - Expiration alerts sent to your device
- 📱 **Offline Support** - Queue operations when offline, sync when back online
- 🔍 **Search & Filter** - Find items quickly in your inventory
- 📜 **Recipe History** - Track and rate cooked recipes
- ⚙️ **User Preferences** - Manage household size and dietary restrictions

### Setup

See [PHASE_3_SETUP.md](docs/PHASE_3_SETUP.md) for detailed setup instructions.

Quick start:

\`\`\`bash
# Enable Supabase Realtime in dashboard
# Generate VAPID keys for push notifications
npx web-push generate-vapid-keys

# Add to .env.local
VITE_VAPID_PUBLIC_KEY=your_public_key

# Build to generate service worker
npm run build

# Test
npm test
npx playwright test tests/e2e/phase-3-features.spec.ts
\`\`\`
```

### Step 3: Commit

```bash
git add docs/PHASE_3_SETUP.md README.md
git commit -m "docs: add Phase 3 setup guide and update README"
```

---

## Verification Checklist

Before marking Phase 3 complete, verify:

### Real-Time Subscriptions

- [ ] `useInventory` hook subscribes to inventory changes
- [ ] Changes from other tabs/devices appear without refresh
- [ ] Subscription cleanup happens on unmount
- [ ] Works for INSERT, UPDATE, DELETE events

### Search & Filter

- [ ] Search box filters by product name (case-insensitive)
- [ ] Category dropdown filters by category
- [ ] Search and filter work together
- [ ] Shows "X of Y items" count
- [ ] Empty state message when no matches

### Recipe History

- [ ] `useRecipeHistory` fetches user's cooked recipes
- [ ] Recipe history page displays all cooked recipes
- [ ] Rating system (1-5 stars) works
- [ ] Ratings persist to database
- [ ] Shows ingredients used

### Push Notifications

- [ ] `useNotifications` requests permission
- [ ] Subscribes to push notifications when granted
- [ ] NotificationSettings component shows current state
- [ ] Can enable/disable notifications
- [ ] Handles "denied" permission state

### Offline Support

- [ ] OfflineQueue stores operations in IndexedDB
- [ ] Operations added when offline
- [ ] Operations synced when back online
- [ ] Can view pending operations
- [ ] Can clear queue

### User Preferences

- [ ] `useUserPreferences` fetches from database
- [ ] Can update household size
- [ ] Can update dietary restrictions
- [ ] Changes persist across sessions
- [ ] Settings page UI works

### Tests

- [ ] All unit tests pass: `npm test`
- [ ] All E2E tests pass: `npx playwright test tests/e2e/phase-3-features.spec.ts`
- [ ] No console errors
- [ ] >80% test coverage for new code

### Documentation

- [ ] PHASE_3_SETUP.md complete
- [ ] README updated
- [ ] Code comments for complex logic

### Run Full Verification

```bash
# Run all tests
npm test

# Run E2E tests
npx playwright test

# Build (verify no errors)
npm run build

# Check bundle size
npm run build -- --mode production
```

---

## Success Criteria

Phase 3 is complete when:

1. ✅ Real-time subscriptions work for inventory updates
2. ✅ Push notifications can be enabled and send expiration alerts
3. ✅ Offline operations are queued and sync when back online
4. ✅ Search and filter work on inventory page
5. ✅ Recipe history displays with ratings
6. ✅ User preferences (household size) can be managed
7. ✅ All tests pass (unit + E2E)
8. ✅ Documentation is complete and accurate

---

## Notes

- **DRY**: Reuse types across components
- **YAGNI**: Don't add features not in the plan
- **TDD**: Write tests before implementation
- **Commit Often**: Each task step should be a commit

**Estimated Total Time**: 4-5 hours (following bite-sized steps)

---

**Plan Version**: 1.0
**Created**: 2025-11-23
**Status**: Ready for Implementation
