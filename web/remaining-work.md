# Woof WeTreats — Remaining Work

_Snapshot at end of session. Everything under "Shipped" is built; DB/edge changes are live, front-end changes await the next Netlify deploy._

---

## Shipped this session
- Client dashboard rebuild — 2-col layout, Care Notes card, unified DogCard, inline "+ New Booking", Balance card, location map, announcements banner, Manage Users (co-owners), booking disclaimer + SMS link
- Rover page redesign; Settings Announcement CMS; nav avatar + active-state fixes
- **Batch 8** — recurring weekly daycare
- **Batch 9 (core)** — co-owner household logins (secondary owner, RLS, invite-by-email, per-user profiles)
- **Batch 12** — payment ledger + partial payments; Client Account Summary popup (#27)
- **Layout kit** — `.page`/`.page-body`/`.layout-*`/`.card-grid` + tokens, one breakpoint set (sm 640 · md 768 · lg 1024); Clients page migrated as reference
- **Bookings archive table** (#35) — year-pill compact table in client + staff "See all"; past rows reopen the full ReservationRow card (master-detail)
- **Cancelled bookings** — muted-red pill, struck total via shared `Money` molecule (single source), no payment content
- **On-property headcount + daycare double-toggle** (#32) — `dogs_present` RPC as single source; Oscar bug fixed (not past until departure checked)
- **Dashboard "Bookings" chart** — By Year/Month/Week + prev/next arrows + swipe + "(current)" period label
- **Rate-chart popup** (#33) — "See full rates" card in the booking form, live from DB
- **Announcement color options** (#34) — bg/border/text swatch presets, shared theme map
- **Rate versioning** (see below)
- **Co-owner staff-side Manage Users** (#24) — same component reused in the staff profile, pointed at the viewed household; staff `authUid` hides self-only controls. UI built; live invite→sign-in test still pending.
- **Referral free-night discount** (staff-only) — Free Referral toggle in the staff New/Edit booking forms; one free night at the first-dog rate of the cheapest rate type present (daycare = one free day), valued at the booking's payment method; stored as `referral_free` + `referral_discount`; Fee / Discount / Total shown in the tabulation and Fee Breakdown popup. Uses the booking's pinned rate version. Clients see the discount line but can't apply it.
- **New/returning client flag** — `is_new_client` (manual, staff-only, private): new signups default new, all current clients set returning. Metric = live count of current true.
- **Cancellation test-data purge** — removed 6 test cancellations (clean slate for cancellation-rate metric).

### Rate versioning (this session) — backend LIVE, front-end pending deploy
Rule: editing rates affects only future bookings; existing bookings keep the rates they were made under, including when payment type is later switched.
- **Live DB:** `pricing_rate_versions` table (immutable, dated; v1 = current rates). `reservations.rate_version_id` added + all existing bookings backfilled to v1. Functions `get_current_rate_version()`, `get_rate_version(id)`, `save_pricing_rates(...)` (admin-only: inserts a new version + mirrors it into live `pricing_rates` id=1 so the client rate card updates instantly).
- **Live edge functions:** `staff-create-reservation` pins current version; `update-reservation` reprices against the booking's OWN version (fallback to live rates for legacy null rows).
- **Front-end (needs deploy):** client `/api/booking/create` pins the version; Fee Breakdown popup rebuilds from the booking's version; staff Edit form's live price reference uses the booking's version; Pricing editor saves via `save_pricing_rates`.
- **Deploy order:** deploy the front-end BEFORE next changing rates, so new client bookings are pinned from the start. Until then edge functions fall back safely to current rates.

**Live Supabase (do not re-run):** `paid_at`; `get_announcement`; co-owner columns/RLS/view + related RPCs; `reservation_payments` + RLS + sync trigger; `dogs_present`, `get_daily_schedule` (+`arrived`), `recalc_reservation_statuses`, `set_schedule_item_complete`; `pricing_rate_versions` + `rate_version_id` + rate-version functions; `notify-new-booking` v9, `staff-create-reservation` v2, `update-reservation` v12.

---

## Remaining work

### 1. Batch 9 — co-owner live test (#24) — UI DONE, test remains
- UI built (staff `ManageUsers` in HouseholdDetail). Remaining: live end-to-end test — invite an email → sign in with that Google account → confirm it links into the shared household.

### 2. Signup branding (#25) — config only, your side
- Rename the app to "Woof Wetreats" in the Google OAuth consent screen (Google Cloud Console).
- Optional: Supabase custom domain (paid) so auth URLs stop showing the project ref.

### 3. Permissions + audit log (#36) — future / Petappro
- Role-based permissions so staff can't take cash then edit the booking's true amount; audit trail on booking/payment edits. Rate versioning is a foundation for this.

### 4. Roadmap batches not started
- **Batch 11g — Revenue Report page:** day/week/month/year range selector, comparison modes (YoY/MoM/today-vs-yesterday), overlaid chart + % change.
- **Batch 13 — Rate analytics:** dashboard pie chart by rate type (per-night rate type is now recoverable via the pinned version).

---

## Standing notes
- Local-first; deploy via Claude Code (`npm run build`, commit, push → Netlify). Netlify build credits limited — batch changes.
- Supabase migrations deploy immediately (additive only).
- **Uncommitted front-end batch awaiting deploy:** rate versioning, dashboard chart, archive table, cancelled/`Money`, headcount, rate-chart popup, announcement colors, co-owner profiles, layout kit.

## Layout system (standard)
- Layout kit in `app/globals.css` ("LAYOUT KIT" comment). New pages: `.page` → `.page-header-2col/-3col` + `.page-body` → one `.layout-1col/2col/3col` → `.card-grid`. Flexible grid columns ALWAYS `minmax(0, …)`. One breakpoint set (max-width): sm 640 · md 768 · lg 1024.
- **Cleanup (incremental):** migrate remaining pages off legacy classes (`.dash-body`, `.sched-body`, `.profile-layout-*`) onto kit names, preserving profile mobile reorder. One page per pass.
- **Phase 2 templatize:** shared modal/dialog shell (Fee Breakdown, Rate-chart, Account Summary currently hand-rolled), form grid, formalize `.sectionCard`.
