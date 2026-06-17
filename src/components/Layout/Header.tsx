// src/components/Layout/Header.tsx

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { Bell, LogOut, Menu, Shield } from 'lucide-react';

// TODO (Multi-tenancy): Replace hardcoded brand values below with org config from
// your organisations table once the white-label theme context is built.
// Affected: bg-[#004B93], "TVMagic", "Companion" badge, and the notification icon path.

interface HeaderProps {
  onMenuToggle: () => void;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  created_at: string;
}

export default function Header({ onMenuToggle }: HeaderProps) {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Request browser notification permissions on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // Fetch initial notifications and subscribe to real-time changes
  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (!error && data) {
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.read).length);
      }
    };

    fetchNotifications();

    const channel = supabase
      .channel(`user-notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          const newNotif = payload.new as NotificationItem;
          setNotifications(prev => [newNotif, ...prev.slice(0, 4)]);
          setUnreadCount(c => c + 1);

          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(newNotif.title, {
              body: newNotif.message,
              // TODO (Multi-tenancy): Replace with org logo URL from org config
              icon: '/tvmagic-logo.png'
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    const { error } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id);

    if (!error) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <header className="bg-[#004B93] text-white h-16 fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 shadow-md">
      <div className="flex items-center space-x-3">
        <button
          onClick={onMenuToggle}
          className="p-2 hover:bg-blue-800 rounded-md transition-colors"
          aria-label="Toggle navigation menu"
        >
          <Menu className="h-6 w-6" />
        </button>
        <div className="flex items-center space-x-2">
          {/* TODO (Multi-tenancy): Replace "TVMagic" and "Companion" with org config values */}
          <span className="font-bold text-lg tracking-wider">TVMagic</span>
          <span className="text-xs bg-blue-500 px-2 py-0.5 rounded-full font-medium hidden sm:inline-block">
            Companion
          </span>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="p-2 hover:bg-blue-800 rounded-full transition-colors relative"
            aria-label="View notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          {showDropdown && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-md shadow-lg py-1 text-gray-800 border z-50">
              <div className="px-4 py-2 font-semibold text-sm border-b flex justify-between items-center">
                <span>Notifications</span>
                {unreadCount > 0 && (
                  <button onClick={handleMarkAllAsRead} className="text-xs text-blue-600 hover:underline">
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-60 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-500 text-center">No recent notifications</div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} className={`px-4 py-3 border-b last:border-0 text-sm ${!n.read ? 'bg-blue-50' : ''}`}>
                      <p className="font-medium text-gray-900">{n.title}</p>
                      <p className="text-gray-600 text-xs mt-0.5">{n.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User info */}
        <div className="hidden md:flex flex-col items-end text-xs mr-2">
          <span className="font-medium">{user?.email?.split('@')[0]}</span>
          <span className="opacity-75 capitalize flex items-center gap-1">
            {profile?.role === 'manager' && <Shield className="h-3 w-3 text-yellow-400" />}
            {profile?.role}
          </span>
        </div>

        <button
          onClick={handleSignOut}
          className="p-2 hover:bg-blue-800 rounded-full transition-colors text-blue-200 hover:text-white"
          title="Sign Out"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}