/**
 * Exact binomial helpers for the coin toss experiment.
 */

function logFactorial(n: number): number {
  let sum = 0;
  for (let i = 2; i <= n; i += 1) {
    sum += Math.log(i);
  }
  return sum;
}

function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) {
    return -Infinity;
  }
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

export function binomialPMF(n: number, k: number, p = 0.5): number {
  if (k < 0 || k > n) {
    return 0;
  }
  if (p === 0) {
    return k === 0 ? 1 : 0;
  }
  if (p === 1) {
    return k === n ? 1 : 0;
  }
  const logProbability = logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p);
  return Math.exp(logProbability);
}

/**
 * Two-sided p-value: sum probabilities for outcomes at least as extreme as k.
 */
export function binomialPValueTwoSided(n: number, k: number, p = 0.5): number {
  const pk = binomialPMF(n, k, p);
  let total = 0;
  for (let i = 0; i <= n; i += 1) {
    const probability = binomialPMF(n, i, p);
    if (probability <= pk + 1e-15) {
      total += probability;
    }
  }
  return Math.min(1, total);
}

/**
 * Histogram of heads counts (0..n) from many submissions.
 */
export function headsHistogram(headsCounts: number[], n = 20): number[] {
  const bins = Array.from({ length: n + 1 }, () => 0);
  for (const count of headsCounts) {
    if (count >= 0 && count <= n) {
      bins[count] += 1;
    }
  }
  return bins;
}