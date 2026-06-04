import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

interface Lead {
  id: string
  name: string
  service_type: string
  created_at: string
}

export default function LeadsList() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    supabase
      .from('leads')
      .select('id, name, service_type, created_at')
      .eq('status', 'unassigned')
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        setLeads((data as Lead[]) ?? [])
        setLoading(false)
      })
  }, [])

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Unassigned Leads</h3>
          <p className="text-sm text-gray-500">Leads waiting to be picked up</p>
        </div>
        <button
          onClick={() => navigate('/leads')}
          className="text-sm text-[#004B93] font-medium hover:underline"
        >
          View all →
        </button>
      </div>

      {loading && <p className="text-sm text-gray-400">Loading...</p>}

      {!loading && leads.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">No unassigned leads 🎉</p>
      )}

      {!loading && leads.length > 0 && (
        <div className="space-y-2">
          {leads.map(lead => (
            <div
              key={lead.id}
              onClick={() => navigate('/leads')}
              className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100 cursor-pointer hover:bg-gray-100 transition"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">{lead.name || 'Unknown'}</p>
                <p className="text-xs text-gray-500">{lead.service_type}</p>
              </div>
              <span className="text-xs text-gray-400">
                {new Date(lead.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}