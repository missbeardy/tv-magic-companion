// src/hooks/useCalendarEvents.ts

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  user_id: string;
  org_id?: string;
  created_at: string;
}

export function useCalendarEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, profile } = useAuth();

  // useCallback prevents fetchEvents from being recreated on every render,
  // which avoids an infinite loop in the useEffect below.
  const fetchEvents = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      let query = supabase
        .from('events')
        .select('*')
        .order('start_time', { ascending: true });

      if (profile?.role === 'employee') {
        query = query.eq('user_id', user.id);
      } else if (profile?.org_id) {
        query = query.eq('org_id', profile.org_id);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      setEvents(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user, profile]);

  useEffect(() => {
    if (user && profile) {
      fetchEvents();
    }
  }, [fetchEvents, user, profile]);

  const createEvent = async (eventData: Omit<CalendarEvent, 'id' | 'user_id' | 'created_at'>) => {
    if (!user) throw new Error('User must be authenticated');
    try {
      const { data, error: createError } = await supabase
        .from('events')
        .insert([{
          ...eventData,
          user_id: user.id,
          org_id: profile?.org_id
        }])
        .select()
        .single();

      if (createError) throw createError;

      // Notify the manager in a separate try/catch so that if this fails
      // (e.g. RLS blocks the profile lookup), the event is still created successfully.
      // TODO: Move this notification logic to a Supabase Edge Function (DB trigger)
      // to avoid exposing other users' manager_id through the browser client.
      try {
        const { data: empProfile, error: profileError } = await supabase
          .from('profiles')
          .select('first_name, last_name, manager_id')
          .eq('id', user.id)
          .single();

        if (!profileError && empProfile?.manager_id) {
          const employeeName = `${empProfile.first_name || 'An employee'} ${empProfile.last_name || ''}`.trim();
          await supabase
            .from('notifications')
            .insert([{
              user_id: empProfile.manager_id,
              title: 'New Calendar Event Created',
              message: `${employeeName} scheduled a new event: "${eventData.title}"`,
              type: 'calendar',
              read: false,
              org_id: profile?.org_id
            }]);
        }
      } catch (notifyErr) {
        // Non-fatal: log but don't surface to the user
        console.warn('Manager notification failed (non-fatal):', notifyErr);
      }

      setEvents(prev => [...prev, data]);
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const updateEvent = async (id: string, eventData: Partial<Omit<CalendarEvent, 'id' | 'user_id' | 'created_at'>>) => {
    try {
      const { data, error: updateError } = await supabase
        .from('events')
        .update(eventData)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;
      setEvents(prev => prev.map(e => e.id === id ? data : e));
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const deleteEvent = async (id: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('events')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;
      setEvents(prev => prev.filter(e => e.id !== id));
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  return { events, loading, error, createEvent, updateEvent, deleteEvent, refreshEvents: fetchEvents };
}