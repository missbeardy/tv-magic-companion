// src/components/settings/UpsellSettingsPanel.tsx

import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, Save } from 'lucide-react';

interface UpsellItem {
  id: string;
  label: string;
}

interface UpsellSettingsPanelProps {
  orgId: string;
}

function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

export default function UpsellSettingsPanel({ orgId }: UpsellSettingsPanelProps) {
  const [items, setItems] = useState<UpsellItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (!orgId) return;
      setLoading(true);
      const { data, error } = await supabase
        .from('orgs')
        .select('upsell_items')
        .eq('id', orgId)
        .single();

      if (error) {
        setError('Could not load upsell settings.');
      } else if (data?.upsell_items && Array.isArray(data.upsell_items)) {
        setItems(data.upsell_items as UpsellItem[]);
      }
      setLoading(false);
    }
    load();
  }, [orgId]);

  const handleLabelChange = (id: string, newLabel: string) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, label: newLabel } : item));
  };

  const handleAdd = () => {
    setItems(prev => [...prev, { id: makeId(), label: '' }]);
  };

  const handleRemove = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleSave = async () => {
    if (!orgId) return;

    if (items.some(item => !item.label.trim())) {
      setError('All upsell items must have a name before saving.');
      return;
    }

    setSaving(true);
    setError(null);

    const { error: saveError } = await supabase
      .from('orgs')
      .update({ upsell_items: items })
      .eq('id', orgId);

    setSaving(false);

    if (saveError) {
      setError('Failed to save. Please try again.');
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  if (loading) {
    return <p className="text-sm text-gray-500">Loading upsell settings...</p>;
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      <div>
        <p className="text-sm font-semibold text-gray-700">🛒 Post-Sale Upsell Items</p>
        <p className="text-xs text-gray-400 mt-1">
          These appear in the job completion checklist for your technicians to offer customers.
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}

      <div className="space-y-2">
        {items.length === 0 && (
          <p className="text-sm text-gray-400 italic">No upsell items yet. Add one below.</p>
        )}
        {items.map((item, index) => (
          <div key={item.id} className="flex items-center gap-2">
            <span className="text-sm text-gray-400 w-5 text-right shrink-0">{index + 1}.</span>
            <input
              type="text"
              value={item.label}
              onChange={e => handleLabelChange(item.id, e.target.value)}
              placeholder="e.g. Surge Protection — $49"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
            />
            <button
              type="button"
              onClick={() => handleRemove(item.id)}
              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
              title="Remove item"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-[#004B93] border border-[#004B93] rounded-lg hover:bg-blue-50 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Item
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-[#004B93] text-white rounded-lg hover:bg-[#003d7a] disabled:opacity-50 transition-colors"
        >
          <Save className="h-4 w-4" />
          {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}