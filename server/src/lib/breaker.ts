// Circuit-breaker rule (pure, testable): returns the reasons to pause, or [] when every limit holds.
export interface BreakerMetrics {
  recent: number; // decisions in the window
  holdRate: number;
  funded: number;
  calls: number;
  defaultRate: number;
}
export interface BreakerLimits {
  breaker_max_hold_rate: number;
  breaker_max_default_rate: number;
  breaker_min_decisions: number;
}

export function breakerReasons(m: BreakerMetrics, p: BreakerLimits): string[] {
  const reasons: string[] = [];
  if (m.recent >= p.breaker_min_decisions && m.holdRate > p.breaker_max_hold_rate)
    reasons.push(`hold rate ${(m.holdRate * 100).toFixed(0)}% over the last ${m.recent} decisions is above the limit of ${(p.breaker_max_hold_rate * 100).toFixed(0)}%`);
  if (m.funded >= 3 && m.defaultRate > p.breaker_max_default_rate)
    reasons.push(`simulated default rate ${(m.defaultRate * 100).toFixed(0)}% (${m.calls} of ${m.funded} funded loans at call level) is above the limit of ${(p.breaker_max_default_rate * 100).toFixed(0)}%`);
  return reasons;
}
