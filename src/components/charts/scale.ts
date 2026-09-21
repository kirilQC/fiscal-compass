export interface Pad {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function domain(values: number[], min?: number, max?: number, padRatio = 0.06) {
  let lo = min ?? Math.min(...values);
  let hi = max ?? Math.max(...values);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const span = hi - lo;
  if (min === undefined) lo -= span * padRatio;
  if (max === undefined) hi += span * padRatio;
  return { lo, hi };
}

export function yScale(lo: number, hi: number, top: number, bottom: number) {
  return (v: number) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
}

export function xIndex(n: number, left: number, right: number) {
  return (i: number) => (n <= 1 ? left : left + (i / (n - 1)) * (right - left));
}

export function ticks(lo: number, hi: number, n: number) {
  if (n <= 1) return [hi];
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(lo + ((hi - lo) * i) / (n - 1));
  return out;
}

export const r1 = (n: number) => Math.round(n * 10) / 10;
