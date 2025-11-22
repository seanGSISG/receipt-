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
