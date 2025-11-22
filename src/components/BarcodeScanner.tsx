import { useBarcodeScanner } from '../hooks/useBarcodeScanner'

interface BarcodeScannerProps {
  onScan: (barcode: string) => void
}

export function BarcodeScanner({ onScan }: BarcodeScannerProps) {
  const { isScanning, error, videoRef, startScanning, stopScanning } =
    useBarcodeScanner(onScan)

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-6">
        {!isScanning ? (
          <button
            onClick={startScanning}
            className="w-full bg-emerald-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-emerald-700 transition"
          >
            Start Scanning
          </button>
        ) : (
          <>
            <div className="relative aspect-square bg-black rounded-lg overflow-hidden mb-4">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
              />
              <div className="absolute inset-0 border-4 border-emerald-500 pointer-events-none">
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-emerald-500" />
              </div>
            </div>
            <button
              onClick={stopScanning}
              className="w-full bg-red-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-red-700 transition"
            >
              Stop Scanning
            </button>
          </>
        )}
        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
            <p className="text-red-600 text-xs mt-1">
              Make sure you've granted camera permissions
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
