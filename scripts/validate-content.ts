/** Content validation: npm run validate. Exits non-zero on any registry problem or missed target. */
import { content, contentCounts, validateContent } from '../src/content/registry';

const c = content();
const errors = validateContent(c);
const n = contentCounts(c);
const targets: [keyof typeof n, number][] = [['weapons', 40], ['evolutions', 80], ['fusions', 20], ['enemies', 64], ['bosses', 8], ['biomes', 4], ['reactions', 45], ['classes', 6], ['passives', 24], ['relics', 24], ['encounters', 12]];
for (const [k, t] of targets) if (n[k] < t) errors.push(`target missed: ${k} ${n[k]}/${t}`);
console.log(Object.entries(n).map(([k, v]) => `${k}=${v}`).join('  '));
if (errors.length) { console.error('\n' + errors.map((e) => '✗ ' + e).join('\n')); process.exit(1); }
console.log('✓ content valid');
