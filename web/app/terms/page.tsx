'use client'
import React from 'react'
import { SiteNav } from '@/components/SiteNav'

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section style={s.section}>
      <div style={s.sectionHead}>
        <span style={s.num}>{n}</span>
        <h2 style={s.sectionTitle}>{title}</h2>
      </div>
      <div style={s.sectionBody}>{children}</div>
    </section>
  )
}

export default function TermsPage() {
  return (
    <div style={s.page}>
      <SiteNav />

      <main style={s.main}>
        <h1 style={s.h1}>Terms of Service</h1>
        <p style={s.effective}>Effective date: June 21, 2026</p>
        <p style={s.intro}>
          These Terms govern your use of this website and booking service (the &quot;Site&quot;) and
          any boarding, daycare, or related pet care services booked through it (the
          &quot;Services&quot;). The Services are provided by Danny R. Baker and Mauro Di Jorgi
          (together, &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). The person booking or using
          our Services is &quot;you.&quot;
        </p>

        <Section n={1} title="Agreement to These Terms">
          <p>
            By submitting a booking request, confirming a booking, or allowing Services to begin, you
            agree to these Terms. If you don&apos;t agree, please don&apos;t use the Site or Services.
            You must be at least 18 years old and authorized to arrange care for each pet.
          </p>
          <p>
            We may decline, modify, or end a booking when reasonably necessary for safety, animal
            welfare, non-payment, or inaccurate information.
          </p>
        </Section>

        <Section n={2} title="Your Information & Care Instructions">
          <p>
            You agree to provide accurate, complete information: your contact details, an emergency
            contact, your vet&apos;s information, and care instructions for your pet (feeding,
            medication, behavior).
          </p>
          <p>
            You must tell us about any medical conditions, allergies, medications, dietary needs,
            anxiety, destructive or escape behavior, resource guarding, bite history, or aggression
            that could affect how we care for your pet. Please update us promptly if anything changes
            before or during a stay. We rely on the information you give us, and we&apos;re not
            responsible for problems caused by information that wasn&apos;t disclosed or was
            inaccurate.
          </p>
        </Section>

        <Section n={3} title="Health & Vaccinations">
          <p>
            Your pet must be healthy enough for boarding/daycare and current on vaccinations. Please
            don&apos;t bring a pet showing signs of contagious illness (fever, vomiting, diarrhea,
            unexplained coughing, etc.) or with fleas/ticks — this protects every dog in our care.
          </p>
          <p>
            If we believe your pet poses a health or safety risk, we may isolate them, end the stay
            early, or require pickup. You&apos;re responsible for reasonable costs (vet treatment,
            cleaning, etc.) resulting from an undisclosed or contagious condition.
          </p>
        </Section>

        <Section n={4} title="Inherent Risks">
          <p>
            Pet care involves some inherent risk — illness, injury, behavioral stress, escape, or
            interactions with other animals. By booking with us, you understand and accept these
            ordinary risks. We take reasonable, humane precautions (leashes, supervision, separation
            when needed), but we can&apos;t guarantee that nothing will ever happen.
          </p>
        </Section>

        <Section n={5} title="Emergency Veterinary Care">
          <p>
            If we believe your pet needs veterinary attention, we&apos;ll try to reach you and your
            emergency contact first. If we can&apos;t reach either of you and waiting could harm your
            pet, you authorize us to seek veterinary care on your behalf. We&apos;ll use your regular
            vet when possible, except in situations described in our{' '}
            <a href="/house-rules" style={s.inlineLink}>House Rules</a> (e.g., we use Sage or San
            Francisco Animal Medical Center instead of Ocean Ave. Vet Hospital for emergencies).
          </p>
          <p>
            You&apos;re responsible for the cost of any veterinary care we authorize on your behalf,
            and you agree to reimburse us if we pay for it directly.
          </p>
        </Section>

        <Section n={6} title="Release of Liability">
          <p>
            You release us from claims arising from the ordinary risks of pet care described above,
            except where caused by our own negligence or intentional misconduct. You&apos;re
            responsible for any injury, loss, or damage your pet causes to people, other pets, or
            property, except where we were negligent.
          </p>
        </Section>

        <Section n={7} title="Payment & Cancellations">
          <p>
            Prices and any cancellation terms shown at booking apply to that booking. A shortened
            stay or early pickup doesn&apos;t automatically create a refund. Extended stays, late
            pickup, or additional care needs may result in additional charges, as outlined elsewhere
            in the app.
          </p>
        </Section>

        <Section n={8} title="Photos & Communication">
          <p>
            We may photograph or record your pet to share updates with you and for our own records.
            We won&apos;t use identifiable photos of you or your pet for public marketing without
            asking you first. You agree we can contact you by email, phone, or text about your
            bookings.
          </p>
        </Section>

        <Section n={9} title="Changes to These Terms">
          <p>
            We may update these Terms from time to time. The version in effect at the time you
            confirm a booking applies to that booking.
          </p>
        </Section>

        <Section n={10} title="Governing Law">
          <p>
            These Terms are governed by California law. Any dispute will be handled in a court located
            in San Francisco, California, unless the law requires otherwise.
          </p>
        </Section>

        <p style={s.signature}>Danny R. Baker and Mauro Di Jorgi</p>

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
  h1:          { margin: '0 0 4px', fontSize: 30, fontWeight: 800, color: '#111827' },
  effective:   { margin: '0 0 20px', fontSize: 14, color: '#9ca3af', fontWeight: 600 },
  intro:       { margin: '0 0 32px', fontSize: 16, lineHeight: 1.7, color: '#6b7280' },
  section:     { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '22px 24px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  sectionHead: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 },
  num:         { flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: '#2563eb', color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  sectionTitle:{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' },
  sectionBody: { fontSize: 15, lineHeight: 1.7, color: '#374151' },
  inlineLink:  { color: '#2563eb', fontWeight: 600 },
  signature:   { margin: '28px 0 0', fontSize: 15, fontWeight: 700, color: '#111827' },
  backRow:     { marginTop: 24 },
  backLink:    { fontSize: 14, color: '#6b7280', textDecoration: 'none' },
}
