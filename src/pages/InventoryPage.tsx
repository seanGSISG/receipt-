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
