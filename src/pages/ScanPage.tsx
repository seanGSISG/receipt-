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
