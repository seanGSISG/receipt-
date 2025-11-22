import { vi } from 'vitest'
import '@testing-library/jest-dom'

// Mock environment variables for tests
// These are required by supabase.ts which validates env vars at module load time
// Using local Supabase defaults for testing
vi.stubEnv('VITE_SUPABASE_URL', 'http://127.0.0.1:54321')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0')
