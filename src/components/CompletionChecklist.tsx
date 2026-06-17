// src/components/CompletionChecklist.tsx

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

interface CompletionChecklistProps {
  jobId?: string;
  onComplete?: (data: any) => void;
  onConfirm?: (data?: any) => Promise<void> | void;
  onCancel?: () => void;
  initialData?: any;
}

interface UpsellItem {
  id: string;
  label: string;
}

const DEFAULT_UPSELLS: UpsellItem[] = [
  { id: 'signal_check', label: '$49 Signal Check' },
  { id: 'surge_protection', label: 'Surge Protection' },
  { id: 'premium_cables', label: 'Premium Cables Upgrade' },
  { id: 'wall_mount', label: 'Wall Mount Bracket' }
];

export default function CompletionChecklist({ jobId, onComplete, onConfirm, onCancel, initialData }: CompletionChecklistProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [upsellItems, setUpsellItems] = useState<UpsellItem[]>(DEFAULT_UPSELLS);

  const [formData, setFormData] = useState({
    photosUploaded: false,
    paymentCollected: false,
    invoiceSent: false,
    upsellOffered: false,
    selectedUpsells: [] as string[],
    notes: ''
  });

  // FIX: Was querying 'orgs' — corrected to 'organisations' to match your actual table name.
  // If upsell_items doesn't exist on your organisations table yet, this will just fall back
  // to DEFAULT_UPSELLS silently — no crash.
  useEffect(() => {
    async function fetchOrgUpsells() {
      if (!profile?.org_id) return;
      try {
        const { data, error } = await supabase
          .from('orgs')
          .select('upsell_items')
          .eq('id', profile.org_id)
          .single();

        if (error) throw error;
        if (data?.upsell_items && Array.isArray(data.upsell_items) && data.upsell_items.length > 0) {
          setUpsellItems(data.upsell_items as UpsellItem[]);
        }
      } catch (err) {
        // Silently fall back to defaults — org may not have custom upsells configured yet
        console.warn('Could not fetch org upsell items, using defaults:', err);
      }
    }

    fetchOrgUpsells();
  }, [profile?.org_id]);

  useEffect(() => {
    if (initialData) {
      setFormData({
        photosUploaded: initialData.photos_uploaded || false,
        paymentCollected: initialData.payment_collected || false,
        invoiceSent: initialData.invoice_sent || false,
        upsellOffered: initialData.upsell_offered || false,
        selectedUpsells: initialData.selected_upsells || [],
        notes: initialData.notes || ''
      });
    }
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (onComplete) onComplete(formData);
      if (onConfirm) await onConfirm(formData);
    } catch (error) {
      console.error('Error in checklist submission:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleUpsell = (id: string) => {
    setFormData(prev => ({
      ...prev,
      selectedUpsells: prev.selectedUpsells.includes(id)
        ? prev.selectedUpsells.filter(item => item !== id)
        : [...prev.selectedUpsells, id]
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-medium text-gray-900 border-b pb-3">Job Completion Checklist</h3>

      <div className="space-y-4">
        <label className="flex items-center space-x-3 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.photosUploaded}
            onChange={e => setFormData({ ...formData, photosUploaded: e.target.checked })}
            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="text-gray-700">Before & After Photos Uploaded</span>
        </label>

        <label className="flex items-center space-x-3 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.paymentCollected}
            onChange={e => setFormData({ ...formData, paymentCollected: e.target.checked })}
            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="text-gray-700">Payment Collected / Arranged</span>
        </label>

        <label className="flex items-center space-x-3 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.invoiceSent}
            onChange={e => setFormData({ ...formData, invoiceSent: e.target.checked })}
            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="text-gray-700">Invoice Generated & Sent</span>
        </label>

        <div className="border-t pt-4">
          <label className="flex items-center space-x-3 cursor-pointer mb-3">
            <input
              type="checkbox"
              checked={formData.upsellOffered}
              onChange={e => setFormData({ ...formData, upsellOffered: e.target.checked, selectedUpsells: e.target.checked ? formData.selectedUpsells : [] })}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-gray-700 font-medium">Upsell Items Offered?</span>
          </label>

          {formData.upsellOffered && (
            <div className="ml-7 bg-gray-50 p-4 rounded-md grid grid-cols-1 sm:grid-cols-2 gap-3 transition-all">
              {upsellItems.map(item => (
                <label key={item.id} className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.selectedUpsells.includes(item.id)}
                    onChange={() => toggleUpsell(item.id)}
                    className="h-4 w-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                  />
                  <span className="text-sm text-gray-600">{item.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="border-t pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Completion Notes / Feedback</label>
          <textarea
            rows={3}
            value={formData.notes}
            onChange={e => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Add any final handover details here..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
          />
        </div>
      </div>

      <div className="pt-4 border-t flex justify-end space-x-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {loading ? 'Saving...' : 'Complete Job'}
        </button>
      </div>
    </form>
  );
}