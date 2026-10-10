import { formatNaira } from '@infinity/core';

/**
 * Single-series bar chart rendered as server SVG. One colour (the brand gold), thin bars with rounded data ends,
 * recessive grid, selective labels, native tooltips, and a table view for screen readers.
 */
export function BarChart({ data, label, money = true, height = 220 }: {
  data: { key: string; label: string; value: number }[]; label: string; money?: boolean; height?: number;
}) {
  const W = 720;
  const pad = { l: 56, r: 8, t: 12, b: 28 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const nice = niceMax(max);
  const innerW = W - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const step = innerW / Math.max(1, data.length);
  const bar = Math.max(2, Math.min(18, step * 0.55));
  const fmt = (v: number) => (money ? formatNaira(v) : v.toLocaleString());
  const short = (v: number) => (money ? compactNaira(v) : String(v));
  const labelEvery = Math.ceil(data.length / 8);

  return (
    <figure className="w-full">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label} className="h-auto w-full">
        {[0, 0.5, 1].map((t) => {
          const y = pad.t + innerH * (1 - t);
          return (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="#E6E6E6" strokeWidth={1} />
              <text x={pad.l - 8} y={y + 4} textAnchor="end" fontSize={11} fill="#666666">{short(nice * t)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = (d.value / nice) * innerH;
          const x = pad.l + step * i + (step - bar) / 2;
          return (
            <g key={d.key}>
              <title>{`${d.label}: ${fmt(d.value)}`}</title>
              {/* hit area wider than the mark */}
              <rect x={pad.l + step * i} y={pad.t} width={step} height={innerH} fill="transparent" />
              {h > 0 ? <path d={roundedTop(x, pad.t + innerH - h, bar, h, Math.min(4, bar / 2))} fill="#A68917" /> : <rect x={x} y={pad.t + innerH - 1} width={bar} height={1} fill="#E6E6E6" />}
              {i % labelEvery === 0 ? <text x={x + bar / 2} y={height - 8} textAnchor="middle" fontSize={11} fill="#666666">{d.label}</text> : null}
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">{label}</figcaption>
      <details className="mt-2 text-xs text-grey-600">
        <summary className="cursor-pointer">View as table</summary>
        <table className="mt-2 w-full">
          <tbody>{data.map((d) => <tr key={d.key}><th scope="row" className="py-0.5 pr-4 text-left font-normal">{d.label}</th><td>{fmt(d.value)}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h);
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`;
}

function niceMax(v: number): number {
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

function compactNaira(kobo: number): string {
  const n = kobo / 100;
  if (n >= 1_000_000) return `₦${+(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${+(n / 1_000).toFixed(0)}k`;
  return `₦${n.toFixed(0)}`;
}

/** Horizontal ranking list with proportional bars (top treatments / products / branches). */
export function RankBars({ rows, money = true, unit }: { rows: { name: string; value: number; sub?: string }[]; money?: boolean; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-sm text-grey-600">No data for this period.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.name}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium">{r.name}</span>
            <span className="shrink-0 tabular-nums text-grey-600">{money ? formatNaira(r.value) : `${r.value.toLocaleString()}${unit ? ` ${unit}` : ''}`}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-grey-50" role="presentation">
            <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
          {r.sub ? <p className="mt-0.5 text-xs text-grey-600">{r.sub}</p> : null}
        </li>
      ))}
    </ul>
  );
}
