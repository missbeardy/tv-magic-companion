import { useState, type FormEvent, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import AddressAutocomplete from '../components/AddressAutocomplete'
import { usePlacement } from './usePlacement'
import { formatMm, zoneLabel } from './placementMath'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

export default function QuoteSheet() {
  const { snapshot } = usePlacement()
  const reduced = usePrefersReducedMotion()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [sending, setSending] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!name.trim() || !phone.trim() || !address.trim()) {
      setError('Name, phone and address are required.')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/campaign-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          website: honeypot,
          productId: snapshot.product.id,
          productLabel: snapshot.product.label,
          productKind: snapshot.product.kind,
          centreHeightMm: snapshot.centreHeightMm,
          ceilingHeightMm: snapshot.ceilingHeightMm,
          wallWidthMm: snapshot.wallWidthMm,
          viewingDistanceMm: snapshot.viewingDistanceMm,
          floorToBottom: snapshot.floorToBottom,
          ceilingToTop: snapshot.ceilingToTop,
          zone: snapshot.zone,
        }),
      })
      const payload = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) {
        setError(payload?.error || 'Could not send the quote. Try again.')
        return
      }
      setSubmitted(true)
    } catch {
      setError('Could not send the quote. Check your connection and try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section id="quote" className="scroll-mt-16 border-t border-[var(--c-line)] px-4 py-12 sm:px-5 md:px-10 md:py-20">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2">
        <div>
          <h2 className="campaign-display text-2xl uppercase sm:text-3xl md:text-5xl">
            Australia’s most trusted TV mounting service
          </h2>
          <p className="mt-4 max-w-md text-[var(--c-body)]">
            Get it mounted perfectly. We’ll call to confirm a time — no prices on this page, a technician quotes
            on site.
          </p>
          <div id="guarantee" className="mt-8 bg-[var(--c-coral)] px-4 py-6 text-white sm:px-6 sm:py-8">
            <p className="font-[Maven_Pro,sans-serif] text-sm font-bold uppercase tracking-[0.16em]">
              TV Magic Free TV Guarantee
            </p>
            <p className="mt-2 text-sm text-white/90">
              If your wall-mounted TV ever falls due to our installation or bracket, we’ll replace it and give you
              another TV.
            </p>
            <dl className="mt-6 grid grid-cols-3 gap-2 border-t border-white/25 pt-6 sm:gap-3">
              <Stat n="460,000+" l="TVs mounted" />
              <Stat n="6,000+" l="5-star reviews" />
              <Stat n="22+" l="Years" />
            </dl>
          </div>
          <ul className="mt-8 grid gap-4 text-sm text-[var(--c-body)] sm:grid-cols-3">
            <li>
              <strong className="block text-[var(--c-navy)]">Fully qualified</strong>
              Police checked and insured.
            </li>
            <li>
              <strong className="block text-[var(--c-navy)]">Neat install</strong>
              Clean finish, every time.
            </li>
            <li>
              <strong className="block text-[var(--c-navy)]">Australia-wide</strong>
              We come to you.
            </li>
          </ul>
        </div>

        <div className="border border-[var(--c-line)] bg-white p-4 sm:p-6 md:p-8">
          <AnimatePresence mode="wait">
            {submitted ? (
              <motion.div
                key="done"
                initial={reduced ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex min-h-[22rem] flex-col justify-center"
              >
                <h3 className="campaign-display text-3xl uppercase">We’ll call you</h3>
                <p className="mt-3 text-[var(--c-body)]">
                  Thanks {name.trim().split(' ')[0]}. A TV Magic technician will be in touch about your{' '}
                  {snapshot.product.label.toLowerCase()} at {formatMm(snapshot.centreHeightMm)} centre.
                </p>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                onSubmit={onSubmit}
                noValidate
              >
                <h3 className="campaign-display text-2xl uppercase">Book a free quote</h3>
                <div className="mt-6 space-y-4">
                  <Field label="Name">
                    <input
                      id="quote-name"
                      className="campaign-input"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your full name"
                    />
                  </Field>
                  <Field label="Phone">
                    <input
                      id="quote-phone"
                      className="campaign-input"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Mobile number"
                    />
                  </Field>
                  <Field label="Address">
                    <AddressAutocomplete
                      id="quote-address"
                      value={address}
                      onChange={setAddress}
                      placeholder="Street address, suburb"
                      className="campaign-input"
                    />
                  </Field>
                  <div className="campaign-hp" aria-hidden="true">
                    <label htmlFor="quote-website">Website</label>
                    <input
                      id="quote-website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={honeypot}
                      onChange={(e) => setHoneypot(e.target.value)}
                    />
                  </div>
                </div>
                {error && <p className="mt-3 text-sm text-[var(--c-coral)]">{error}</p>}
                <button type="submit" className="campaign-btn mt-6 w-full" disabled={sending}>
                  {sending ? 'Sending…' : 'Book a free quote'}
                </button>
                <div className="mt-8 border-t border-[var(--c-line)] pt-5">
                  <p className="campaign-laser-label text-[var(--c-navy)]">Summary</p>
                  <ul className="mt-3 space-y-1 text-sm text-[var(--c-body)]">
                    <li>{snapshot.product.label}</li>
                    <li>{formatMm(snapshot.centreHeightMm)} centre · {formatMm(snapshot.ceilingHeightMm)} ceiling</li>
                    <li>{zoneLabel(snapshot.zone)}</li>
                  </ul>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  )
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <div>
      <dt className="font-[Maven_Pro,sans-serif] text-sm font-black sm:text-xl">{n}</dt>
      <dd className="mt-1 text-[9px] uppercase tracking-wider text-white/85 sm:text-[11px]">{l}</dd>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-bold uppercase tracking-[0.14em] text-[var(--c-navy)]">
      {label}
      <span className="mt-1.5 block font-normal normal-case tracking-normal">{children}</span>
    </label>
  )
}
