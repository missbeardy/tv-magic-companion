// src/hooks/useCalendarEvents.ts

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { saveEventsCache, loadEventsCache } from '../lib/scheduleCache';

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
  const [staleSince, setStaleSince] = useState<number | null>(null);
  const { user, profile } = useAuth();

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
      const rows = (data ?? []) as CalendarEvent[];
      setEvents(rows);
      setError(null);
      setStaleSince(null);
      void saveEventsCache(user.id, rows);
    } catch (err: any) {
      // Fall back to the last good copy so the schedule stays visible offline.
      const cached = await loadEventsCache(user.id);
      if (cached) {
        setEvents(cached.events as CalendarEvent[]);
        setStaleSince(cached.cachedAt);
        setError(null);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [user, profile]);

  useEffect(() => {
    if (user && profile) {
      fetchEvents();
    }
  }, [fetchEvents, user, profile]);

  // Reusable helper — looks up the current user's manager and sends them a notification.
  // Wrapped in its own try/catch so it never blocks the main action if it fails.
  const notifyManager = async (message: string) => {
    try {
      const { data: empProfile, error: profileError } = await supabase
        .from('profiles')
        .select('first_name, last_name, manager_id')
        .eq('id', user!.id)
        .single();

      if (profileError || !empProfile?.manager_id) return;

      const employeeName = `${empProfile.first_name || 'An employee'} ${empProfile.last_name || ''}`.trim();

      await supabase
        .from('notifications')
        .insert([{
          user_id: empProfile.manager_id,
          title: 'Calendar Updated',
          message: `${employeeName} ${message}`,
          type: 'calendar',
          read: false,
          org_id: profile?.org_id
        }]);
    } catch (err) {
      // Non-fatal — log but never surface to the user
      console.warn('Manager notification failed (non-fatal):', err);
    }
  };

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

      // Only notify if the current user is an employee
      if (profile?.role === 'employee') {
        await notifyManager(`scheduled a new event: "${eventData.title}"`);
      }

      setEvents(prev => [...prev, data as CalendarEvent]);
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

      // Notify manager on updates too, not just creates
      if (profile?.role === 'employee') {
        const title = eventData.title ?? events.find(e => e.id === id)?.title ?? 'an event';
        await notifyManager(`updated an event: "${title}"`);
      }

      setEvents(prev => prev.map(e => e.id === id ? (data as CalendarEvent) : e));
      return data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const deleteEvent = async (id: string) => {
    try {
      // Grab the title before deleting so the notification message is useful
      const eventTitle = events.find(e => e.id === id)?.title ?? 'an event';

      const { error: deleteError } = await supabase
        .from('events')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      // Notify manager on deletes too
      if (profile?.role === 'employee') {
        await notifyManager(`removed an event: "${eventTitle}"`);
      }

      setEvents(prev => prev.filter(e => e.id !== id));
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  return { events, loading, error, staleSince, createEvent, updateEvent, deleteEvent, refreshEvents: fetchEvents };
}