import NavBar from '../components/NavBar'
import Calendar from '../components/Calendar'

export default function CalendarPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="p-6 max-w-6xl mx-auto space-y-6">
        <h2 className="text-2xl font-bold text-gray-800">Calendar</h2>
        <Calendar />
      </main>
    </div>
  )
}