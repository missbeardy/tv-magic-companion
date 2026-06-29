// src/components/AddLeadModal.tsx
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useOrg } from '../context/OrgContext';
import { supabase } from '../lib/supabase';
import { alertManagersOnNewLead } from '../lib/notify';
import { logLeadEvent } from '../lib/leadEvents';
import { buildSoloManualLeadFields } from '../lib/soloLeadAssignment';
import { X, UserPlus, Phone, Mail, MapPin, Briefcase } from 'lucide-react';

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function AddLeadModal({ onClose, onCreated }: Props) {
  const { profile } = useAuth();
  const { org } = useOrg();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate() {
    if (!name.trim()) {
      setError('Please enter the customer\'s name');
      return;
    }
    if (!phone.trim() && !email.trim()) {
      setError('Please enter a phone number or email so this lead can be contacted');
      return;
    }
    setSaving(true);
    setError('');

    const soloFields = buildSoloManualLeadFields(org?.operation_mode, profile?.id)

    const { data: lead, error: insertError } = await supabase.from('leads').insert({
      org_id: profile?.org_id,
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      service_type: serviceType.trim() || 'General Enquiry',
      details: details.trim() || null,
      ...soloFields,
      source: 'manual',
      lead_source: 'Manual Entry',
    }).select('id').single();

    if (insertError || !lead) {
      setError(insertError?.message ?? 'Failed to create lead');
      setSaving(false);
      return;
    }

    await logLeadEvent({
      leadId: lead.id,
      orgId: profile?.org_id ?? null,
      eventType: 'created',
      note: 'Lead created manually',
      actorId: profile?.id ?? null,
      payload: {
        source: 'manual',
        lead_source: 'Manual Entry',
      },
    });

    await alertManagersOnNewLead(lead.id);

    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#004B93]/10 flex items-center justify-center">
              <UserPlus size={15} className="text-[#004B93]" />
            </div>
            <h3 className="font-display font-semibold text-gray-900 text-base">Add Lead</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-sm">{error}</div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Customer Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#004B93]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                <Phone size={11} className="inline mr-1" />Phone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="0412 345 678"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#004B93]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                <Mail size={11} className="inline mr-1" />Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="jane@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#004B93]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              <MapPin size={11} className="inline mr-1" />Address
            </label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Street address, suburb"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#004B93]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              <Briefcase size={11} className="inline mr-1" />Service Type
            </label>
            <input
              type="text"
              value={serviceType}
              onChange={e => setServiceType(e.target.value)}
              placeholder="e.g. Antenna Install"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#004B93]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Details</label>
            <textarea
              value={details}
              onChange={e => setDetails(e.target.value)}
              rows={3}
              placeholder="Any extra notes about this job…"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#004B93] resize-none"
            />
          </div>
        </div>

        <div className="px-6 pb-5 flex gap-3 shrink-0">
          <button onClick={onClose} disabled={saving} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm font-semibold hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleCreate} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-[#004B93] text-white text-sm font-semibold hover:bg-[#003d7a] transition-colors disabled:opacity-60">
            {saving ? 'Adding...' : 'Add Lead'}
          </button>
        </div>
      </div>
    </div>
  );
}