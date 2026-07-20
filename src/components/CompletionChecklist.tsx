// src/components/CompletionChecklist.tsx

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { supabase } from '../lib/supabase';
import { useConfetti } from '../hooks/useConfetti';
import ReviewRequestStep from './ReviewRequestStep';
import InvoiceStep from './InvoiceStep';
import {
  fetchReviewOrg,
  isReviewRequestEligible,
  sendReviewRequestSms,
  type ReviewRequestLead,
} from '../lib/reviewRequest';
import { loadCompletionDraft, saveCompletionDraft, clearCompletionDraft } from '../lib/completionDraft';

// Trade-neutral defaults (were TV-installer specific). Per-org customisation is a
// planned follow-up; these read sensibly for any trade in the meantime.
const CHECKLIST = [
  'Work completed to standard',
  'Work area left clean and tidy',
  'Customer walked through the work done',
  'Payment / invoice discussed with customer',
];

const DEFAULT_UPSELLS = [
  '📡 Annual signal health check ($49)',
  '🔧 Surge protector fitting ($35)',
  '📺 Additional TV point installation',
  '🛡️ 12-month extended warranty',
];

interface UpsellItem {
  id: string;
  label: string;
}

interface Props {
  lead: ReviewRequestLead & { email?: string | null; service_type?: string | null };
  onComplete: () => void | Promise<void>;
  onCancel: () => void;
  logEvent?: (leadId: string, note: string, eventType?: 'invoice_sent' | 'completed') => Promise<void>;
}

export default function CompletionChecklist({ lead, onComplete, onCancel, logEvent }: Props) {
  const { profile } = useAuth();
  const { isFeatureEnabled, featureSwitchesLoading } = useOrg();
  const { fireConfetti } = useConfetti();
  const reviewFeatureEnabled = !featureSwitchesLoading && isFeatureEnabled('review_requests');
  const upsellsEnabled = !featureSwitchesLoading && isFeatureEnabled('completion_upsells');
  const invoiceFeatureEnabled = !featureSwitchesLoading && isFeatureEnabled('one_tap_invoice');
  // Resume a ceremony interrupted mid-flow (same lead only).
  const restored = profile?.id ? loadCompletionDraft(profile.id) : null;
  const draft = restored && restored.leadId === lead.id && restored.checked?.length === CHECKLIST.length
    ? restored
    : null;
  const [checked, setChecked] = useState<boolean[]>(draft ? draft.checked : CHECKLIST.map(() => false));
  const [upsellDone, setUpsellDone] = useState(draft ? draft.upsellDone : !upsellsEnabled);
  const [upsellLabels, setUpsellLabels] = useState<string[]>(DEFAULT_UPSELLS);
  const [step, setStep] = useState<'checklist' | 'invoice' | 'review'>(draft ? draft.step : 'checklist');
  const [sendingReview, setSendingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  const allChecked = checked.every(Boolean);

  useEffect(() => {
    if (!upsellsEnabled) {
      setUpsellDone(true);
    }
  }, [upsellsEnabled]);

  useEffect(() => {
    async function loadUpsells() {
      if (!profile?.org_id) return;
      const { data, error } = await supabase
        .from('orgs')
        .select('upsell_items')
        .eq('id', profile.org_id)
        .single();

      if (!error && Array.isArray(data?.upsell_items) && data.upsell_items.length > 0) {
        const labels = (data.upsell_items as unknown as UpsellItem[]).map(item => item.label);
        setUpsellLabels(labels);
      }
    }
    loadUpsells();
  }, [profile?.org_id]);

  // Persist progress so an interruption can resume this ceremony.
  useEffect(() => {
    if (!profile?.id) return;
    saveCompletionDraft(profile.id, { leadId: lead.id, step, checked, upsellDone });
  }, [profile?.id, lead.id, step, checked, upsellDone]);

  const toggle = (i: number) => {
    setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  };

  async function proceedAfterInvoice(invoiceSent: boolean) {
    if (invoiceSent && logEvent) {
      await logEvent(lead.id, 'Invoice emailed to customer', 'invoice_sent');
    }
    const org = profile?.org_id ? await fetchReviewOrg(profile.org_id) : null;
    const eligible = await isReviewRequestEligible(org, lead, profile?.org_id, reviewFeatureEnabled);
    if (eligible && lead.phone?.trim()) {
      setStep('review');
      return;
    }
    await finishJob(false);
  }

  async function finishJob(sendReviewSms: boolean) {
    if (sendReviewSms) {
      setSendingReview(true);
      setReviewError(null);
      const result = await sendReviewRequestSms(lead, logEvent);
      setSendingReview(false);
      if (!result.ok) {
        setReviewError(result.error);
        return;
      }
    }
    // Only celebrate once the completion is confirmed saved (or safely queued for
    // sync). If it can't be persisted at all, keep the modal open and surface it.
    setFinishing(true);
    setCompletionError(null);
    try {
      await onComplete();
    } catch {
      setFinishing(false);
      setCompletionError("Couldn't save the completion. Check your connection and try again.");
      return;
    }
    if (profile?.id) clearCompletionDraft(profile.id);
    fireConfetti();
  }

  async function handleChecklistConfirm() {
    if (invoiceFeatureEnabled) {
      setStep('invoice');
      return;
    }
    await proceedAfterInvoice(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-lg p-6 space-y-4">
        {completionError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {completionError}
          </p>
        )}
        {step === 'checklist' ? (
          <>
            <h2 className="text-lg font-bold text-[#004B93]">Before You Close This Job</h2>

            <div className="space-y-3">
              {CHECKLIST.map((item, i) => (
                <label key={i} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked[i]}
                    onChange={() => toggle(i)}
                    className="w-5 h-5 accent-[#004B93]"
                  />
                  <span className={`text-sm ${checked[i] ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                    {item}
                  </span>
                </label>
              ))}
            </div>

            {allChecked && upsellsEnabled && (
              <div className="bg-[#00B4C5]/10 border border-[#00B4C5] rounded-xl p-4">
                <p className="text-sm font-semibold text-[#004B93] mb-2">
                  💡 Did you offer any add-ons?
                </p>
                <ul className="space-y-1">
                  {upsellLabels.map((u, i) => (
                    <li key={i} className="text-sm text-gray-600">• {u}</li>
                  ))}
                </ul>
                <label className="flex items-center gap-2 mt-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={upsellDone}
                    onChange={() => setUpsellDone(!upsellDone)}
                    className="w-5 h-5 accent-[#00B4C5]"
                  />
                  <span className="text-sm text-gray-700">I've discussed add-ons with the customer</span>
                </label>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={onCancel}
                className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleChecklistConfirm}
                disabled={!allChecked || !upsellDone || finishing}
                className="flex-1 py-3 rounded-xl bg-green-500 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {invoiceFeatureEnabled ? 'Next — Invoice' : finishing ? 'Completing…' : 'Complete Job ✅'}
              </button>
            </div>
          </>
        ) : step === 'invoice' ? (
          <InvoiceStep
            lead={lead}
            onDone={async ({ sent }) => proceedAfterInvoice(sent)}
            onCancel={onCancel}
          />
        ) : (
          <>
            <h2 className="text-lg font-bold text-[#004B93]">Before You Close This Job</h2>
            <ReviewRequestStep
              embedded
              customerName={lead.name}
              customerPhone={lead.phone!.trim()}
              sending={sendingReview}
              error={reviewError}
              onSend={() => finishJob(true)}
              onSkip={() => finishJob(false)}
            />
          </>
        )}
      </div>
    </div>
  );
}
