import { supabase } from './lib/supabase'

function App() {
  console.log('Supabase client:', supabase)

  return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center">
      <h1 className="text-4xl font-bold text-blue-800">
        TVMagic Companion 🚀
      </h1>
      <p className="text-gray-500 mt-4">Supabase connected ✅</p>
    </div>
  )
}

export default App