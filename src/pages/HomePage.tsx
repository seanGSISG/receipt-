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
