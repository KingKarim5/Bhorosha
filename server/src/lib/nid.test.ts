import { describe, it, expect } from 'vitest';
import { checkNid, nidType, normaliseNid, ageOn, namesMatch, maskNid, nidFingerprint } from './nid';

const good = { is_nid_card: true, name_en: 'Rahim Uddin', name_bn: null, father_name: null, mother_name: null, date_of_birth: '1990-03-12', nid_number: '1234567890', confidence: 0.92, tamper_signs: [] };

describe('NID checks', () => {
  it('reads Bangla digits and the three number shapes', () => {
    expect(normaliseNid('১২৩ ৪৫৬ ৭৮৯০')).toBe('1234567890');
    expect(nidType('1234567890')).toBe('smart_10');
    expect(nidType('1234567890123')).toBe('old_13');
    expect(nidType('19901234567890123')).toBe('old_17');
    expect(nidType('12345')).toBeNull();
  });
  it('passes a clean adult card whose name matches the account', () => {
    expect(checkNid(good, 'Rahim', '2026-11-20', false).pass).toBe(true);
  });
  it('fails on a 17-digit number whose birth year does not match', () => {
    const r = checkNid({ ...good, nid_number: '19851234567890123' }, 'Rahim', '2026-11-20', false);
    expect(r.checks.find((c) => c.key === 'number_vs_birth_year')!.pass).toBe(false);
  });
  it('fails a minor, a reused card, a name mismatch and signs of editing', () => {
    expect(checkNid({ ...good, date_of_birth: '2012-01-01' }, 'Rahim', '2026-11-20', false).pass).toBe(false);
    expect(checkNid(good, 'Rahim', '2026-11-20', true).pass).toBe(false);
    expect(checkNid(good, 'Karim Ali', '2026-11-20', false).pass).toBe(false);
    expect(checkNid({ ...good, tamper_signs: ['digits in a different font'] }, 'Rahim', '2026-11-20', false).pass).toBe(false);
  });
  it('computes age, matches names loosely, masks and fingerprints the number', () => {
    expect(ageOn('1990-03-12', '2026-03-11')).toBe(35);
    expect(namesMatch('MD. RAHIM UDDIN', 'Rahim (investor)')).toBe(true);
    expect(maskNid('1234567890')).toBe('••••••7890');
    expect(nidFingerprint('1234567890', 's')).toBe(nidFingerprint('1234567890', 's'));
    expect(nidFingerprint('1234567890', 's')).not.toBe(nidFingerprint('1234567891', 's'));
  });
});
