interface HPBarProps {
  /** Percentage of HP remaining after max damage (0-100) */
  minRemaining: number;
  /** Percentage of HP remaining after min damage (0-100) */
  maxRemaining: number;
}

export default function HPBar({ minRemaining, maxRemaining }: HPBarProps) {
  const clampMin = Math.max(0, Math.min(100, minRemaining));
  const clampMax = Math.max(0, Math.min(100, maxRemaining));

  // Color based on min remaining HP
  const barColor = clampMin > 50 ? 'bg-green-500' : clampMin > 25 ? 'bg-yellow-500' : 'bg-red-500';
  const rangeColor = clampMin > 50 ? 'bg-green-400/40' : clampMin > 25 ? 'bg-yellow-400/40' : 'bg-red-400/40';

  return (
    <div className="w-full h-4 bg-gray-800 rounded overflow-hidden relative">
      {/* Guaranteed remaining HP (after max damage) */}
      <div
        className={`absolute inset-y-0 left-0 ${barColor} transition-all`}
        style={{ width: `${clampMin}%` }}
      />
      {/* Range zone between min and max damage */}
      {clampMax > clampMin && (
        <div
          className={`absolute inset-y-0 ${rangeColor} transition-all`}
          style={{ left: `${clampMin}%`, width: `${clampMax - clampMin}%` }}
        />
      )}
    </div>
  );
}
