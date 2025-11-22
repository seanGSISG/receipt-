import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BarcodeScanner } from '../BarcodeScanner'

// Mock the ZXing library
vi.mock('@zxing/browser', () => {
  const mockReset = vi.fn()
  const mockDecodeFromVideoDevice = vi.fn().mockResolvedValue(undefined)

  return {
    BrowserMultiFormatReader: class {
      reset = mockReset
      decodeFromVideoDevice = mockDecodeFromVideoDevice
    }
  }
})

describe('BarcodeScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('should show start button initially', () => {
    const onScan = vi.fn()
    render(<BarcodeScanner onScan={onScan} />)

    expect(screen.getByText('Start Scanning')).toBeInTheDocument()
  })

  test('should show video and stop button when scanning', async () => {
    const onScan = vi.fn()
    const { getByText } = render(<BarcodeScanner onScan={onScan} />)

    const startButton = getByText('Start Scanning')
    startButton.click()

    // Wait for state update
    await waitFor(() => {
      expect(screen.queryByText('Stop Scanning')).toBeInTheDocument()
    })
  })
})
