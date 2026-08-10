import { Link } from 'react-router-dom'

/**
 * Covers the FieldBourne *app subscription* specifically — separate from the broader services
 * terms at fieldbournedigital.com.au/terms.html. See PrivacyPolicyPage.tsx for the same
 * split-surface reasoning.
 */
export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="font-display font-bold text-gray-900 text-2xl">Terms of Service</h1>
          <p className="text-sm text-gray-500 mt-1">Last updated: August 2026</p>
        </div>

        <section className="space-y-2 text-sm text-gray-700">
          <h2 className="font-semibold text-gray-900">1. The service</h2>
          <p>
            FieldBourne ("the Service") is provided by FieldBourne Digital (ABN 22 324 219 568) to
            Australian trade businesses to capture, manage, and follow up on customer enquiries
            and jobs. By creating an account or using the Service, you agree to these terms.
          </p>
        </section>

        <section className="space-y-2 text-sm text-gray-700">
          <h2 className="font-semibold text-gray-900">2. Subscriptions and billing</h2>
          <p>
            Paid plans are billed in advance on a recurring basis via Stripe. You can cancel at
            any time from Franchise Settings or by contacting admin@fieldbournedigital.com.au; access continues
            until the end of the current billing period. Fees are quoted in AUD and are exclusive
            of GST unless stated otherwise.
          </p>
        </section>

        <section className="space-y-2 text-sm text-gray-700">
          <h2 className="font-semibold text-gray-900">3. Your responsibilities</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>You are responsible for the accuracy of customer data you enter or that flows in via connected channels (SMS, email, Facebook)</li>
            <li>You must have a lawful basis to message your customers, and comply with the Spam Act 2003 for any messages you send through the Service</li>
            <li>You must keep your account credentials confidential and are responsible for activity under your account</li>
          </ul>
        </section>

        <section className="space-y-2 text-sm text-gray-700">
          <h2 className="font-semibold text-gray-900">4. Acceptable use</h2>
          <p>
            You may not use the Service to send unlawful, deceptive, or unsolicited
            communications, to store data you don't have the right to store, or to attempt to
            access another organisation's data.
          </p>
        </section>

        <section className="space-y-2 text-sm text-gray-700">
          <h2 className="font-semibold text-gray-900">5. Data and your customers</h2>
          <p>
            You (the trade business) are responsible for your own compliance with the Australian
            Privacy Principles in respect of the customer data you collect through the Service.
            See our <Link to="/privacy" className="underline">Privacy Policy</Link> for what we,
            as the platform, collect and how.
          </p>
        </section>

        <section className="space-y-2 text-sm text-gray-700">
          <h2 className="font-semibold text-gray-900">6. Termination</h2>
          <p>
            Either party may terminate at any time. On termination, we retain your business
            records for 5 years to meet legal obligations (e.g. invoices for ATO purposes)
            before deletion, unless you request earlier deletion where permitted by law.
          </p>
        </section>

        <section className="space-y-2 text-sm text-gray-700">
          <h2 className="font-semibold text-gray-900">7. Liability</h2>
          <p>
            The Service is provided "as is". To the maximum extent permitted by Australian
            Consumer Law, FieldBourne Digital is not liable for indirect or consequential
            losses arising from use of the Service. Nothing in these terms limits any consumer
            guarantee that cannot lawfully be excluded.
          </p>
        </section>

        <section className="space-y-2 text-sm text-gray-700">
          <h2 className="font-semibold text-gray-900">8. Governing law</h2>
          <p>These terms are governed by the laws of Queensland, Australia.</p>
        </section>

        <p className="text-xs text-gray-400 pt-4">
          Questions? Contact admin@fieldbournedigital.com.au. See also our{' '}
          <Link to="/privacy" className="underline">Privacy Policy</Link>.
        </p>
      </main>
    </div>
  )
}
