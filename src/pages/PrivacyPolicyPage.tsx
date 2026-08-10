import { Link } from 'react-router-dom'

/**
 * Covers the FieldBourne *app* specifically — what the product collects from trade businesses
 * and their customers. This is deliberately separate from the marketing-site policy at
 * fieldbournedigital.com.au/privacy.html, which only covers the website contact form and does
 * not disclose the app's subprocessors, GPS, or job photos (all of which the Play Store Data
 * Safety declaration requires). Content verified against the codebase; the retention periods
 * reflect general ATO record-keeping guidance and are the part most worth a professional
 * review. See api/_lib/accountDeletion.ts for the deletion matrix this describes.
 */
export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="font-display font-bold text-gray-900 text-2xl">Privacy Policy</h1>
          <p className="text-sm text-gray-500 mt-1">Last updated: August 2026</p>
          <p className="text-sm text-gray-500 mt-1">
            This policy covers the FieldBourne app. For our website, see{' '}
            <a
              href="https://fieldbournedigital.com.au/privacy.html"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              fieldbournedigital.com.au/privacy.html
            </a>
            .
          </p>
        </div>

        <section className="space-y-2 text-sm text-gray-700">
          <h2 className="font-semibold text-gray-900">Who we are</h2>
          <p>
            FieldBourne is operated by FieldBourne Digital (ABN 22 324 219 568), based in
            Beaudesert, Queensland, Australia. For privacy questions or requests, contact
            admin@fieldbournedigital.com.au.
          </p>
        </section>

        <section className="space-y-2 text-sm text-gray-700">
          <h2 className="font-semibold text-gray-900">What we collect</h2>
          <p>When a trade business uses FieldBourne to manage enquiries and jobs, we collect:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Customer contact details (name, phone, email, address) for each enquiry/lead</li>
            <li>Job details, quotes, invoices, and payment metadata (we do not store full card numbers — payments are processed by Stripe)</li>
            <li>Photos attached to jobs by technicians</li>
            <li>GPS location of technicians, only while the "Location Sharing" setting is turned on in their profile, used to recommend the nearest available technician for a job</li>
            <li>Account details for staff using the app (name, phone, email, role)</li>
          </ul>
        </section>

        <section className="space-y-2 text-sm text-gray-700">
          <h2 className="font-semibold text-gray-900">Who we share it with</h2>
          <p>
            We use the following service providers (subprocessors) to run FieldBourne. Some are
            hosted in the United States:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Supabase</strong> — database and file storage</li>
            <li><strong>Vercel</strong> — application hosting</li>
            <li><strong>Twilio</strong> — SMS messaging</li>
            <li><strong>Anthropic</strong> — AI-assisted extraction of lead details from enquiries</li>
            <li><strong>Stripe</strong> — subscription billing and invoice card payments</li>
            <li><strong>Resend</strong> — transactional email</li>
            <li><strong>OneSignal</strong> — push notifications (only for franchises still on the legacy notification path)</li>
          </ul>
          <p>
            We do not sell customer data. Data may be disclosed if required by Australian law.
          </p>
        </section>

        <section className="space-y-2 text-sm text-gray-700">
          <h2 className="font-semibold text-gray-900">How long we keep it</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Invoices and related tax records: retained for 5 years, in line with ATO record-keeping obligations</li>
            <li>Job photos: retained while the job/lead record exists, deleted on request or account deletion</li>
            <li>Lead and customer records: retained while the business's account is active; a business can request deletion or anonymisation of records — contact admin@fieldbournedigital.com.au</li>
            <li>Staff account data: deleted or anonymised on request — see "Deleting your account" below</li>
          </ul>
        </section>

        <section className="space-y-2 text-sm text-gray-700">
          <h2 className="font-semibold text-gray-900">Your rights</h2>
          <p>
            Under the Australian Privacy Principles, you can ask what personal information we
            hold about you, request a correction, or request deletion. Contact admin@fieldbournedigital.com.au,
            or use the account deletion options below.
          </p>
        </section>

        <section className="space-y-2 text-sm text-gray-700">
          <h2 className="font-semibold text-gray-900">Deleting your account</h2>
          <p>
            Staff members can delete their own account from within the app (Profile → Delete my
            account), or{' '}
            <Link to="/delete-account" className="text-brand-secondary underline">
              request deletion here
            </Link>{' '}
            without signing in. Deleting your account removes your personal login details.
            Business records your employer is required to keep (e.g. invoices) are retained
            separately by the business, not by you as an individual.
          </p>
        </section>

        <section className="space-y-2 text-sm text-gray-700">
          <h2 className="font-semibold text-gray-900">SMS messages</h2>
          <p>
            Customers of a FieldBourne business may receive automated SMS messages (booking
            confirmations, reminders, quote/invoice links). Reply STOP to any message to opt out
            of future automated texts from that business.
          </p>
        </section>

        <p className="text-xs text-gray-400 pt-4">
          See also our <Link to="/terms" className="underline">Terms of Service</Link>.
        </p>
      </main>
    </div>
  )
}
