// Read-only current-selector probe; no provider, database, or filesystem writes.
import { chooseSourceWindow } from '../../../../server/services/ana/draft-source-window.ts';

const prefix = '背景情報。'.repeat(7500) + '\n';
const suffix = '\n' + '補足情報。'.repeat(1000);
const cases = [
  { label: 'embedded-Japanese', passage: '治療中の有害事象発現率は12％でした。', query: '有害事象' },
  { label: 'spaced-Japanese-control', passage: '有害事象 発現率は12％でした。', query: '有害事象' },
  { label: 'English-control', passage: 'Adverse event rate was 12%.', query: 'adverse event' },
];
process.stdout.write(JSON.stringify(cases.map(({ label, passage, query }) => {
  const text = prefix + passage + suffix;
  return { label, passageStart: prefix.length, literalOccurrence: text.toLowerCase().indexOf(query.toLowerCase()),
    window: chooseSourceWindow(text, query, 500) };
}), null, 2) + '\n');
