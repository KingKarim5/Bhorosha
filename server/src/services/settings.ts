import { LenderSettings } from '../models';
import { DEFAULT_SETTINGS, RuleSettings } from '../lib/rules';

export async function getSettingsDoc() {
  let s = await LenderSettings.findOne();
  if (!s) s = await LenderSettings.create({});
  return s;
}

export async function getRuleSettings(): Promise<RuleSettings> {
  const s = await getSettingsDoc();
  return {
    ...DEFAULT_SETTINGS,
    household_mixing_pct: s.household_mixing_pct ?? DEFAULT_SETTINGS.household_mixing_pct,
    good_installment_to_margin: s.good_installment_to_margin ?? DEFAULT_SETTINGS.good_installment_to_margin,
    max_installment_to_margin: s.max_installment_to_margin ?? DEFAULT_SETTINGS.max_installment_to_margin,
    trend_drop_pct: s.trend_drop_pct ?? DEFAULT_SETTINGS.trend_drop_pct,
    viable_points: s.viable_points ?? DEFAULT_SETTINGS.viable_points,
    not_viable_points: s.not_viable_points ?? DEFAULT_SETTINGS.not_viable_points,
    min_coverage_pct: s.min_coverage_pct ?? DEFAULT_SETTINGS.min_coverage_pct,
  };
}
