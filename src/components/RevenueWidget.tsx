// src/components/RevenueWidget.tsx
// Last updated: 17 June 2026 - reads avg_job_value from orgs table

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { TrendingUp, DollarSign, CheckCircle, Clock } from 'lucide-react'

export default function RevenueWidget() {
  const { profile } = useAuth()
  const [completed, setCompleted] = useState(0)
  const [assigned, setAssigned] = useState(0)
  const [avgJobValue, setAvgJobValue] = useState<number>(180)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    async function fetchAll() {
      // Fetch lead counts
      const { data: leads } = await supabase
        .from('leads')
        .select('status')
        .eq('org_id', profile!.org_id)

      if (leads) {
        setCompleted(leads.filter(l => l.status === 'completed').length)
        setAssigned(leads.filter(l => l.status === 'assigned').length)
      }

      // Fetch avg_job_value from orgs table
      const { data: org } = await supabase
        .from('orgs')
        .select('avg_job_value')
        .eq('id', profile!.org_id)
        .single()

      if (org?.avg_job_value != null) {
        setAvgJobValue(org.avg_job_value)
      }

      setLoading(false)
    }
    fetchAll()
  }, [profile])

  const earned    = completed * avgJobValue
  const potential = assigned  * avgJobValue

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <TrendingUp size={15} className="text-gray-400" />
        <h2 className="font-display font-semibold text-gray-800 text-base">Revenue Snapshot</h2>
      </div>

      {loading ? (
        <div className="p-5 space-y-3 animate-pulse">
          <div className="h-8 bg-gray-100 rounded-lg w-32" />
          <div className="h-4 bg-gray-100 rounded-lg w-48" />
        </div>
      ) : (
        <div className="p-5 space-y-4">
          {/* Earned */}
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
              <DollarSign size={18} className="text-green-500" />
            </div>
            <div>
              <p className="font-display font-bold text-2xl text-gray-900">
                ${earned.toLocaleString()}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                <CheckCircle size={11} className="text-green-400" />
                <p className="text-xs text-gray-400">{completed} completed job{completed !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-gray-100" />

          {/* Pipeline */}
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#004B93]/10 flex items-center justify-center shrink-0">
              <Clock size={18} className="text-[#004B93]" />
            </div>
            <div>
              <p className="font-display font-bold text-xl text-gray-700">
                ${potential.toLocaleString()}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {assigned} job{assigned !== 1 ? 's' : ''} in progress
              </p>
            </div>
          </div>

          <p className="text-xs text-gray-300 pt-1">
            Estimate based on ${avgJobValue} avg job value · <a href="/org-settings" className="underline hover:text-gray-400 transition">Edit in Settings</a>
          </p>
        </div>
      )}
    </div>
  )
}