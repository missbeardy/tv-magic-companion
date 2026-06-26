import { useAuth } from '../context/AuthContext'
import NavBar from '../components/NavBar'
import TeamWorkloadPanel from '../components/TeamWorkloadPanel'
import LiveActivityFeed from '../components/LiveActivityFeed'
import { useTeamWorkload } from '../hooks/useTeamWorkload'
import { useTeamActivityFeed } from '../hooks/useTeamActivityFeed'

export default function TeamActivityPage() {
  const { profile } = useAuth()
  const { techs, loading: workloadLoading } = useTeamWorkload()
  const { events, loading: feedLoading } = useTeamActivityFeed(profile?.org_id, profile?.id)

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-24 md:pb-6">
        <div>
          <h1 className="font-display font-bold text-gray-900 text-xl">Team Activity</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Live pulse of what your team is working on
          </p>
        </div>

        <TeamWorkloadPanel techs={techs} loading={workloadLoading} />
        <LiveActivityFeed events={events} loading={feedLoading} />
      </main>
    </div>
  )
}
