// Tiny stacked-area path builder for the fleet trend charts
// (docs/CONCEPT.md 2.2) — deliberately no charting library for two narrow
// SVG charts.

/** One closed SVG path per series, stacked bottom-to-top in series order. */
export function stackedAreaPaths(
  series: number[][],
  width: number,
  height: number,
): string[] {
  const n = series[0]?.length ?? 0;
  if (n === 0) return series.map(() => '');

  const totals = Array.from({ length: n }, (_, i) =>
    series.reduce((sum, values) => sum + (values[i] ?? 0), 0),
  );
  const max = Math.max(1, ...totals);
  const stepX = n > 1 ? width / (n - 1) : 0;
  const cumulative = new Array(n).fill(0);

  return series.map((values) => {
    const top: [number, number][] = [];
    const bottom: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const x = i * stepX;
      bottom.push([x, height - (cumulative[i]! / max) * height]);
      cumulative[i] += values[i] ?? 0;
      top.push([x, height - (cumulative[i]! / max) * height]);
    }
    const topPath = top.map(([x, y]) => `${x},${y}`).join(' L ');
    const bottomPath = bottom
      .slice()
      .reverse()
      .map(([x, y]) => `${x},${y}`)
      .join(' L ');
    return `M ${topPath} L ${bottomPath} Z`;
  });
}

/** A single unstacked line, for the compact dashboard sparkline. */
export function linePath(values: number[], width: number, height: number): string {
  if (values.length === 0) return '';
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((value, i) => `${i * stepX},${height - ((value - min) / range) * height}`)
    .join(' L ');
}
