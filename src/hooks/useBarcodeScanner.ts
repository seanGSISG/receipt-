import { useState, useEffect, useRef } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'

export function useBarcodeScanner(onScan: (barcode: string) => void) {
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader | null>(null)

  useEffect(() => {
    if (isScanning && videoRef.current) {
      const reader = new BrowserMultiFormatReader()
      readerRef.current = reader

      reader
        .decodeFromVideoDevice(undefined, videoRef.current, (result, err) => {
          if (result) {
            onScan(result.getText())
            setIsScanning(false)
          }
          if (err && err.name !== 'NotFoundException') {
            console.error(err)
          }
        })
        .catch((err) => {
          setError('Failed to access camera')
          console.error(err)
          setIsScanning(false)
        })
    }

    return () => {
      if (readerRef.current) {
        readerRef.current.reset()
      }
    }
  }, [isScanning, onScan])

  const startScanning = () => {
    setError(null)
    setIsScanning(true)
  }

  const stopScanning = () => {
    setIsScanning(false)
    if (readerRef.current) {
      readerRef.current.reset()
    }
  }

  return {
    isScanning,
    error,
    videoRef,
    startScanning,
    stopScanning,
  }
}
