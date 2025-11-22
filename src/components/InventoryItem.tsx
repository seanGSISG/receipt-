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
