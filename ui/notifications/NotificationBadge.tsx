// NotificationBadge.tsx
// A small red dot + count that sits on a bell icon (or any trigger).
// Drop this into your nav bar wherever you want the indicator to live.
//
// Usage:
//   const { unreadCount, notifications, markRead, markAllRead } = useNotifications(supabase)
//   <NotificationBadge unreadCount={unreadCount} notifications={notifications}
//                      onMarkRead={markRead} onMarkAllRead={markAllRead} />

import React, { useState, useRef, useEffect } from 'react'
import type { Notification } from './useNotifications'

interface Props {
  unreadCount:   number
  notifications: Notification[]
  onMarkRead:    (id: string) => void
  onMarkAllRead: () => void
}

export function NotificationBadge({ unreadCount, notifications, onMarkRead, onMarkAllRead }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Bell trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
        style={styles.bellButton}
      >
        🔔
        {unreadCount > 0 && (
          <span style={styles.badge}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={styles.dropdown}>
          <div style={styles.dropdownHeader}>
            <span style={styles.dropdownTitle}>Notifications</span>
            {unreadCount > 0 && (
              <button onClick={onMarkAllRead} style={styles.markAllBtn}>
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p style={styles.empty}>No notifications yet.</p>
          ) : (
            <ul style={styles.list}>
              {notifications.map(n => (
                <li
                  key={n.id}
                  style={{ ...styles.item, background: n.read ? '#fff' : '#eff6ff' }}
                >
                  <p style={styles.message}>{n.message}</p>
                  <div style={styles.itemFooter}>
                    <span style={styles.timestamp}>
                      {new Date(n.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                      })}
                    </span>
                    {!n.read && (
                      <button onClick={() => onMarkRead(n.id)} style={styles.readBtn}>
                        Mark read
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  bellButton: {
    position: 'relative', background: 'none', border: 'none',
    cursor: 'pointer', fontSize: 20, padding: '4px 6px', lineHeight: 1,
  },
  badge: {
    position: 'absolute', top: 0, right: 0,
    background: '#ef4444', color: '#fff',
    borderRadius: '9999px', fontSize: 10, fontWeight: 700,
    minWidth: 16, height: 16, lineHeight: '16px',
    textAlign: 'center', padding: '0 3px',
    transform: 'translate(25%, -25%)',
  },
  dropdown: {
    position: 'absolute', right: 0, top: '100%', marginTop: 6,
    width: 340, maxHeight: 420, overflowY: 'auto',
    background: '#fff', border: '1px solid #e5e7eb',
    borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    zIndex: 1000,
  },
  dropdownHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 14px', borderBottom: '1px solid #f3f4f6',
  },
  dropdownTitle: { fontWeight: 600, fontSize: 14, color: '#111827' },
  markAllBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 12, color: '#3b82f6', padding: 0,
  },
  list:  { listStyle: 'none', margin: 0, padding: 0 },
  item:  { padding: '12px 14px', borderBottom: '1px solid #f3f4f6' },
  message: { margin: '0 0 6px', fontSize: 13, color: '#374151', lineHeight: 1.5 },
  itemFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  timestamp: { fontSize: 11, color: '#9ca3af' },
  readBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 11, color: '#3b82f6', padding: 0,
  },
  empty: { margin: 0, padding: '20px 14px', textAlign: 'center', color: '#9ca3af', fontSize: 13 },
}
