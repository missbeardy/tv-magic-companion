interface Props {
  employeeName: string;
  activeLeadCount: number;
  isRecommended: boolean;
  suburbMatch?: boolean;
}

export default function SmartAssignBadge({
  employeeName,
  activeLeadCount,
  isRecommended,
  suburbMatch,
}: Props) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm ${
      isRecommended
        ? 'border-green-400 bg-green-50 text-green-700'
        : 'border-gray-200 bg-white text-gray-600'
    }`}>
      <span className="font-medium">{employeeName}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">{activeLeadCount} active</span>
        {suburbMatch && (
          <span className="text-xs bg-[#00B4C5]/20 text-[#004B93] px-2 py-0.5 rounded-full">
            📍 Nearby
          </span>
        )}
        {isRecommended && (
          <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-semibold">
            ★ Recommended
          </span>
        )}
      </div>
    </div>
  );
}