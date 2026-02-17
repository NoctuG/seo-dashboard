import { useMemo } from 'react';

export const EMPTY_PLACEHOLDER = '--';

const TREND_UP_CLASS = 'text-emerald-600';
const TREND_DOWN_CLASS = 'text-rose-600';
const TREND_FLAT_CLASS = 'text-slate-500';

type SparklinePoint = {
  value: number;
  label?: string;
};

interface SparklineProps {
  data: SparklinePoint[];
  width?: number;
  height?: number;
  lowerIsBetter?: boolean;
  className?: string;
}

export function getTrendDirection(first: number, last: number, lowerIsBetter: boolean): 'up' | 'down' | 'flat' {
  if (last === first) return 'flat';
  if (lowerIsBetter) {
    return last < first ? 'up' : 'down';
  }
  return last > first ? 'up' : 'down';
}

export default function Sparkline({
  data,
  width = 96,
  height = 28,
  lowerIsBetter = false,
  className = '',
}: SparklineProps) {
  const points = data.filter((item) => Number.isFinite(item.value));

  const { polylinePoints, colorClass, trendText } = useMemo(() => {
    if (points.length < 2) {
      return { polylinePoints: '', colorClass: TREND_FLAT_CLASS, trendText: EMPTY_PLACEHOLDER };
    }

    const values = points.map((item) => item.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const coords = values.map((value, index) => {
      const x = (index / (values.length - 1)) * (width - 2) + 1;
      const y = height - ((value - min) / range) * (height - 6) - 3;
      return `${x},${y}`;
    });

    const first = values[0];
    const last = values[values.length - 1];
    const direction = getTrendDirection(first, last, lowerIsBetter);
    const delta = Math.abs(last - first);
    const text = delta === 0 ? '0' : `${direction === 'up' ? '↗' : '↘'} ${delta.toFixed(0)}`;

    return {
      polylinePoints: coords.join(' '),
      colorClass: direction === 'up' ? TREND_UP_CLASS : direction === 'down' ? TREND_DOWN_CLASS : TREND_FLAT_CLASS,
      trendText: text,
    };
  }, [height, lowerIsBetter, points, width]);

  if (points.length < 2) {
    return <span className="text-sm text-slate-400">{EMPTY_PLACEHOLDER}</span>;
  }

  return (
    <div className={`inline-flex items-center gap-2 ${className}`.trim()}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="trend-sparkline">
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          points={polylinePoints}
          className={colorClass}
          data-testid="sparkline-polyline"
        />
      </svg>
      <span className={`text-xs font-medium ${colorClass}`}>{trendText}</span>
    </div>
  );
}
