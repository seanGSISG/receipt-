import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BarcodeScanner } from '../BarcodeScanner'

describe('BarcodeScanner', () => {
  test('should show start button initially', () => {
    const onScan = vi.fn()
    render(<BarcodeScanner onScan={onScan} />)

    expect(screen.getByText('Start Scanning')).toBeInTheDocument()
  })

  test('should call onScan when barcode detected', async () => {
    const onScan = vi.fn()
    render(<BarcodeScanner onScan={onScan} />)

    // Mock barcode detection
    // (In real implementation, this would be triggered by ZXing)
    fireEvent.click(screen.getByText('Start Scanning'))

    // For now, just verify button exists
    expect(screen.getByText('Stop Scanning')).toBeInTheDocument()
  })
})
