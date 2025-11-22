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
