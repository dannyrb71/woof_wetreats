# Woof WeTreats — Remaining Work

_Snapshot at end of session. Everything below is what's left; all prior work is built, deployed, and live._

---

## Shipped & live (this session)
- Client dashboard rebuild — 2-column layout, Care Notes card, unified DogCard (client + staff), inline "+ New Booking", redesigned Balance card, location map, Past & Cancelled month picker, announcements banner, **Manage Users** (co-owners), booking disclaimer + SMS link
- Rover page redesign — single-column bookings grouped by "In Progress" + date, collapsible sections, compact cards, "R" avatar removed
- Settings — Announcement tab (CMS), tab restyle; nav avatar (Google `referrerPolicy`) + active-state fixes
- **Batch 8** — recurring weekly daycare (count or end-date, max 12, skips blocked dates)
- **Batch 9** — co-owner household logins (secondary owner, RLS, invite-by-email, Manage Users card) — _core; see remaining below_
- **Batch 12** — payment ledger + partial payments (staff Add Payment, Paid/Partial/Unpaid, dashboard Collected, Outstanding nets partials) — _core; see remaining below_
- Fix — Rover notification lists only the booked dogs (edge function v9)
- ADA contrast fixes, dead-code cleanup

**Live Supabase changes (do not re-run):** `paid_at`; `get_announcement` RPC; co-owner columns/RLS/view/`get_client_auth_status`/`my_client_ids`/`set_coowner_invite`/`remove_coowner`/`claim_household_invite`; `reservation_payments` table + RLS + sync trigger + backfill; `notify-new-booking` edge function v9.

---

## Remaining work (suggested order)

### 1. Finish Batch 12 — Client Account Summary popup
Client-facing view of their bookings with Total / Paid / Balance and payment history, filterable by month/year. `reservation_payments` owner-read RLS is already in place → **front-end only**.

### 2. Finish Batch 9 — staff co-owner UI + live test
- Add an invite/remove co-owner control to the staff profile (HouseholdDetail). RPCs already accept staff → **front-end only**.
- **Live end-to-end test**: invite an email → sign in with that Google account → confirm it links into the shared household (touched live RLS, so verify carefully).

### 3. Signup branding — _config only, your side_
- Rename the app to "Woof Wetreats" in the **Google OAuth consent screen** (Google Cloud Console) — biggest visible win.
- Optional: add a **Supabase custom domain** (paid add-on) so auth URLs/emails stop showing the `sjvvvizhkksvnuisjlll` project ref. The project ref itself can't be renamed.

### 4. Roadmap batches not started
- **Batch 11g — Revenue Report page**: day/week/month/year range selector, comparison modes (YoY, MoM, today vs yesterday), overlaid chart + side-by-side numbers with % change.
- **Batch 13 — Rate breakdown + analytics**: per-night rate type stored at booking time; dashboard pie chart by rate type.

---

## Production smoke tests to run
- Add a **partial payment** on a booking → confirm Partial status, balance, dashboard Collected, and Current Booking "Outstanding" all update.
- **Co-owner flow**: invite → second Google sign-in → shared household appears.

---

## Standing notes
- Local-first; deploy via Claude Code (`npm run build`, commit, push → Netlify).
- Supabase migrations deploy immediately (additive only).
- Inline client "+ New Booking" still routes to the confirmation page on submit (deprioritized — "maybe nothing needed").
