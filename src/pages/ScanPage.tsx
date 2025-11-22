import { useState } from 'react'
import { BarcodeScanner } from '../components/BarcodeScanner'

export function ScanPage() {
  const [detectedBarcode, setDetectedBarcode] = useState<string | null>(null)

  const handleScan = (barcode: string) => {
    setDetectedBarcode(barcode)
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4 text-center">Scan Barcode</h2>
      <BarcodeScanner onScan={handleScan} />
      {detectedBarcode && (
        <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg max-w-md mx-auto">
          <p className="font-semibold text-emerald-800">Barcode Detected:</p>
          <p className="text-emerald-600 font-mono">{detectedBarcode}</p>
        </div>
      )}
    </div>
  )
}
