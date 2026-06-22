// useNotifications.ts
// Fetches the current client's notifications and subscribes to
// new ones in real time via Supabase Realtime.
// Usage: const { notifications, unreadCount, markRead, markAllRead } = useNotifications(supabase)

import { useEffect, useState, useCallback } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface Notification {
  id:         string
  message:    string
  read:       boolean
  created_at: string
}

export function useNotifications(supabase: SupabaseClient) {
  const [notifications, setNotifications] = useState<Notification[]>([])

  const unreadCount = notifications.filter(n => !n.read).length

  // Initial fetch
  const fetchNotifications = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('id, message, read, created_at')
      .order('created_at', { ascending: false })
    if (data) setNotifications(data)
  }, [supabase])

  useEffect(() => {
    fetchNotifications()

    // Real-time: new notifications appear without a page refresh
    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          setNotifications(prev => [payload.new as Notification, ...prev])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [supabase, fetchNotifications])

  const markRead = useCallback(async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }, [supabase])

  const markAllRead = useCallback(async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id)
    if (unreadIds.length === 0) return
    await supabase.from('notifications').update({ read: true }).in('id', unreadIds)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }, [supabase, notifications])

  return { notifications, unreadCount, markRead, markAllRead }
}
