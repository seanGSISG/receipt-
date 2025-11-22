import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { HomePage } from './pages/HomePage'
import { ScanPage } from './pages/ScanPage'
import { InventoryPage } from './pages/InventoryPage'
import { RecipesPage } from './pages/RecipesPage'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50">
          <header className="bg-emerald-600 text-white shadow-md">
            <div className="container mx-auto px-4 py-4">
              <h1 className="text-2xl font-bold mb-2">Smart Pantry</h1>
              <nav className="flex gap-4 text-sm">
                <Link to="/" className="hover:underline">Home</Link>
                <Link to="/scan" className="hover:underline">Scan</Link>
                <Link to="/inventory" className="hover:underline">Inventory</Link>
                <Link to="/recipes" className="hover:underline">Recipes</Link>
              </nav>
            </div>
          </header>
          <main className="container mx-auto p-4">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/scan" element={<ScanPage />} />
              <Route path="/inventory" element={<InventoryPage />} />
              <Route path="/recipes" element={<RecipesPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
