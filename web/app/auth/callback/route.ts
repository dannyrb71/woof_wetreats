import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

// Handles the redirect from Google/Facebook OAuth.
// Exchanges the code for a session, then routes the user to the right
// page server-side (staff → /staff, new/incomplete → /onboarding,
// blocked → /blocked, complete → /dashboard). We can't rely on '/'
// for this anymore — '/' is now the public landing page.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code  = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${origin}/auth?error=${encodeURIComponent(error)}`)
  }

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll:  () => cookieStore.getAll(),
          setAll: (cookiesToSet) =>
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            ),
        },
      }
    )
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
    if (!exchangeError) {
      // Route based on staff status + profile completeness (mirrors routeUser)
      const { data: isAdmin } = await supabase.rpc('is_admin')
      if (isAdmin) {
        return NextResponse.redirect(`${origin}/staff`)
      }
      const { data: statusRows } = await supabase.rpc('get_client_auth_status')
      const status = statusRows?.[0]?.status
      const dest =
        status === 'complete' ? '/dashboard' :
        status === 'blocked'  ? '/blocked'   :
                                '/onboarding'   // 'new' | 'incomplete' | unknown
      return NextResponse.redirect(`${origin}${dest}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth?error=auth_callback_failed`)
}
