// Business-type seasonal profiles. Business type is used ONLY for seasonality (brief section 6).
// Each profile is 12 multipliers for calendar months Jan..Dec, normalised to mean 1.

const RAW: Record<string, number[]> = {
  flat: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  // Fish trade: lean in the dry winter months, peak in the monsoon catch season. About a 4x swing.
  fish_trader: [0.5, 0.5, 0.65, 0.8, 0.95, 1.3, 1.7, 1.9, 1.8, 1.4, 0.8, 0.55],
  // Knitwear: export orders build towards autumn/winter shipments.
  knitwear: [0.85, 0.8, 0.85, 0.9, 1.0, 1.1, 1.15, 1.2, 1.15, 1.05, 1.0, 0.95],
};

export const SEASONAL_TYPES = new Set(['fish_trader']);

function normalise(xs: number[]) {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.map((x) => x / m);
}

const PROFILES: Record<string, number[]> = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, normalise(v)]));

export function profileFor(businessType: string, seasonalStated = false): number[] {
  if (PROFILES[businessType]) return PROFILES[businessType];
  if (seasonalStated) return PROFILES.fish_trader; // fallback prior when the owner says seasonal but type is unknown
  return PROFILES.flat;
}

export function seasonalIndex(businessType: string, calMonth: number, seasonalStated = false) {
  return profileFor(businessType, seasonalStated)[calMonth - 1];
}

export function isSeasonal(businessType: string, seasonalStated = false) {
  return SEASONAL_TYPES.has(businessType) || seasonalStated;
}
