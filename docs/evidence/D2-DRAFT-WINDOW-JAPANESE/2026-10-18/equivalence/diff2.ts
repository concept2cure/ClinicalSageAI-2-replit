import * as O from './old.ts';
import * as N from './new.ts';
// Targeted: fullwidth ！ (not scx Han/Hira/Kana) in otherwise Japanese-free text
const filler = 'x'.repeat(1000);
const text = filler + ' wow！ efficacy endpoint met ' + 'y'.repeat(2000);
console.log('old', O.chooseSourceWindow(text, 'efficacy', 1000), 'new', N.chooseSourceWindow(text, 'efficacy', 1000));
// Larger fuzz: long texts so boundaryBefore has reach
let seed = 999;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const atoms = ['lorem ','ipsum ','. ','? ','! ','.','\n','İ','ß','𐐀','\uD800','\uDC00','𝐀','-',' ','é','한','ไ'];
const words = ['abc','xab','abcx','anti-','anti-drug','-ab','𐐀ab','ab𐐀','İab','efficacy','preefficacy'];
let diffs = 0;
for (let iter = 0; iter < 20000; iter++) {
  let text = '';
  const len = 300 + Math.floor(rnd() * 3000);
  while (text.length < len) text += rnd() < 0.1 ? pick(words) + ' ' : pick(atoms) + (rnd()<0.5?'zzzz ':'');
  let q = '';
  const ql = 1 + Math.floor(rnd() * 25);
  while (q.length < ql) q += rnd() < 0.5 ? pick(words) + ' ' : pick(atoms);
  const size = 1 + Math.floor(rnd() * (text.length + 3));
  const wo = JSON.stringify(O.chooseSourceWindow(text, q, size)), wn = JSON.stringify(N.chooseSourceWindow(text, q, size));
  if (wo !== wn) { diffs++; if (diffs < 5) console.log(wo, wn); }
}
console.log('long diffs', diffs);
