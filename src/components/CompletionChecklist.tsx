// src/components/CompletionChecklist.tsx
import { useState } from 'react';

const CHECKLIST = [
  'Equipment tested and working correctly',
  'Work area left clean and tidy',
  'Customer shown how to use the equipment',
  'Have you collected a Google Review?'
];

const UPSELLS = [
  '📡 Annual signal health check ($49)',
  '🔧 Surge protector fitting ($35)',
  '📺 Additional TV point installation',
  '🛡️ 12-month extended warranty',
];

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
}

export default function CompletionChecklist({ onConfirm, onCancel }: Props) {
  const [checked, setChecked] = useState<boolean[]>(CHECKLIST.map(() => false));
  const [upsellDone, setUpsellDone] = useState(false);

  const allChecked = checked.every(Boolean);

  const toggle = (i: number) => {
    setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40">
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full max-w-lg p-6 space-y-4">
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

        {allChecked && (
          <div className="bg-[#00B4C5]/10 border border-[#00B4C5] rounded-xl p-4">
            <p className="text-sm font-semibold text-[#004B93] mb-2">
              💡 Did you offer any add-ons?
            </p>
            <ul className="space-y-1">
              {UPSELLS.map((u, i) => (
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
            onClick={onConfirm}
            disabled={!allChecked || !upsellDone}
            className="flex-1 py-3 rounded-xl bg-green-500 text-white font-semibold disabled:opacity-40"
          >
            Complete Job ✅
          </button>
        </div>
      </div>
    </div>
  );
}