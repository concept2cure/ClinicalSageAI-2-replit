import * as O from './old.ts';
import * as N from './new.ts';
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
// alphabet: no Han/Hira/Kana by scx
const atoms = ['a','b','c','x','-','-',' ',' ','. ','? ','! ','.','?','!','\n','İ','ß','Σ','ς','1','2','é','́','𐐀','𐐨','\uD800','\uDC00','𝐀','й','Ж','ا','한','글','ไ','ท','!','！','？','·','A','B','C','ff','ﬀ','ǅ','İ','ẞ','ⅰ','Ⅷ','０','Ａ'];
const words = ['abc','xab','abcx','anti-','anti-drug','-ab','ab-','𐐀ab','ab𐐀','İab','straße','ǅab','ﬀab','한글말'];
let diffs = 0, n = 0;
for (let iter = 0; iter < 200000; iter++) {
  let text = '';
  const len = 5 + Math.floor(rnd() * 120);
  while (text.length < len) text += rnd() < 0.3 ? pick(words) : pick(atoms);
  let q = '';
  const ql = 1 + Math.floor(rnd() * 25);
  while (q.length < ql) q += rnd() < 0.5 ? pick(words) + ' ' : pick(atoms);
  const size = 1 + Math.floor(rnd() * (text.length + 3));
  const exclFW = !/[！？]/.test(text);
  const to = JSON.stringify(O.sectionTerms(q)), tn = JSON.stringify(N.sectionTerms(q));
  const wo = JSON.stringify(O.chooseSourceWindow(text, q, size)), wn = JSON.stringify(N.chooseSourceWindow(text, q, size));
  n++;
  if (to !== tn || wo !== wn) {
    diffs++;
    if (diffs <= 5 || (exclFW && diffs < 50)) console.log({ fw: !exclFW, text: JSON.stringify(text), q: JSON.stringify(q), size, to, tn, wo, wn });
  }
}
console.log('cases', n, 'diffs', diffs);
