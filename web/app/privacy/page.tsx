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

const CONTACT_EMAIL = 'danny.r.baker71@gmail.com'

export default function PrivacyPage() {
  return (
    <div className="page">
      <SiteNav />

      <main className="page-body" style={{ '--page-max': '760px' } as React.CSSProperties}>
        <h1 style={s.h1}>Privacy Policy</h1>
        <p style={s.effective}>Effective date: July 3, 2026</p>
        <p style={s.intro}>
          This Privacy Policy explains what information Woof Wetreats collects when you use our
          website and booking service (the &quot;Site&quot;), how we use it, and the choices you
          have. The Services are provided by Danny R. Baker and Mauro Di Jorgi (together,
          &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By using the Site you agree to this
          Policy.
        </p>

        <Section n={1} title="Information We Collect">
          <p>We collect only what we need to care for your pet and manage your bookings:</p>
          <p>
            <strong>Account &amp; contact details.</strong> Your name, email address, phone number,
            and home address. If you sign in with Google, we receive your name and email address from
            your Google account — nothing else.
          </p>
          <p>
            <strong>Emergency &amp; vet information.</strong> Your emergency contact and your
            veterinarian&apos;s name, phone, and address.
          </p>
          <p>
            <strong>Pet information.</strong> Your dog&apos;s name, birthdate, sex, photos, and the
            care notes you provide (feeding, medication, behavior, medical and dietary needs).
          </p>
          <p>
            <strong>Booking &amp; payment records.</strong> Your booking dates, service type, chosen
            payment method (cash or Venmo), and a record of amounts due and paid. We do{' '}
            <strong>not</strong> collect or store credit-card or bank-account numbers — payments are
            handled in person or through Venmo, outside this Site.
          </p>
          <p>
            <strong>Technical data.</strong> Basic sign-in/session information needed to keep you
            logged in securely, and standard server logs.
          </p>
        </Section>

        <Section n={2} title="How We Use Your Information">
          <p>We use your information to:</p>
          <p>
            Provide and manage boarding, daycare, and related pet-care services; create and maintain
            your account; communicate with you about your bookings by email, text, or in-app
            notifications; keep records of payments and balances; and care for your pet safely,
            including seeking veterinary help in an emergency as described in our{' '}
            <a href="/terms" style={s.inlineLink}>Terms of Service</a>.
          </p>
          <p>
            We do not sell your information, and we do not use it for advertising.
          </p>
        </Section>

        <Section n={3} title="How We Share Information">
          <p>
            We share information only as needed to run the Service, and with providers who process it
            on our behalf under their own privacy and security commitments:
          </p>
          <p>
            <strong>Supabase</strong> (secure database, authentication, and photo storage);{' '}
            <strong>Google</strong> (optional &quot;Sign in with Google&quot;);{' '}
            <strong>Netlify</strong> (website hosting); <strong>Resend</strong> (sending
            booking and account emails); and <strong>Cloudflare</strong> (domain and DNS).
          </p>
          <p>
            We may also share information with a <strong>veterinarian or emergency contact</strong>{' '}
            if your pet needs care, and where required by law or to protect the safety of a person or
            animal. If our business is ever transferred, account information may transfer with it.
          </p>
        </Section>

        <Section n={4} title="Google User Data">
          <p>
            When you choose &quot;Sign in with Google,&quot; we use your Google profile name and email
            address solely to create and secure your account and to sign you in. Our use of
            information received from Google APIs adheres to the{' '}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" style={s.inlineLink} target="_blank" rel="noopener noreferrer">
              Google API Services User Data Policy
            </a>, including the Limited Use requirements. We do not use Google data for advertising and
            do not share it with third parties except as described in this Policy.
          </p>
        </Section>

        <Section n={5} title="Data Retention">
          <p>
            We keep your account, pet, and booking records for as long as your account is active and
            as needed to provide the Services, resolve disputes, keep accurate business and payment
            records, and meet legal obligations. You can ask us to delete your account and associated
            data at any time (see &quot;Your Choices&quot; below), and we&apos;ll do so except where
            we&apos;re required to keep certain records.
          </p>
        </Section>

        <Section n={6} title="Security">
          <p>
            Your data is stored with reputable providers using encryption in transit and access
            controls, and photos are served through time-limited links. No system is perfectly
            secure, but we take reasonable steps to protect your information and limit access to those
            who need it to provide care.
          </p>
        </Section>

        <Section n={7} title="Your Choices &amp; Rights">
          <p>
            You can view and update most of your information from your dashboard. You may also contact
            us to access, correct, or delete your personal information, or to close your account.
            Depending on where you live, you may have additional rights under laws such as the
            California Consumer Privacy Act — we honor those requests regardless of location. We
            don&apos;t sell personal information.
          </p>
        </Section>

        <Section n={8} title="Children">
          <p>
            The Site and Services are intended for pet owners who are at least 18 years old. We
            don&apos;t knowingly collect personal information from children. If you believe a child
            has provided us information, contact us and we&apos;ll delete it.
          </p>
        </Section>

        <Section n={9} title="Cookies &amp; Similar Technologies">
          <p>
            We use only the cookies and local storage necessary to keep you signed in and to make the
            Site work. We don&apos;t use advertising or third-party tracking cookies.
          </p>
        </Section>

        <Section n={10} title="Changes to This Policy">
          <p>
            We may update this Policy from time to time. When we do, we&apos;ll change the effective
            date above, and significant changes may be highlighted in the app.
          </p>
        </Section>

        <Section n={11} title="Contact Us">
          <p>
            Questions, or a request about your data? Email us at{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} style={s.inlineLink}>{CONTACT_EMAIL}</a>.
          </p>
        </Section>

        <p style={s.signature}>Danny R. Baker and Mauro Di Jorgi</p>

        <div style={s.backRow}>
          <a href="/" style={s.backLink}>← Back to home</a>
          <a href="/terms" style={s.backLink}>Terms of Service</a>
        </div>
      </main>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  h1:          { margin: '0 0 4px', fontSize: 30, fontWeight: 800, color: '#111827' },
  effective:   { margin: '0 0 20px', fontSize: 14, color: '#9ca3af', fontWeight: 600 },
  intro:       { margin: '0 0 32px', fontSize: 16, lineHeight: 1.7, color: '#6b7280' },
  section:     { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 'var(--radius-card)', padding: '22px 24px', marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
  sectionHead: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 },
  num:         { flexShrink: 0, width: 28, height: 28, borderRadius: '50%', background: 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  sectionTitle:{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111827' },
  sectionBody: { fontSize: 15, lineHeight: 1.7, color: '#374151' },
  inlineLink:  { color: 'var(--primary)', fontWeight: 600 },
  signature:   { margin: '28px 0 0', fontSize: 15, fontWeight: 700, color: '#111827' },
  backRow:     { marginTop: 24, display: 'flex', gap: 20 },
  backLink:    { fontSize: 14, color: '#6b7280', textDecoration: 'none' },
}
