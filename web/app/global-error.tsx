'use client'
import React, { useEffect } from 'react'

// Global error boundary — catches errors thrown in the root layout itself.
// Must render its own <html>/<body> because it replaces the root layout.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('Global error:', error) }, [error])

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', background: '#fff', color: '#111827' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '40px 36px', width: '100%', maxWidth: 440, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center' }}>
            <span style={{ fontSize: 40 }}>🐾</span>
            <h1 style={{ margin: '16px 0 8px', fontSize: 24, fontWeight: 800 }}>Something went wrong</h1>
            <p style={{ margin: '0 0 12px', fontSize: 15, lineHeight: 1.6, color: '#6b7280' }}>
              Sorry — an unexpected error occurred.
            </p>
            {error?.message && (
              <p style={{ margin: '0 0 20px', fontSize: 13, color: '#9ca3af', fontFamily: 'monospace', wordBreak: 'break-word' }}>{error.message}</p>
            )}
            <button type="button" onClick={() => reset()}
              style={{ fontSize: 14, fontWeight: 600, color: '#fff', background: '#2563eb', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontFamily: 'inherit' }}>
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
