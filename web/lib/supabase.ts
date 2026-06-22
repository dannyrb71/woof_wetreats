import { createBrowserClient } from '@supabase/ssr'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export type AuthStatus = 'new' | 'blocked' | 'incomplete' | 'complete'

// Calls the SECURITY DEFINER RPC that can read `blocked` even though
// the authenticated role has no column-level SELECT on that field.
export async function getAuthStatus(supabase: ReturnType<typeof createClient>): Promise<AuthStatus | null> {
  const { data, error } = await supabase.rpc('get_client_auth_status')
  if (error || !data || data.length === 0) return null
  return data[0].status as AuthStatus
}

// Single routing function used by both the root page and post-login redirect.
// Admin check runs first — staff never touch onboarding or the client dashboard.
// is_admin() is the same DB function used to guard all admin RLS policies.
export async function routeUser(
  supabase: ReturnType<typeof createClient>,
  router: AppRouterInstance
) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { router.replace('/auth'); return }

  const { data: isAdmin } = await supabase.rpc('is_admin')
  if (isAdmin) { router.replace('/staff'); return }

  const status = await getAuthStatus(supabase)
  switch (status) {
    case 'new':
    case 'incomplete': router.replace('/onboarding'); break
    case 'blocked':    router.replace('/blocked');    break
    case 'complete':   router.replace('/dashboard');  break
    default:           router.replace('/auth');       break
  }
}
