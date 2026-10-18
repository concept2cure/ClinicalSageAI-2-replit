import * as O from './old.ts';
import * as N from './new.ts';
let seed = 4242;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const atoms = ['. ','? ','! ','.','\n','İ','ß','𐐀','\uD800','\uDC00','𝐀','-',' ','é','한','ไ','·','ǅ','ﬀ','０','Ａ','ⅷ'];
const words = ['abc','xab','abcx','anti-','anti-drug','-ab','𐐀ab','ab𐐀','İab','efficacy','preefficacy','ab-cd','한글','ไทย'];
const qwords = ['abc','anti-','efficacy','ab-cd','ab𐐀','İab','한글','ไทย','the','draft','12a'];
let diffs = 0, rel = 0, N_ = 0;
for (let iter = 0; iter < 30000; iter++) {
  let text = '';
  const len = 250 + Math.floor(rnd() * 2500);
  while (text.length < len) { text += rnd() < 0.15 ? pick(words) : pick(atoms); if (rnd() < 0.6) text += 'zz'.repeat(1 + Math.floor(rnd() * 20)) + pick([' ', '', '-']); }
  let q = '';
  const k = 1 + Math.floor(rnd() * 6);
  for (let i = 0; i < k; i++) q += pick(qwords) + pick([' ', '', '-', '𐐀', 'İ']);
  const size = 50 + Math.floor(rnd() * (text.length));
  const o = O.chooseSourceWindow(text, q, size), n = N.chooseSourceWindow(text, q, size);
  N_++; if (o.basis === 'relevant') rel++;
  if (JSON.stringify(o) !== JSON.stringify(n) || JSON.stringify(O.sectionTerms(q)) !== JSON.stringify(N.sectionTerms(q))) { diffs++; if (diffs < 4) console.log(JSON.stringify(q), o, n); }
}
console.log('cases', N_, 'relevant', rel, 'diffs', diffs);
