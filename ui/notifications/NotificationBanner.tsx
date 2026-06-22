// NotificationBanner.tsx
// An inline banner that appears at the top of the client's reservation
// detail page when there's at least one unread notification for that
// reservation. Dismissed per-notification (marks it read).
//
// Usage:
//   <NotificationBanner notifications={notifications} onMarkRead={markRead} />

import React from 'react'
import type { Notification } from './useNotifications'

interface Props {
  notifications: Notification[]
  onMarkRead:    (id: string) => void
}

export function NotificationBanner({ notifications, onMarkRead }: Props) {
  const unread = notifications.filter(n => !n.read)
  if (unread.length === 0) return null

  // Show the most recent unread message; if there are more, note the count
  const latest   = unread[0]
  const remaining = unread.length - 1

  return (
    <div style={styles.banner} role="alert">
      <span style={styles.icon}>📋</span>
      <div style={styles.body}>
        <p style={styles.message}>{latest.message}</p>
        {remaining > 0 && (
          <p style={styles.more}>+{remaining} more update{remaining > 1 ? 's' : ''}</p>
        )}
      </div>
      <button
        onClick={() => onMarkRead(latest.id)}
        aria-label="Dismiss notification"
        style={styles.dismiss}
      >
        ✕
      </button>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    background: '#eff6ff', border: '1px solid #bfdbfe',
    borderRadius: 8, padding: '12px 14px', marginBottom: 16,
  },
  icon:    { fontSize: 18, lineHeight: 1, flexShrink: 0, paddingTop: 1 },
  body:    { flex: 1, minWidth: 0 },
  message: { margin: 0, fontSize: 13, color: '#1e40af', lineHeight: 1.5 },
  more:    { margin: '4px 0 0', fontSize: 12, color: '#3b82f6' },
  dismiss: {
    background: 'none', border: 'none', cursor: 'pointer',
    color: '#93c5fd', fontSize: 14, lineHeight: 1,
    padding: 0, flexShrink: 0,
  },
}
