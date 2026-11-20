import { LenderSettings } from '../models';
import { RuleSettings } from '../lib/rules';
import { getActivePolicy, ruleSettingsFrom } from './policy';

// v2: rule thresholds come from the lender's versioned policy.
export async function getSettingsDoc() {
  let s = await LenderSettings.findOne();
  if (!s) s = await LenderSettings.create({});
  return s;
}

export async function getRuleSettings(lenderId: unknown): Promise<RuleSettings> {
  return ruleSettingsFrom(await getActivePolicy(lenderId));
}
