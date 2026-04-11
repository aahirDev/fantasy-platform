import { useEffect, useRef, useState } from 'react';

interface CountdownRingProps {
  endsAt: number | null;   // epoch ms
  totalSeconds: number;
  size?: number;
  stroke?: number;
}

function getColor(fraction: number): string {
  if (fraction > 0.5) return '#22c55e';   // green
  if (fraction > 0.25) return '#f59e0b';  // amber
  return '#ef4444';                        // red
}

export function CountdownRing({
  endsAt,
  totalSeconds,
  size = 96,
  stroke = 8,
}: CountdownRingProps) {
  const [remaining, setRemaining] = useState(totalSeconds);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!endsAt) { setRemaining(0); return; }

    const tick = () => {
      const left = Math.max(0, (endsAt - Date.now()) / 1000);
      setRemaining(left);
      if (left > 0) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [endsAt]);

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = totalSeconds > 0 ? Math.min(remaining / totalSeconds, 1) : 0;
  const dashOffset = circumference * (1 - fraction);
  const color = getColor(fraction);
  const secs = Math.ceil(remaining);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={stroke}
        />
        {/* Progress */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: 'stroke-dashoffset 0.1s linear, stroke 0.3s ease' }}
        />
      </svg>
      <span
        className="absolute text-2xl font-bold tabular-nums"
        style={{ color, textShadow: `0 0 12px ${color}40` }}
      >
        {secs}
      </span>
    </div>
  );
}
