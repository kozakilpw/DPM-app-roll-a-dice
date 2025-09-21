/** Dokładne liczenie p-value (dwustronne) dla rozkładu dwumianowego.
 *  Używa log-kombinacji, by uniknąć przepełnień.
 *  n – liczba prób, k – liczba „orłów”, p – prawdopodobieństwo orła (u nas 0.5).
 */

function logFactorial(n: number): number {
  // sum_{i=1}^n log(i) – wystarczająco szybkie dla n do kilku tysięcy
  let s = 0;
  for (let i = 2; i <= n; i++) s += Math.log(i);
  return s;
}

function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

export function binomialPMF(n: number, k: number, p = 0.5): number {
  if (k < 0 || k > n) return 0;
  if (p === 0) return k === 0 ? 1 : 0;
  if (p === 1) return k === n ? 1 : 0;
  const logp = logChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p);
  return Math.exp(logp);
}

/** Dwustronne p-value: sumujemy prawdopodobieństwa wyników co najmniej tak
 *  „ekstremalnych” jak zaobserwowany k, tzn. tych, których PMF ≤ PMF(k).
 *  To standardowa dokładna definicja testu dwustronnego w dwumianie.
 */
export function binomialPValueTwoSided(n: number, k: number, p = 0.5): number {
  const pk = binomialPMF(n, k, p);
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const pi = binomialPMF(n, i, p);
    if (pi <= pk + 1e-15) s += pi;
  }
  // Korekta numeryczna (górna granica 1)
  return Math.min(1, s);
}

/** Pomocniczo: histogram liczby „orłów” (0..n) z wielu zgłoszeń. */
export function headsHistogram(headsCounts: number[], n = 20): number[] {
  const bins = Array(n + 1).fill(0);
  for (const h of headsCounts) {
    if (h >= 0 && h <= n) bins[h]++;
  }
  return bins;
}