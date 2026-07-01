'use client'
import React from 'react'
import { SiteNav } from '@/components/SiteNav'

function Policy({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section style={s.policy}>
      <div style={s.policyHead}>
        <span style={s.num}>{n}</span>
        <h2 style={s.policyTitle}>{title}</h2>
      </div>
      <div style={s.policyBody}>{children}</div>
    </section>
  )
}

export default function HouseRulesPage() {
  return (
    <div style={s.page}>
      <SiteNav />

      <main style={s.main}>
        <h1 style={s.h1}>House Rules &amp; Policies</h1>
        <p style={s.intro}>
          A few house rules keep every visit safe, happy, and fair to all our furry guests.
          Please read these before booking — they&apos;re short, and they matter.
        </p>

        <Policy n={1} title="Meet & Greet first">
          <p>
            A Meet &amp; Greet is required before your dog&apos;s first stay. You can request one
            right from your dashboard — once you do, we&apos;ll reach out to schedule it and share
            our address. Bookings made without a completed Meet &amp; Greet will be cancelled, so
            let&apos;s get acquainted first.
          </p>
        </Policy>

        <Policy n={2} title="Vaccinations up to date">
          <p>
            All pets must be current on their vaccinations. Keeping everyone vaccinated protects
            your dog and every other guest in our care.
          </p>
        </Policy>

        <Policy n={3} title="House training">
          <p>
            Dogs over 12 months are expected to be house trained. We&apos;ll happily extend some
            flexibility to senior dogs at our discretion — age earns grace. For younger dogs,
            persistent house-training issues may unfortunately mean we can&apos;t continue hosting.
          </p>
        </Policy>

        <Policy n={4} title="Complete your profile">
          <p>
            Please fill out every field in your profile. If you don&apos;t know your dog&apos;s exact
            birthdate, a rough age estimate is fine. A veterinarian must be listed — if you don&apos;t
            have a regular one, the SF SPCA, Sage, or SF Animal Medical Center all work as defaults.
          </p>
        </Policy>

        <Policy n={5} title="Where we go in an emergency">
          <p>
            In an emergency, we take pets to <strong>Sage</strong> or <strong>SF Animal Medical
            Center</strong> — <strong>not</strong> Ocean Ave. Vet Hospital — regardless of your
            regular vet. For anything non-emergency, we&apos;ll use the vet listed on your profile.
          </p>
        </Policy>

        <Policy n={6} title="Traveling far? A card on file helps">
          <p>
            If you&apos;ll be traveling internationally, across significant time-zone differences, or
            otherwise hard to reach, we recommend keeping a credit card on file with your vet. That
            way care is never delayed while we try to track you down.
          </p>
        </Policy>

        <Policy n={7} title="Tell us about your dog (care notes)">
          <p>Your care notes are where the little things live. Please include:</p>
          <ul style={s.list}>
            <li>Personality quirks — what makes your dog tick (or nervous)</li>
            <li>House rules — furniture and bed policy (allowed up or not?)</li>
            <li>Medication — schedule and exact details</li>
            <li>Food allergies and any dietary needs</li>
          </ul>
        </Policy>

        <Policy n={8} title="Feeling under the weather? Stay home">
          <p>
            We can&apos;t accept pets showing signs of a possible contagious illness — it puts every
            other guest at risk, and repeat violations may result in a ban. It&apos;s nothing
            personal: we love our furry friends, who come first here :)
          </p>
        </Policy>

        <Policy n={9} title="Drop-off & pick-up etiquette">
          <p>
            Please share a <strong>real</strong> ETA — an actual time, not &quot;I&apos;m on my
            way.&quot; When you&apos;re close, send your ETA and use maps to confirm the address.
          </p>
          <p style={{ marginTop: 12 }}>
            Please don&apos;t double-park — cars speed down this street and it&apos;s not safe for
            you, us, or your pup. If you need to block a driveway (ours or an adjacent neighbor&apos;s)
            for a moment, that&apos;s totally fine — go ahead. We&apos;ll be quick, and our neighbors
            know us and are used to it.
          </p>
        </Policy>

        <Policy n={10} title="We&apos;ll keep you posted">
          <p>
            Expect photos and updates while your dog is with us. If anything seems off — appetite,
            mood, energy — we&apos;ll proactively flag it so you&apos;re never in the dark.
          </p>
        </Policy>

        <Policy n={11} title="Terms of Service">
          <p>
            By booking with Woof Wetreats, you agree to our{' '}
            <a href="/terms" style={s.inlineLink}>Terms of Service</a>.
          </p>
        </Policy>

        <div style={s.backRow}>
          <a href="/" style={s.backLink}>← Back to home</a>
        </div>
      </main>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page:        { minHeight: '100vh', background: 'var(--page-bg)' },
  main:        { maxWidth: 760, margin: '0 auto', padding: '40px 24px 60px' },
  h1:          { margin: '0 0 12px', fontSize: 30, fontWeight: 800, color: '#111827' },
  intro:       { margin: '0 0 32px', fontSize: 16, lineHeight: 1.7, color: '#6b7280' },
  policy:      { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 'var(--radius-card)', padding: '22px 24px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  policyHead:  { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 },
  num:         { flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  policyTitle: { margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' },
  policyBody:  { fontSize: 15, lineHeight: 1.7, color: '#374151' },
  list:        { margin: '8px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 },
  inlineLink:  { color: 'var(--primary)', fontWeight: 600 },
  backRow:     { marginTop: 28 },
  backLink:    { fontSize: 14, color: '#6b7280', textDecoration: 'none' },
}
