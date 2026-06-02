import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AVG_JOB_VALUE = 250;

export default function RevenueWidget() {
  const [expiredCount, setExpiredCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { count } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'unassigned')
        .not('assigned_to', 'is', null); // was assigned, then returned

      setExpiredCount(count ?? 0);
      setLoading(false);
    };
    fetch();
  }, []);

  const lostRevenue = expiredCount * AVG_JOB_VALUE;

  if (loading) return null;

  return (
    <div className="bg-white rounded-2xl shadow p-5 border-l-4 border-red-400">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Revenue Rescue
      </h2>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-3xl font-bold text-red-500">
            ${lostRevenue.toLocaleString()}
          </p>
          <p className="text-sm text-gray-500 mt-1">
            Estimated lost from {expiredCount} expired lead{expiredCount !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="text-4xl">⚠️</div>
      </div>
      <p className="text-xs text-gray-400 mt-3">
        Based on avg job value of ${AVG_JOB_VALUE}. Update in RevenueWidget.tsx.
      </p>
    </div>
  );
}