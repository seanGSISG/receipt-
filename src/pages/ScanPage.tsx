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
