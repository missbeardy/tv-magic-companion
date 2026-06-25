// src/components/CompletionChecklist.tsx

import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { supabase } from '../lib/supabase';
import { useConfetti } from '../hooks/useConfetti';
import ReviewRequestStep from './ReviewRequestStep';
import {
  fetchReviewOrg,
  isReviewRequestEligible,
  sendReviewRequestSms,
  type ReviewRequestLead,
} from '../lib/reviewRequest';

const CHECKLIST = [
  'Equipment tested and working correctly',
  'Work area left clean and tidy',
  'Customer shown how to use the equipment',
  'Receipt / invoice discussed with customer',
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
  lead: ReviewRequestLead;
  onComplete: () => void | Promise<void>;
  onCancel: () => void;
  logEvent?: (leadId: string, note: string) => Promise<void>;
}

export default function CompletionChecklist({ lead, onComplete, onCancel, logEvent }: Props) {
  const { profile } = useAuth();
  const { isFeatureEnabled, featureSwitchesLoading } = useOrg();
  const { fireConfetti } = useConfetti();
  const reviewFeatureEnabled = !featureSwitchesLoading && isFeatureEnabled('review_requests');
  const upsellsEnabled = !featureSwitchesLoading && isFeatureEnabled('completion_upsells');
  const [checked, setChecked] = useState<boolean[]>(CHECKLIST.map(() => false));
  const [upsellDone, setUpsellDone] = useState(!upsellsEnabled);
  const [upsellLabels, setUpsellLabels] = useState<string[]>(DEFAULT_UPSELLS);
  const [step, setStep] = useState<'checklist' | 'review'>('checklist');
  const [sendingReview, setSendingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

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
        const labels = (data.upsell_items as UpsellItem[]).map(item => item.label);
        setUpsellLabels(labels);
      }
    }
    loadUpsells();
  }, [profile?.org_id]);

  const toggle = (i: number) => {
    setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  };

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
    fireConfetti();
    await onComplete();
  }

  async function handleChecklistConfirm() {
    const org = profile?.org_id ? await fetchReviewOrg(profile.org_id) : null;
    const eligible = await isReviewRequestEligible(org, lead, profile?.org_id, reviewFeatureEnabled);
    if (eligible && lead.phone?.trim()) {
      setStep('review');
      return;
    }
    await finishJob(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-lg p-6 space-y-4">
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
                disabled={!allChecked || !upsellDone}
                className="flex-1 py-3 rounded-xl bg-green-500 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Complete Job ✅
              </button>
            </div>
          </>
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
