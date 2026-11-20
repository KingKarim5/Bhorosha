import fs from 'fs';
import path from 'path';

// Name and tagline live in ONE file: brand.config.json at the repo root (read by server and client).
const file = path.resolve(__dirname, '..', '..', 'brand.config.json');
export const BRAND: {
  name: string;
  nameBn: string;
  taglineEn: string;
  taglineBn: string;
  oneLineEn: string;
  oneLineBn: string;
  partner: string;
  team: string;
  teamPlace: string;
} = JSON.parse(fs.readFileSync(file, 'utf8'));

// Words that must never appear in generated or displayed text.
export const FORBIDDEN_WORDS = ['certificate', 'certified', 'guarantee', 'guaranteed', 'ensured', 'secured', 'approved by ai'];
