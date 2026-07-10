import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Database } from '../types/database.types';

type TableName = keyof Database['public']['Tables'];
type QueryBuilder = ReturnType<typeof supabase.from>;

/**
 * Hook that automatically adds org_id filtering to all queries
 * Use this instead of direct supabase calls for org-scoped data
 */
export function useOrgSupabase() {
  const { profile } = useAuth();

  const withOrgFilter = useCallback(<T extends QueryBuilder>(
    query: T
  ): T => {
    if (!profile?.org_id) return query;
    
    // Add org_id filter to the query
    return (query as any).eq('org_id', profile.org_id) as T;
  }, [profile?.org_id]);

  const from = useCallback((table: string) => {
    const query = supabase.from(table as TableName);
    const tablesWithOrgFilter = [
      'leads', 'events', 'tasks', 'notifications', 
      'customers', 'lead_photos', 'lead_events'
    ];
    
    if (tablesWithOrgFilter.includes(table) && profile?.org_id) {
      return (query as any).eq('org_id', profile.org_id);
    }
    return query;
  }, [profile?.org_id]);

  return { supabase, from, withOrgFilter, orgId: profile?.org_id };
}