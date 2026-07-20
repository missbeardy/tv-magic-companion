import { useState, useEffect, ChangeEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useOrg } from '../context/OrgContext';
import { applyThemeToDocument, resolveThemeTokens } from '../lib/theme';
import { buildBrandTransferPayload } from '../lib/brandTransfer';
import NavBar from '../components/NavBar';
import UpsellSettingsPanel from '../components/settings/UpsellSettingsPanel';
import InvoiceTemplateEditor from '../components/settings/InvoiceTemplateEditor';
import PriceListSettingsPanel from '../components/settings/PriceListSettingsPanel';
import AccountingExportPanel from '../components/settings/AccountingExportPanel';
import StripeConnectPanel from '../components/settings/StripeConnectPanel';
import CustomerImportPanel from '../components/CustomerImportPanel';
import BillingPanel from '../components/BillingPanel';
import { formatAbn, isValidAbnFormat } from '../../shared/gst';

export default function OrgSettingsPage() {
  const { org, brand, refreshOrg, isFeatureEnabled, featureSwitchesLoading } = useOrg();
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#004B93');
  const [secondaryColor, setSecondaryColor] = useState('#00B4C5');
  const [supportPhone, setSupportPhone] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [avgJobValue, setAvgJobValue] = useState<number>(180);
  const [googleReviewUrl, setGoogleReviewUrl] = useState('');
  const [abn, setAbn] = useState('');
  const [gstRegistered, setGstRegistered] = useState(true);
  // Image upload states
  const [imageUrl, setImageUrl] = useState<string>('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [applyingBrand, setApplyingBrand] = useState(false);

  useEffect(() => {
    async function loadOrg() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('org_id')
          .eq('id', session.user.id)
          .single();

        if (profile?.org_id) {
          setOrgId(profile.org_id);

          const { data: org } = await supabase
            .from('orgs')
            .select('*')
            .eq('id', profile.org_id)
            .single();

          if (org) {
            setOrgName(org.name || '');
            setPrimaryColor(org.primary_color || '#004B93');
            setSecondaryColor(org.secondary_color || '#00B4C5');
            setSupportPhone(org.support_phone || '');
            setSupportEmail(org.support_email || '');
            setAvgJobValue(org.avg_job_value ?? 180);
            setGoogleReviewUrl(org.google_review_url || '');
            setAbn(org.abn || '');
            setGstRegistered(org.gst_registered !== false);
            setImageUrl(org.logo_url || ''); // Match this key to your database column
          }
        }
      } catch (err) {
        console.error('Load error:', err);
      }
    }

    loadOrg();
  }, []);

  // Handles bucket uploading and returns a public URL reference
  async function handleImageUpload(e: ChangeEvent<HTMLInputElement>) {
    try {
      setError('');
      if (!e.target.files || e.target.files.length === 0) return;
      if (!orgId) {
        setError('Organisation context not found. Cannot upload.');
        return;
      }

      setUploadingImage(true);
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      // Scoping the path by orgId handles file organization gracefully
      const filePath = `${orgId}/business-logo-${Math.random().toString(36).substring(2)}.${fileExt}`;

      // Upload file directly into 'org-assets' public bucket
      const { error: uploadError } = await supabase.storage
        .from('org-assets')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Extract public URL
      const { data: { publicUrl } } = supabase.storage
        .from('org-assets')
        .getPublicUrl(filePath);

      setImageUrl(publicUrl);
    } catch (err: unknown) {
      console.error('Upload failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  }

  async function handleApplyBrandTemplate() {
    if (!orgId || !brand) return
    setApplyingBrand(true)
    setError('')
    try {
      const payload = buildBrandTransferPayload(brand)
      const { error: updateError } = await supabase
        .from('orgs')
        .update(payload)
        .eq('id', orgId)
      if (updateError) throw updateError

      setPrimaryColor(payload.primary_color)
      setSecondaryColor(payload.secondary_color)
      await refreshOrg()
      applyThemeToDocument(resolveThemeTokens(
        { name: orgName, logo_url: imageUrl, primary_color: payload.primary_color, secondary_color: payload.secondary_color },
        brand
      ))
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply brand template')
    } finally {
      setApplyingBrand(false)
    }
  }

  async function handleSave() {
    if (!orgId) {
      setError('Organisation not loaded. Please refresh and try again.');
      return;
    }

    const trimmedAbn = abn.trim();
    if (trimmedAbn && !isValidAbnFormat(trimmedAbn)) {
      setError('ABN must be 11 digits.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: updateError } = await supabase
        .from('orgs')
        .update({
          name: orgName,
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          support_phone: supportPhone,
          support_email: supportEmail,
          avg_job_value: avgJobValue,
          google_review_url: googleReviewUrl.trim() || null,
          abn: trimmedAbn ? formatAbn(trimmedAbn) : null,
          gst_registered: gstRegistered,
          logo_url: imageUrl, // Saves public asset string path reference to DB
        })
        .eq('id', orgId);

      if (updateError) throw updateError;

      await refreshOrg();
      applyThemeToDocument(
        resolveThemeTokens(
          {
            name: orgName,
            logo_url: imageUrl,
            primary_color: primaryColor,
            secondary_color: secondaryColor,
          },
          brand
        )
      );

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      console.error('Save error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <main className="p-6 max-w-lg mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 mb-1">Franchise Settings</h2>
          <p className="text-gray-500 text-sm">Manage your brand and contact information</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>
        )}

        {saved && (
          <div className="bg-green-50 text-green-600 p-3 rounded-lg text-sm">✅ Settings saved!</div>
        )}

        {/* Brand Name */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <p className="text-sm font-semibold text-gray-700">🏢 Franchise Name</p>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              placeholder="e.g., Acme Antennas Brisbane"
            />
            <p className="text-xs text-gray-400 mt-1">This appears throughout the app and on customer communications</p>
          </div>
        </div>

        {/* Business Image Upload Card */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <p className="text-sm font-semibold text-gray-700">🖼️ Business Image / Logo</p>
          <div className="flex flex-col items-center justify-center gap-4 border-2 border-dashed border-gray-200 rounded-xl p-4 bg-gray-50">
            {imageUrl ? (
              <div className="relative group w-full flex flex-col items-center">
                <img
                  src={imageUrl}
                  alt="Business Preview"
                  className="max-h-40 object-contain rounded-lg shadow-sm bg-white p-1"
                />
                <p className="text-xs text-gray-400 mt-2 text-center truncate max-w-xs">{imageUrl}</p>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500">No profile image uploaded yet</p>
                <p className="text-xs text-gray-400">Supports PNG, JPG, or WEBP</p>
              </div>
            )}
            
            <label className="w-full flex justify-center items-center px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition focus-within:ring-2 focus-within:ring-[#004B93]">
              <span>{uploadingImage ? 'Uploading to Storage...' : imageUrl ? 'Change Image' : 'Select Business Image'}</span>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={uploadingImage}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        {/* Brand Colors */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <p className="text-sm font-semibold text-gray-700">🎨 Brand Colors</p>
          <div className="flex gap-2 rounded-lg overflow-hidden h-10 border border-gray-200">
            <div className="flex-1" style={{ backgroundColor: primaryColor }} title="Primary (nav bar)" />
            <div className="flex-1" style={{ backgroundColor: secondaryColor }} title="Secondary" />
          </div>
          <p className="text-xs text-gray-400">Bar above shows your picks; nav bar updates after Save</p>
          {brand && (
            <button
              type="button"
              onClick={handleApplyBrandTemplate}
              disabled={applyingBrand || loading}
              className="text-xs text-gray-600 hover:text-gray-900 underline disabled:opacity-50"
            >
              {applyingBrand ? 'Applying brand template…' : `Reset colors & upsells from ${brand.name} template`}
            </button>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Primary Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-10 h-10 rounded border border-gray-200 cursor-pointer"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                placeholder="#004B93"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Secondary Color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="w-10 h-10 rounded border border-gray-200 cursor-pointer"
              />
              <input
                type="text"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                placeholder="#00B4C5"
              />
            </div>
          </div>
        </div>

        {/* Revenue Settings */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <p className="text-sm font-semibold text-gray-700">💰 Revenue Settings</p>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Average Job Value (AUD)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input
                type="number"
                min="0"
                step="1"
                value={avgJobValue}
                onChange={(e) => setAvgJobValue(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
                placeholder="180"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Used to estimate revenue in the Revenue Snapshot widget</p>
          </div>
        </div>

        {/* Google review requests */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <p className="text-sm font-semibold text-gray-700">⭐ Google Review Requests</p>
          <p className="text-xs text-gray-500">
            Enable or disable review SMS for your brand in Platform Admin → Feature switches (
            <span className="font-medium">Google Review Request SMS</span>). Set your review link below.
          </p>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Google Review Link</label>
            <input
              type="url"
              value={googleReviewUrl}
              onChange={(e) => setGoogleReviewUrl(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              placeholder="https://g.page/r/..."
            />
            <p className="text-xs text-gray-400 mt-1">
              Paste your Google Business review URL — used when a technician confirms the post-job SMS
            </p>
          </div>
        </div>

        {/* Tax Details */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <p className="text-sm font-semibold text-gray-700">🧾 Tax Details (ABN &amp; GST)</p>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">ABN</label>
            <input
              type="text"
              value={abn}
              onChange={(e) => setAbn(e.target.value)}
              onBlur={() => setAbn((v) => (isValidAbnFormat(v) ? formatAbn(v) : v))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              placeholder="12 345 678 901"
            />
            <p className="text-xs text-gray-400 mt-1">Shown on tax invoices sent to customers</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={gstRegistered}
              onChange={(e) => setGstRegistered(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[#004B93] focus:ring-[#004B93]"
            />
            Registered for GST
          </label>
          <p className="text-xs text-gray-400">
            When on, quotes and invoices show the GST component and are titled "Tax Invoice".
            Turn off if you're not GST-registered (e.g. under the $75k threshold).
          </p>
        </div>

        {/* Contact Information */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <p className="text-sm font-semibold text-gray-700">📞 Contact Information</p>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Support Phone</label>
            <input
              type="tel"
              value={supportPhone}
              onChange={(e) => setSupportPhone(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              placeholder="1300 000 000"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Support Email</label>
            <input
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#004B93]"
              placeholder="support@yourfranchise.com"
            />
          </div>
        </div>

        {/* Upsell Items */}
        {orgId && <UpsellSettingsPanel orgId={orgId} />}

        {orgId && !featureSwitchesLoading && isFeatureEnabled('one_tap_invoice') && (
          <InvoiceTemplateEditor orgId={orgId} primaryColor={primaryColor} />
        )}

        {orgId && !featureSwitchesLoading && isFeatureEnabled('accounting_export') && (
          <AccountingExportPanel orgId={orgId} />
        )}

        {orgId && !featureSwitchesLoading && isFeatureEnabled('price_list') && (
          <PriceListSettingsPanel orgId={orgId} />
        )}

        {orgId && !featureSwitchesLoading && isFeatureEnabled('invoice_card_payments') && (
          <StripeConnectPanel />
        )}

        <CustomerImportPanel />

        <BillingPanel />

        <button
          onClick={handleSave}
          disabled={loading || uploadingImage}
          className="w-full btn-primary py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save Settings'}
        </button>
      </main>
    </div>
  );
}