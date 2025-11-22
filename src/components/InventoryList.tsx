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
