interface Lead {
  id: string;
  name: string;
  phone: string;
  address?: string;
  service_type?: string;
  [key: string]: any;
}

interface Props {
  lead: Lead;
  onClose: () => void;
}

export default function ReceiptPreview({ lead, onClose }: Props) {
  const date = new Date().toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const receiptText = `TVMagic Receipt\n${date}\n\nCustomer: ${lead.name}\nPhone: ${lead.phone}\nAddress: ${lead.address ?? 'N/A'}\nService: ${lead.service_type ?? 'TV Aerial / Satellite'}\n\nThank you for choosing TVMagic. Job completed and signed off.\n\nFor queries call 1300 TVMagic`;

  const handleSMS = () => {
    const encoded = encodeURIComponent(receiptText);
    window.location.href = `sms:${lead.phone}?body=${encoded}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-lg p-6 space-y-4">
        <h2 className="text-lg font-bold text-[#004B93]">Job Receipt</h2>

        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 font-mono text-sm whitespace-pre-wrap text-gray-700">
          {receiptText}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSMS}
            className="flex-1 py-3 rounded-xl bg-[#00B4C5] text-white font-semibold"
          >
            💬 Text to Customer
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(receiptText);
              alert('Receipt copied to clipboard!');
            }}
            className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-semibold"
          >
            📋 Copy
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-gray-100 text-gray-500 font-semibold"
        >
          Close
        </button>
      </div>
    </div>
  );
}