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
