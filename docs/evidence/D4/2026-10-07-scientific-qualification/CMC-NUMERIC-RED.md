# CMC numeric qualification — RED execution output

Actual local output captured on 2026-10-07. Commands and limits are in
[CMC-NUMERIC-RESULTS.md](CMC-NUMERIC-RESULTS.md). Core RED ran before production
changes; later RED controls preceded their corresponding approved fixes.
Compatibility REDs caught regressions in the proposed guard during review.

## Core numeric boundary, before production edits: 72 failed / 24 passed (96)

```text
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

 RUN  v4.1.7 /workspace/scratch/bd36ee581acd/concept2cure

 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value 0 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value -0.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value " +98.4 % " 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "-.5" 7ms
   → expected 5 to be -0.5 // Object.is equality
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value ".5" 1ms
   → expected 5 to be 0.5 // Object.is equality
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "12." 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "1e-05" 1ms
   → expected 1 to be 0.00001 // Object.is equality
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "-1.25E+2" 1ms
   → expected -1.25 to be -125 // Object.is equality
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "1e-05 %" 1ms
   → expected 1 to be 0.00001 // Object.is equality
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "0e-999" 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "5e-324" 1ms
   → expected 5 to be 5e-324 // Object.is equality
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "<0.1%" 1ms
   → expected 0.1 to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "≤0.1%" 0ms
   → expected 0.1 to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value ">95" 1ms
   → expected 95 to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "NMT 0.1%" 1ms
   → expected 0.1 to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "BLQ" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "ND" 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1,000" 0ms
   → expected 1 to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1 000" 0ms
   → expected 1 to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1_000" 0ms
   → expected 1 to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12abc" 0ms
   → expected 12 to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1.2.3" 1ms
   → expected 1.2 to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12 mg" 0ms
   → expected 12 to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e" 1ms
   → expected 1 to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e+" 0ms
   → expected 1 to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e309" 1ms
   → expected 1 to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e-999" 1ms
   → expected 1 to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "NaN" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "Infinity" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value " " 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value undefined 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value true 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value false 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value 12 0ms
   → expected 12 to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value {"value":12} 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value {} 0ms
   → expected 12 to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "0x10" 0ms
   → expected +0 to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12%%" 1ms
   → expected 12 to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12 months" 0ms
   → expected 12 to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time 6 4ms
   → expected [ { time: 6, value: 99.5 } ] to match object { ok: true, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6" 1ms
   → expected [ { time: 6, value: 99.5 } ] to match object { ok: true, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "+6.0" 1ms
   → expected [ { time: 6, value: 99.5 } ] to match object { ok: true, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6e0" 1ms
   → expected [ { time: 6, value: 99.5 } ] to match object { ok: true, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6M" 1ms
   → expected [ { time: 6, value: 99.5 } ] to match object { ok: true, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 mo" 1ms
   → expected [ { time: 6, value: 99.5 } ] to match object { ok: true, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 mos" 1ms
   → expected [ { time: 6, value: 99.5 } ] to match object { ok: true, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 month" 1ms
   → expected [ { time: 6, value: 99.5 } ] to match object { ok: true, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 months" 1ms
   → expected [ { time: 6, value: 99.5 } ] to match object { ok: true, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "Month 6" 1ms
   → expected [ { time: 6, value: 99.5 } ] to match object { ok: true, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "Month6" 1ms
   → expected [ { time: 6, value: 99.5 } ] to match object { ok: true, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "MONTHS 6" 1ms
   → expected [ { time: 6, value: 99.5 } ] to match object { ok: true, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is -1 2ms
   → expected [ { time: -1, value: 99.5 } ] to match object { ok: false, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "-1 months" 1ms
   → expected [ { time: -1, value: 99.5 } ] to match object { ok: false, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6 days" 1ms
   → expected [ { time: 6, value: 99.5 } ] to match object { ok: false, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "Week 6" 1ms
   → expected [ { time: 6, value: 99.5 } ] to match object { ok: false, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "1 year" 7ms
   → expected [ { time: 1, value: 99.5 } ] to match object { ok: false, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6%" 1ms
   → expected [ { time: 6, value: 99.5 } ] to match object { ok: false, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6 months 2 days" 1ms
   → expected [ { time: 6, value: 99.5 } ] to match object { ok: false, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6abc" 1ms
   → expected [ { time: 6, value: 99.5 } ] to match object { ok: false, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "<6" 1ms
   → expected [ { time: 6, value: 99.5 } ] to match object { ok: false, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is null 1ms
   → expected [] to match object { ok: false, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is undefined 1ms
   → expected [] to match object { ok: false, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "" 0ms
   → expected [] to match object { ok: false, …(2) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > keeps genuine missing results separate and leaves every raw record unchanged 1ms
   → expected [ { time: +0, value: 100.03 }, …(6) ] to match object { ok: true, pointsUsable: 7 }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e-4 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1E+4 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e+ 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1,000 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1_000 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1 000 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1.2.3 1ms
   → expected { limit: 1.2, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= .5 0ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NLT -5.0 °C 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion <= 2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion 95.0-105.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion 95.0 to 105.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion maximum 2.0 EU/mL 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for <0.1% despite sufficient other points 5ms
   → expected { parameter: 'Assay', …(15) } to match object { estimable: false, …(3) }
(24 matching properties omitted from actual)
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 1,000 despite sufficient other points 2ms
   → expected { parameter: 'Assay', …(15) } to match object { estimable: false, …(3) }
(24 matching properties omitted from actual)
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 12abc despite sufficient other points 2ms
   → expected { parameter: 'Assay', …(15) } to match object { estimable: false, …(3) }
(24 matching properties omitted from actual)
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for BLQ despite sufficient other points 2ms
   → expected { parameter: 'Assay', …(15) } to match object { estimable: false, …(3) }
(24 matching properties omitted from actual)
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > retains an independent valid series but withholds an incomplete programme shelf life 2ms
   → expected [ true, true ] to deeply equal [ false, true ]
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > uses exponent results and month labels identically to the equivalent numeric observations 2ms
   → expected { ok: true, …(1) } to deeply equal { ok: true, …(1) }
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > does not discard a present result with an absent time while fitting the other six 1ms
   → expected { parameter: 'Assay', …(15) } to match object { estimable: false, …(1) }
(24 matching properties omitted from actual)
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses unsupported criterion notation even after valid criteria in every fitted path 2ms
   → expected { parameter: 'Assay', …(15) } to match object { estimable: false, …(1) }
(24 matching properties omitted from actual)
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains <0.1% raw, without presenting an exact conformance or trend 19ms
   → expected [ 'LT', '—', 'Assay', '9', …(3) ] to include 'not compared'
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 1,000 raw, without presenting an exact conformance or trend 1ms
   → expected [ 'LT', '—', 'Assay', '9', …(3) ] to include 'not compared'
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 12abc raw, without presenting an exact conformance or trend 1ms
   → expected [ 'LT', '—', 'Assay', '9', …(3) ] to include 'not compared'
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > compares an exact exponent result at its real magnitude 1ms
   → expected [ '—', '—', 'Impurity', '6M', …(3) ] to include 'within'
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > does not compare a supported result against an unsupported exponent criterion 1ms
   → expected [ '—', '—', 'Impurity', '6', …(3) ] to include 'no criterion recorded'

⎯⎯⎯⎯⎯⎯ Failed Tests 72 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "-.5"
AssertionError: expected 5 to be -0.5 // Object.is equality

- Expected
+ Received

- -0.5
+ 5

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:32:33
     30|     ['0e-999', 0], ['5e-324', Number.MIN_VALUE],
     31|   ])('reads the complete finite value %j', (input, expected) => {
     32|     expect(parseNumeric(input)).toBe(expected);
       |                                 ^
     33|   });
     34|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value ".5"
AssertionError: expected 5 to be 0.5 // Object.is equality

- Expected
+ Received

- 0.5
+ 5

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:32:33
     30|     ['0e-999', 0], ['5e-324', Number.MIN_VALUE],
     31|   ])('reads the complete finite value %j', (input, expected) => {
     32|     expect(parseNumeric(input)).toBe(expected);
       |                                 ^
     33|   });
     34|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "1e-05"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "1e-05 %"
AssertionError: expected 1 to be 0.00001 // Object.is equality

- Expected
+ Received

- 0.00001
+ 1

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:32:33
     30|     ['0e-999', 0], ['5e-324', Number.MIN_VALUE],
     31|   ])('reads the complete finite value %j', (input, expected) => {
     32|     expect(parseNumeric(input)).toBe(expected);
       |                                 ^
     33|   });
     34|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "-1.25E+2"
AssertionError: expected -1.25 to be -125 // Object.is equality

- Expected
+ Received

- -125
+ -1.25

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:32:33
     30|     ['0e-999', 0], ['5e-324', Number.MIN_VALUE],
     31|   ])('reads the complete finite value %j', (input, expected) => {
     32|     expect(parseNumeric(input)).toBe(expected);
       |                                 ^
     33|   });
     34|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "5e-324"
AssertionError: expected 5 to be 5e-324 // Object.is equality

- Expected
+ Received

- 5e-324
+ 5

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:32:33
     30|     ['0e-999', 0], ['5e-324', Number.MIN_VALUE],
     31|   ])('reads the complete finite value %j', (input, expected) => {
     32|     expect(parseNumeric(input)).toBe(expected);
       |                                 ^
     33|   });
     34|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "<0.1%"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "≤0.1%"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "NMT 0.1%"
AssertionError: expected 0.1 to be null

- Expected:
null

+ Received:
0.1

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:41:33
     39|     NaN, Infinity, '0x10', '12%%', '12 months',
     40|   ])('refuses an inexact or unsupported value %j', (input) => {
     41|     expect(parseNumeric(input)).toBeNull();
       |                                 ^
     42|   });
     43|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value ">95"
AssertionError: expected 95 to be null

- Expected:
null

+ Received:
95

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:41:33
     39|     NaN, Infinity, '0x10', '12%%', '12 months',
     40|   ])('refuses an inexact or unsupported value %j', (input) => {
     41|     expect(parseNumeric(input)).toBeNull();
       |                                 ^
     42|   });
     43|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1,000"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1 000"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1_000"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e+"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e309"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e-999"
AssertionError: expected 1 to be null

- Expected:
null

+ Received:
1

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:41:33
     39|     NaN, Infinity, '0x10', '12%%', '12 months',
     40|   ])('refuses an inexact or unsupported value %j', (input) => {
     41|     expect(parseNumeric(input)).toBeNull();
       |                                 ^
     42|   });
     43|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12abc"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12 mg"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value 12
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value {}
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12%%"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12 months"
AssertionError: expected 12 to be null

- Expected:
null

+ Received:
12

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:41:33
     39|     NaN, Infinity, '0x10', '12%%', '12 months',
     40|   ])('refuses an inexact or unsupported value %j', (input) => {
     41|     expect(parseNumeric(input)).toBeNull();
       |                                 ^
     42|   });
     43|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1.2.3"
AssertionError: expected 1.2 to be null

- Expected:
null

+ Received:
1.2

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:41:33
     39|     NaN, Infinity, '0x10', '12%%', '12 months',
     40|   ])('refuses an inexact or unsupported value %j', (input) => {
     41|     expect(parseNumeric(input)).toBeNull();
       |                                 ^
     42|   });
     43|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "0x10"
AssertionError: expected +0 to be null

- Expected:
null

+ Received:
0

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:41:33
     39|     NaN, Infinity, '0x10', '12%%', '12 months',
     40|   ])('refuses an inexact or unsupported value %j', (input) => {
     41|     expect(parseNumeric(input)).toBeNull();
       |                                 ^
     42|   });
     43|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[11/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time 6
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "+6.0"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6e0"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6M"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 mo"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 mos"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 month"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 months"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "Month 6"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "Month6"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "MONTHS 6"
AssertionError: expected [ { time: 6, value: 99.5 } ] to match object { ok: true, …(2) }

- Expected:
{
  "ok": true,
  "points": [
    {
      "time": 6,
      "value": 99.5,
    },
  ],
  "pointsUsable": 1,
}

+ Received:
[
  {
    "time": 6,
    "value": 99.5,
  },
]

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:45:61
     43|
     44|   it.each([6, '6', '+6.0', '6e0', '6M', '6 mo', '6 mos', '6 month', '6…
     45|     expect(numericSeries([{ timePoint, result: '99.5%' }])).toMatchObj…
       |                                                             ^
     46|       ok: true, points: [{ time: 6, value: 99.5 }], pointsUsable: 1,
     47|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[12/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is -1
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "-1 months"
AssertionError: expected [ { time: -1, value: 99.5 } ] to match object { ok: false, …(2) }

- Expected:
{
  "issues": [
    {
      "field": "timePoint",
      "row": 1,
    },
  ],
  "ok": false,
  "pointsUsable": 0,
}

+ Received:
[
  {
    "time": -1,
    "value": 99.5,
  },
]

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:51:61
     49|
     50|   it.each([-1, '-1 months', '6 days', 'Week 6', '1 year', '6%', '6 mon…
     51|     expect(numericSeries([{ timePoint, result: '99.5%' }])).toMatchObj…
       |                                                             ^
     52|       ok: false, issues: [{ row: 1, field: 'timePoint' }], pointsUsabl…
     53|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[13/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6 days"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "Week 6"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6%"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6 months 2 days"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6abc"
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "<6"
AssertionError: expected [ { time: 6, value: 99.5 } ] to match object { ok: false, …(2) }

- Expected:
{
  "issues": [
    {
      "field": "timePoint",
      "row": 1,
    },
  ],
  "ok": false,
  "pointsUsable": 0,
}

+ Received:
[
  {
    "time": 6,
    "value": 99.5,
  },
]

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:51:61
     49|
     50|   it.each([-1, '-1 months', '6 days', 'Week 6', '1 year', '6%', '6 mon…
     51|     expect(numericSeries([{ timePoint, result: '99.5%' }])).toMatchObj…
       |                                                             ^
     52|       ok: false, issues: [{ row: 1, field: 'timePoint' }], pointsUsabl…
     53|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[14/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "1 year"
AssertionError: expected [ { time: 1, value: 99.5 } ] to match object { ok: false, …(2) }

- Expected:
{
  "issues": [
    {
      "field": "timePoint",
      "row": 1,
    },
  ],
  "ok": false,
  "pointsUsable": 0,
}

+ Received:
[
  {
    "time": 1,
    "value": 99.5,
  },
]

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:51:61
     49|
     50|   it.each([-1, '-1 months', '6 days', 'Week 6', '1 year', '6%', '6 mon…
     51|     expect(numericSeries([{ timePoint, result: '99.5%' }])).toMatchObj…
       |                                                             ^
     52|       ok: false, issues: [{ row: 1, field: 'timePoint' }], pointsUsabl…
     53|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[15/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is null
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is undefined
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is ""
AssertionError: expected [] to match object { ok: false, …(2) }

- Expected:
{
  "issues": [
    {
      "field": "timePoint",
      "row": 1,
    },
  ],
  "ok": false,
  "pointsUsable": 0,
}

+ Received:
[]

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:51:61
     49|
     50|   it.each([-1, '-1 months', '6 days', 'Week 6', '1 year', '6%', '6 mon…
     51|     expect(numericSeries([{ timePoint, result: '99.5%' }])).toMatchObj…
       |                                                             ^
     52|       ok: false, issues: [{ row: 1, field: 'timePoint' }], pointsUsabl…
     53|     });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[16/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > keeps genuine missing results separate and leaves every raw record unchanged
AssertionError: expected [ { time: +0, value: 100.03 }, …(6) ] to match object { ok: true, pointsUsable: 7 }

- Expected:
{
  "ok": true,
  "pointsUsable": 7,
}

+ Received:
[
  {
    "time": 0,
    "value": 100.03,
  },
  {
    "time": 3,
    "value": 99.68,
  },
  {
    "time": 6,
    "value": 99.41000000000001,
  },
  {
    "time": 9,
    "value": 99.07,
  },
  {
    "time": 12,
    "value": 98.82,
  },
  {
    "time": 18,
    "value": 98.19,
  },
  {
    "time": 24,
    "value": 97.61999999999999,
  },
]

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:59:33
     57|     const data = [...points(), ...[null, undefined, '', ' '].map(resul…
     58|     const original = structuredClone(data);
     59|     expect(numericSeries(data)).toMatchObject({ ok: true, pointsUsable…
       |                                 ^
     60|     expect(data).toEqual(original);
     61|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[17/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e-4
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1E+4
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e+
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1,000
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1_000
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1 000
AssertionError: expected { limit: 1, …(3) } to be null

- Expected:
null

+ Received:
{
  "direction": "increasing",
  "limit": 1,
  "twoSided": false,
  "upperLimit": null,
}

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:66:51
     64| describe('unsupported criterion numeric notation is refused before cho…
     65|   it.each(['<= 1e-4', '<= 1E+4', '<= 1e', '<= 1e+', '<= 1,000', '<= 1_…
     66|     expect(parseAcceptanceCriterion([criterion])).toBeNull();
       |                                                   ^
     67|     expect(parseAcceptanceCriterion(['<= 2.0%', criterion])).toBeNull(…
     68|     expect(parseAcceptanceCriterion([criterion, '<= 2.0%'])).toBeNull(…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[18/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1.2.3
AssertionError: expected { limit: 1.2, …(3) } to be null

- Expected:
null

+ Received:
{
  "direction": "increasing",
  "limit": 1.2,
  "twoSided": false,
  "upperLimit": null,
}

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:66:51
     64| describe('unsupported criterion numeric notation is refused before cho…
     65|   it.each(['<= 1e-4', '<= 1E+4', '<= 1e', '<= 1e+', '<= 1,000', '<= 1_…
     66|     expect(parseAcceptanceCriterion([criterion])).toBeNull();
       |                                                   ^
     67|     expect(parseAcceptanceCriterion(['<= 2.0%', criterion])).toBeNull(…
     68|     expect(parseAcceptanceCriterion([criterion, '<= 2.0%'])).toBeNull(…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[19/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= .5
AssertionError: expected { limit: 5, …(3) } to be null

- Expected:
null

+ Received:
{
  "direction": "increasing",
  "limit": 5,
  "twoSided": false,
  "upperLimit": null,
}

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:66:51
     64| describe('unsupported criterion numeric notation is refused before cho…
     65|   it.each(['<= 1e-4', '<= 1E+4', '<= 1e', '<= 1e+', '<= 1,000', '<= 1_…
     66|     expect(parseAcceptanceCriterion([criterion])).toBeNull();
       |                                                   ^
     67|     expect(parseAcceptanceCriterion(['<= 2.0%', criterion])).toBeNull(…
     68|     expect(parseAcceptanceCriterion([criterion, '<= 2.0%'])).toBeNull(…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[20/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for <0.1% despite sufficient other points
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 1,000 despite sufficient other points
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 12abc despite sufficient other points
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for BLQ despite sufficient other points
AssertionError: expected { parameter: 'Assay', …(15) } to match object { estimable: false, …(3) }
(24 matching properties omitted from actual)

- Expected
+ Received

  {
-   "estimable": false,
-   "pointsRecorded": 7,
-   "pointsUsable": 6,
-   "reason": StringMatching /row 4.*result.*clarif/i,
+   "estimable": true,
  }

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:83:37
     81|     const shelf = await estimateRecordedShelfLife(study(1, data));
     82|     if (!shelf.ok) throw new Error(shelf.error);
     83|     expect(shelf.data.estimates[0]).toMatchObject({ estimable: false, …
       |                                     ^
     84|     expect(shelf.data.supportedShelfLife).toBeNull();
     85|     const trend = assessRecordedTrending(study(1, data));

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[21/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > retains an independent valid series but withholds an incomplete programme shelf life
AssertionError: expected [ true, true ] to deeply equal [ false, true ]

- Expected
+ Received

  [
-   false,
+   true,
    true,
  ]

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:101:56
     99|     const shelf = await estimateRecordedShelfLife(study(1, data));
    100|     if (!shelf.ok) throw new Error(shelf.error);
    101|     expect(shelf.data.estimates.map(e => e.estimable)).toEqual([false,…
       |                                                        ^
    102|     expect(shelf.data.supportedShelfLife).toBeNull();
    103|     expect(shelf.data.limitingParameter).toBeNull();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[22/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > uses exponent results and month labels identically to the equivalent numeric observations
AssertionError: expected { ok: true, …(1) } to deeply equal { ok: true, …(1) }

- Expected
+ Received

@@ -2,40 +2,40 @@
    "data": {
      "basis": "ICH Q1E — ordinary least squares, one-sided 95% mean confidence limit vs the specification limit",
      "batchNumber": "B1",
      "estimates": [
        {
-         "cappedByExtrapolationLimit": true,
+         "cappedByExtrapolationLimit": false,
          "condition": "25°C/60%RH",
          "confidence": {
            "alpha": 0.05,
            "bound": "lower",
            "tQuantile": 2.015,
          },
          "direction": "decreasing",
          "estimable": true,
          "exceedsEvaluatedRange": false,
          "extrapolationLimit": 36,
-         "nominalCrossing": 50.09,
+         "nominalCrossing": null,
          "notes": [
            "ICH Q1E single-batch/attribute estimate using the 95% one-sided mean confidence limit. No multi-batch poolability (ANCOVA) performed.",
-           "The 95% confidence limit crosses the specification at 49.12, beyond what ICH Q1E permits to be extrapolated from 24 months of data — up to twice, and not more than twelve months beyond, the observed period. The supportable period is 36; extending it requires longer-term data, not a longer regression.",
+           "The confidence limit is already at/over the specification at t=0 — no shelf life can be supported from these data.",
          ],
          "observedPeriod": 24,
          "parameter": "Assay",
          "pointsUsed": 7,
          "regression": {
            "df": 5,
-           "intercept": 100.0013,
+           "intercept": 6.4961,
            "n": 7,
-           "r2": 0.9993,
-           "residualSd": 0.025,
-           "slope": -0.0999,
+           "r2": 0.2686,
+           "residualSd": 3.1449,
+           "slope": 0.2056,
          },
-         "shelfLife": 36,
+         "shelfLife": 0,
          "specLimit": 95,
-         "statisticalCrossing": 49.12,
+         "statisticalCrossing": 0,
        },
      ],
      "limitingParameter": "Assay",
      "maxTimeEvaluated": 120,
      "productName": "Product",
@@ -43,9 +43,9 @@
      "storageConditions": [
        "25°C/60%RH",
      ],
      "studyId": 1,
      "studyTitle": "Study 1",
-     "supportedShelfLife": 36,
+     "supportedShelfLife": 0,
    },
    "ok": true,
  }

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:118:15
    116|     const a = await estimateRecordedShelfLife(study(1, plain));
    117|     const b = await estimateRecordedShelfLife(study(1, labelled));
    118|     expect(b).toEqual(a);
       |               ^
    119|     expect(assessRecordedTrending(study(1, labelled))).toEqual(assessR…
    120|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[23/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > does not discard a present result with an absent time while fitting the other six
AssertionError: expected { parameter: 'Assay', …(15) } to match object { estimable: false, …(1) }
(24 matching properties omitted from actual)

- Expected
+ Received

  {
-   "estimable": false,
-   "reason": StringMatching /timePoint/,
+   "estimable": true,
  }

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:127:37
    125|     const shelf = await estimateRecordedShelfLife(study(1, data));
    126|     if (!shelf.ok) throw new Error(shelf.error);
    127|     expect(shelf.data.estimates[0]).toMatchObject({ estimable: false, …
       |                                     ^
    128|     const trend = assessRecordedTrending(study(1, data));
    129|     if (!trend.ok) throw new Error(trend.error);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[24/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses unsupported criterion notation even after valid criteria in every fitted path
AssertionError: expected { parameter: 'Assay', …(15) } to match object { estimable: false, …(1) }
(24 matching properties omitted from actual)

- Expected
+ Received

  {
-   "estimable": false,
-   "reason": StringMatching /criterion.*clarif/i,
+   "estimable": true,
  }

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:138:37
    136|     const shelf = await estimateRecordedShelfLife(study(1, data));
    137|     if (!shelf.ok) throw new Error(shelf.error);
    138|     expect(shelf.data.estimates[0]).toMatchObject({ estimable: false, …
       |                                     ^
    139|     expect(shelf.data.supportedShelfLife).toBeNull();
    140|     const trend = assessRecordedTrending(study(1, data));

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[25/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains <0.1% raw, without presenting an exact conformance or trend
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 1,000 raw, without presenting an exact conformance or trend
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 12abc raw, without presenting an exact conformance or trend
AssertionError: expected [ 'LT', '—', 'Assay', '9', …(3) ] to include 'not compared'
 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:156:52
    154|     const section = composeModule3FromCanonicalSources([source('stabil…
    155|     const rows = section.tables.find(t => /Stability Results/.test(t.t…
    156|     expect(rows.find(row => row.includes(result))).toContain('not comp…
       |                                                    ^
    157|     expect(section.narrativeDraft).toMatch(/trend not assessed:.*clari…
    158|     expect(section.narrativeDraft).not.toMatch(/no out-of-trend points…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[26/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > compares an exact exponent result at its real magnitude
AssertionError: expected [ '—', '—', 'Impurity', '6M', …(3) ] to include 'within'
 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:166:82


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[27/72]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > does not compare a supported result against an unsupported exponent criterion
AssertionError: expected [ '—', '—', 'Impurity', '6', …(3) ] to include 'no criterion recorded'
 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:173:82


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[28/72]⎯


 Test Files  1 failed (1)
      Tests  72 failed | 24 passed (96)
   Start at  05:24:23
   Duration  1.20s (transform 441ms, setup 95ms, import 446ms, tests 108ms, environment 0ms)


```

## Conformance narrative, before its fix: 4 failed / 92 passed (96)

```text
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

 RUN  v4.1.7 /workspace/scratch/bd36ee581acd/concept2cure

 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value 0 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value -0.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value " +98.4 % " 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "-.5" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value ".5" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "12." 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "1e-05" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "-1.25E+2" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "1e-05 %" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "0e-999" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "5e-324" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "<0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "≤0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value ">95" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "NMT 0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "BLQ" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "ND" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1,000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1 000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1_000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12abc" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1.2.3" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12 mg" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e+" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e309" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e-999" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "NaN" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "Infinity" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value " " 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value undefined 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value true 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value false 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value 12 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value {"value":12} 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value {} 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "0x10" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12%%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time 6 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6" 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "+6.0" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6e0" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6M" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 mo" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 mos" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 month" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "Month 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "Month6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "MONTHS 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is -1 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "-1 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6 days" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "Week 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "1 year" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6 months 2 days" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6abc" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "<6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is undefined 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > keeps genuine missing results separate and leaves every raw record unchanged 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1E+4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e+ 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= .5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NLT -5.0 °C 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion <= 2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion 95.0-105.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion 95.0 to 105.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion maximum 2.0 EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for <0.1% despite sufficient other points 25ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 1,000 despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 12abc despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for BLQ despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > retains an independent valid series but withholds an incomplete programme shelf life 8ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > uses exponent results and month labels identically to the equivalent numeric observations 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > does not discard a present result with an absent time while fitting the other six 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses unsupported criterion notation even after valid criteria in every fitted path 1ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains <0.1% raw, without presenting an exact conformance or trend 15ms
   → expected 'Stability studies for the drug substa…' to match /1 recorded result\(s\).*usable.*not …/i
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 1,000 raw, without presenting an exact conformance or trend 1ms
   → expected 'Stability studies for the drug substa…' to match /1 recorded result\(s\).*usable.*not …/i
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 12abc raw, without presenting an exact conformance or trend 1ms
   → expected 'Stability studies for the drug substa…' to match /1 recorded result\(s\).*usable.*not …/i
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > compares an exact exponent result at its real magnitude 2ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > does not compare a supported result against an unsupported exponent criterion 1ms
   → expected 'Stability studies for the drug substa…' not to match /carry no recorded acceptance criterion/

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains <0.1% raw, without presenting an exact conformance or trend
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 1,000 raw, without presenting an exact conformance or trend
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 12abc raw, without presenting an exact conformance or trend
AssertionError: expected 'Stability studies for the drug substa…' to match /1 recorded result\(s\).*usable.*not …/i

- Expected:
/1 recorded result\(s\).*usable.*not compared/i

+ Received:
"Stability studies for the drug substance were conducted under [condition not specified] . The 7 recorded result(s) are tabulated in the stability results table. All 6 recorded result(s) carrying an acceptance criterion are within their recorded acceptance criteria at the reported time points, supporting stability of the drug substance under the proposed storage conditions. Out-of-trend assessment (PhRMA CMC Statistics regression control chart: each pull point against the two-sided 95% prediction interval of the line fitted to all prior points): Assay: trend not assessed: Recorded observation(s) at row 4 (result) cannot be read as exact finite results at nonnegative month times. Clarify the recorded values, units, and intended handling before fitting; no affected series was fitted.."

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:159:36


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > does not compare a supported result against an unsupported exponent criterion
AssertionError: expected 'Stability studies for the drug substa…' not to match /carry no recorded acceptance criterion/

- Expected:
/carry no recorded acceptance criterion/

+ Received:
"Stability studies for the drug substance were conducted under [condition not specified] . The 1 recorded result(s) are tabulated in the stability results table. 1 recorded result(s) carry no recorded acceptance criterion, so whether they conform is NOT verified by this section. Any conclusion stated on the study is the applicant's and was not checked against the data here. Out-of-trend assessment (PhRMA CMC Statistics regression control chart: each pull point against the two-sided 95% prediction interval of the line fitted to all prior points): Impurity: trend not assessed: A recorded acceptance criterion contains unsupported numeric notation. Clarify the criterion in its supported decimal form before comparison or fitting; no limit was inferred.."

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:178:40


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯


 Test Files  1 failed (1)
      Tests  4 failed | 92 passed (96)
   Start at  05:25:43
   Duration  965ms (transform 495ms, setup 82ms, import 473ms, tests 79ms, environment 0ms)


```

## Missing counts, unreadable payload and invalid time, before their fixes: 3 failed / 96 passed (99)

```text
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

 RUN  v4.1.7 /workspace/scratch/bd36ee581acd/concept2cure

 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value 0 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value -0.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value " +98.4 % " 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "-.5" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value ".5" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "12." 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "1e-05" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "-1.25E+2" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "1e-05 %" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "0e-999" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "5e-324" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "<0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "≤0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value ">95" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "NMT 0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "BLQ" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "ND" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1,000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1 000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1_000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12abc" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1.2.3" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12 mg" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e+" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e309" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e-999" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "NaN" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "Infinity" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value " " 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value undefined 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value true 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value false 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value 12 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value {"value":12} 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value {} 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "0x10" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12%%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time 6 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "+6.0" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6e0" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6M" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 mo" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 mos" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 month" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "Month 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "Month6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "MONTHS 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is -1 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "-1 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6 days" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "Week 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "1 year" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6 months 2 days" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6abc" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "<6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is undefined 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > keeps genuine missing results separate and leaves every raw record unchanged 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1E+4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e+ 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= .5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NLT -5.0 °C 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion <= 2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion 95.0-105.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion 95.0 to 105.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion maximum 2.0 EU/mL 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for <0.1% despite sufficient other points 24ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 1,000 despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 12abc despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for BLQ despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > retains an independent valid series but withholds an incomplete programme shelf life 6ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > uses exponent results and month labels identically to the equivalent numeric observations 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > does not discard a present result with an absent time while fitting the other six 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses unsupported criterion notation even after valid criteria in every fitted path 1ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > retains genuine missing results in recorded counts while allowing the complete observations to fit 9ms
   → expected { parameter: 'Assay', …(15) } to match object { estimable: true, …(3) }
(23 matching properties omitted from actual)
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains <0.1% raw, without presenting an exact conformance or trend 13ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 1,000 raw, without presenting an exact conformance or trend 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 12abc raw, without presenting an exact conformance or trend 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > compares an exact exponent result at its real magnitude 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > does not compare a supported result against an unsupported exponent criterion 1ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > reports readable comparisons but withholds stability support when another recorded payload is unreadable 2ms
   → expected 'Stability studies for the drug substa…' not to match /supporting stability of/
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > preserves value comparisons but withholds stability support for an unresolved measured observation time 1ms
   → expected 'Stability studies for the drug substa…' not to match /supporting stability of/

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > retains genuine missing results in recorded counts while allowing the complete observations to fit
AssertionError: expected { parameter: 'Assay', …(15) } to match object { estimable: true, …(3) }
(23 matching properties omitted from actual)

- Expected
+ Received

  {
    "estimable": true,
-   "pointsRecorded": 8,
-   "pointsUsable": 7,
    "pointsUsed": 7,
  }

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:153:37
    151|     const shelf = await estimateRecordedShelfLife(study(1, data));
    152|     if (!shelf.ok) throw new Error(shelf.error);
    153|     expect(shelf.data.estimates[0]).toMatchObject({ estimable: true, p…
       |                                     ^
    154|     const pooled = await assessRecordedPoolability([study(1, data), st…
    155|     if (!pooled.ok) throw new Error(pooled.error);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > reports readable comparisons but withholds stability support when another recorded payload is unreadable
AssertionError: expected 'Stability studies for the drug substa…' not to match /supporting stability of/

- Expected:
/supporting stability of/

+ Received:
"Stability studies for the drug substance were conducted under [condition not specified] . The 7 recorded result(s) are tabulated in the stability results table. All 7 recorded result(s) compared here are within their recorded acceptance criteria at the reported time points, supporting stability of the drug substance under the proposed storage conditions. 1 recorded stability payload(s) could not be read, so any results they hold were not assessed here. Out-of-trend assessment (PhRMA CMC Statistics regression control chart: each pull point against the two-sided 95% prediction interval of the line fitted to all prior points): Assay: no out-of-trend points across 7 time points; slope -0.0999 per month (95% CI -0.103 to -0.0967) is significantly non-zero; trend toward the limit projected at 50.09 months (lower limit 95)."

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:197:40
    195|     expect(section.narrativeDraft).toMatch(/within their recorded acce…
    196|     expect(section.narrativeDraft).toMatch(/could not be read/);
    197|     expect(section.narrativeDraft).not.toMatch(/supporting stability o…
       |                                        ^
    198|   });
    199|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > preserves value comparisons but withholds stability support for an unresolved measured observation time
AssertionError: expected 'Stability studies for the drug substa…' not to match /supporting stability of/

- Expected:
/supporting stability of/

+ Received:
"Stability studies for the drug substance were conducted under [condition not specified] . The 7 recorded result(s) are tabulated in the stability results table. All 7 recorded result(s) compared here are within their recorded acceptance criteria at the reported time points, supporting stability of the drug substance under the proposed storage conditions. Out-of-trend assessment (PhRMA CMC Statistics regression control chart: each pull point against the two-sided 95% prediction interval of the line fitted to all prior points): Assay: trend not assessed: Recorded observation(s) at row 4 (timePoint) cannot be read as exact finite results at nonnegative month times. Clarify the recorded values, units, and intended handling before fitting; no affected series was fitted.."

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:207:40
    205|     expect(section.narrativeDraft).toMatch(/within their recorded acce…
    206|     expect(section.narrativeDraft).toMatch(/timePoint.*clarif/i);
    207|     expect(section.narrativeDraft).not.toMatch(/supporting stability o…
       |                                        ^
    208|   });
    209| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


 Test Files  1 failed (1)
      Tests  3 failed | 96 passed (99)
   Start at  05:27:34
   Duration  903ms (transform 431ms, setup 83ms, import 407ms, tests 84ms, environment 0ms)


```

## Q1E reference compatibility in the proposed guard: 1 failed / 99 passed (100)

```text
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

 RUN  v4.1.7 /workspace/scratch/bd36ee581acd/concept2cure

 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value 0 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value -0.5 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value " +98.4 % " 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "-.5" 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value ".5" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "12." 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "1e-05" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "-1.25E+2" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "1e-05 %" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "0e-999" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "5e-324" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "<0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "≤0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value ">95" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "NMT 0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "BLQ" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "ND" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1,000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1 000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1_000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12abc" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1.2.3" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12 mg" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e+" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e309" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e-999" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "NaN" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "Infinity" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value " " 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value undefined 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value true 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value false 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value 12 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value {"value":12} 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value {} 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "0x10" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12%%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time 6 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6" 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "+6.0" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6e0" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6M" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 mo" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 mos" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 month" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "Month 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "Month6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "MONTHS 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is -1 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "-1 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6 days" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "Week 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "1 year" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6 months 2 days" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6abc" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "<6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is undefined 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > keeps genuine missing results separate and leaves every raw record unchanged 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e-4 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1E+4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e+ 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= .5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NLT -5.0 °C 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion <= 2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion 95.0-105.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion 95.0 to 105.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion maximum 2.0 EU/mL 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% (per ICH Q1E) 6ms
   → expected null not to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for <0.1% despite sufficient other points 25ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 1,000 despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 12abc despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for BLQ despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > retains an independent valid series but withholds an incomplete programme shelf life 7ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > uses exponent results and month labels identically to the equivalent numeric observations 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > does not discard a present result with an absent time while fitting the other six 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses unsupported criterion notation even after valid criteria in every fitted path 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > retains genuine missing results in recorded counts while allowing the complete observations to fit 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains <0.1% raw, without presenting an exact conformance or trend 12ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 1,000 raw, without presenting an exact conformance or trend 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 12abc raw, without presenting an exact conformance or trend 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > compares an exact exponent result at its real magnitude 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > does not compare a supported result against an unsupported exponent criterion 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > reports readable comparisons but withholds stability support when another recorded payload is unreadable 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > preserves value comparisons but withholds stability support for an unresolved measured observation time 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% (per ICH Q1E)
AssertionError: expected null not to be null
 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:72:55
     70|
     71|   it.each(['NLT -5.0 °C', '<= 2mg', 'NMT 2.0%', '95.0-105.0%', '95.0 t…
     72|     expect(parseAcceptanceCriterion([criterion])).not.toBeNull();
       |                                                       ^
     73|   });
     74| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 99 passed (100)
   Start at  05:31:39
   Duration  1.01s (transform 528ms, setup 100ms, import 497ms, tests 87ms, environment 0ms)


```

## CTD reference compatibility in the proposed guard: 1 failed / 100 passed (101)

```text
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

 RUN  v4.1.7 /workspace/scratch/bd36ee581acd/concept2cure

 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value 0 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value -0.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value " +98.4 % " 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "-.5" 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value ".5" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "12." 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "1e-05" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "-1.25E+2" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "1e-05 %" 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "0e-999" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "5e-324" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "<0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "≤0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value ">95" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "NMT 0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "BLQ" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "ND" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1,000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1 000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1_000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12abc" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1.2.3" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12 mg" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e+" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e309" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e-999" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "NaN" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "Infinity" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value " " 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value undefined 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value true 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value false 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value 12 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value {"value":12} 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value {} 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "0x10" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12%%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time 6 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6" 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "+6.0" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6e0" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6M" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 mo" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 mos" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 month" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "Month 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "Month6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "MONTHS 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is -1 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "-1 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6 days" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "Week 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "1 year" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6 months 2 days" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6abc" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "<6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is undefined 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > keeps genuine missing results separate and leaves every raw record unchanged 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e-4 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1E+4 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e+ 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= .5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NLT -5.0 °C 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion <= 2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion 95.0-105.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion 95.0 to 105.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion maximum 2.0 EU/mL 3ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% (per ICH Q1E) 1ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% (see 3.2.S.4) 6ms
   → expected null not to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for <0.1% despite sufficient other points 23ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 1,000 despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 12abc despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for BLQ despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > retains an independent valid series but withholds an incomplete programme shelf life 8ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > uses exponent results and month labels identically to the equivalent numeric observations 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > does not discard a present result with an absent time while fitting the other six 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses unsupported criterion notation even after valid criteria in every fitted path 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > retains genuine missing results in recorded counts while allowing the complete observations to fit 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains <0.1% raw, without presenting an exact conformance or trend 14ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 1,000 raw, without presenting an exact conformance or trend 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 12abc raw, without presenting an exact conformance or trend 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > compares an exact exponent result at its real magnitude 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > does not compare a supported result against an unsupported exponent criterion 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > reports readable comparisons but withholds stability support when another recorded payload is unreadable 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > preserves value comparisons but withholds stability support for an unresolved measured observation time 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% (see 3.2.S.4)
AssertionError: expected null not to be null
 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:72:55


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 100 passed (101)
   Start at  05:33:07
   Duration  938ms (transform 463ms, setup 86ms, import 444ms, tests 92ms, environment 0ms)


```

## Attached comparator bounds before correction: 10 failed / 104 passed (114)

```text
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

 RUN  v4.1.7 /workspace/scratch/bd36ee581acd/concept2cure

 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value 0 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value -0.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value " +98.4 % " 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "-.5" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value ".5" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "12." 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "1e-05" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "-1.25E+2" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "1e-05 %" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "0e-999" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "5e-324" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "<0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "≤0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value ">95" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "NMT 0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "BLQ" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "ND" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1,000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1 000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1_000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12abc" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1.2.3" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12 mg" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e+" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e309" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e-999" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "NaN" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "Infinity" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value " " 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value undefined 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value true 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value false 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value 12 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value {"value":12} 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value {} 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "0x10" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12%%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time 6 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6" 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "+6.0" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6e0" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6M" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 mo" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 mos" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 month" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "Month 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "Month6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "MONTHS 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is -1 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "-1 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6 days" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "Week 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "1 year" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6 months 2 days" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6abc" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "<6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is undefined 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > keeps genuine missing results separate and leaves every raw record unchanged 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e-4 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1E+4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e+ 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= .5 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT1e-4% 10ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NLT1e+4% 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from max1e+ 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from maximum1e-4 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from minimum1e-4 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from not more than1e-4 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from not less than1e-4 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT-1e-4 1ms
   → expected { limit: -1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT1,000 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT.5% 0ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NLT -5.0 °C 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion <= 2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion 95.0-105.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion 95.0 to 105.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion maximum 2.0 EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% (per ICH Q1E) 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% (see 3.2.S.4) 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT2.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion maximum2.0 EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion not more than2.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for <0.1% despite sufficient other points 24ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 1,000 despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 12abc despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for BLQ despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > retains an independent valid series but withholds an incomplete programme shelf life 7ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > uses exponent results and month labels identically to the equivalent numeric observations 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > does not discard a present result with an absent time while fitting the other six 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses unsupported criterion notation even after valid criteria in every fitted path 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > retains genuine missing results in recorded counts while allowing the complete observations to fit 4ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains <0.1% raw, without presenting an exact conformance or trend 13ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 1,000 raw, without presenting an exact conformance or trend 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 12abc raw, without presenting an exact conformance or trend 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > compares an exact exponent result at its real magnitude 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > does not compare a supported result against an unsupported exponent criterion 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > reports readable comparisons but withholds stability support when another recorded payload is unreadable 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > preserves value comparisons but withholds stability support for an unresolved measured observation time 1ms

⎯⎯⎯⎯⎯⎯ Failed Tests 10 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT1e-4%
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from max1e+
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from maximum1e-4
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from not more than1e-4
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT1,000
AssertionError: expected { limit: 1, …(3) } to be null

- Expected:
null

+ Received:
{
  "direction": "increasing",
  "limit": 1,
  "twoSided": false,
  "upperLimit": null,
}

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:66:51


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/10]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NLT1e+4%
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from minimum1e-4
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from not less than1e-4
AssertionError: expected { limit: 1, …(3) } to be null

- Expected:
null

+ Received:
{
  "direction": "decreasing",
  "limit": 1,
  "twoSided": false,
  "upperLimit": null,
}

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:66:51


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/10]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT-1e-4
AssertionError: expected { limit: -1, …(3) } to be null

- Expected:
null

+ Received:
{
  "direction": "increasing",
  "limit": -1,
  "twoSided": false,
  "upperLimit": null,
}

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:66:51


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/10]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT.5%
AssertionError: expected { limit: 5, …(3) } to be null

- Expected:
null

+ Received:
{
  "direction": "increasing",
  "limit": 5,
  "twoSided": false,
  "upperLimit": null,
}

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:66:51


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/10]⎯


 Test Files  1 failed (1)
      Tests  10 failed | 104 passed (114)
   Start at  05:34:27
   Duration  987ms (transform 480ms, setup 81ms, import 469ms, tests 93ms, environment 0ms)


```

## Second range bounds before correction: 4 failed / 116 passed (120)

```text
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

 RUN  v4.1.7 /workspace/scratch/bd36ee581acd/concept2cure

 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value 0 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value -0.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value " +98.4 % " 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "-.5" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value ".5" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "12." 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "1e-05" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "-1.25E+2" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "1e-05 %" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "0e-999" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "5e-324" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "<0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "≤0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value ">95" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "NMT 0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "BLQ" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "ND" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1,000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1 000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1_000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12abc" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1.2.3" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12 mg" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e+" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e309" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e-999" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "NaN" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "Infinity" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value " " 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value undefined 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value true 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value false 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value 12 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value {"value":12} 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value {} 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "0x10" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12%%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time 6 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6" 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "+6.0" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6e0" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6M" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 mo" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 mos" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 month" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "Month 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "Month6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "MONTHS 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is -1 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "-1 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6 days" 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "Week 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "1 year" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6 months 2 days" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6abc" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "<6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is undefined 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > keeps genuine missing results separate and leaves every raw record unchanged 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e-4 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1E+4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e+ 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= .5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT1e-4% 3ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NLT1e+4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from max1e+ 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from maximum1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from minimum1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from not more than1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from not less than1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT-1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT.5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from 95.0-1e2% 7ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from 0-1e-4 1ms
   → expected { limit: +0, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from 0--1e-4 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from 95.0-1.2.3 1ms
   → expected { limit: 1.2, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from 0-.5 1ms
   → expected { limit: 2, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NLT -5.0 °C 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion <= 2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion 95.0-105.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion 95.0 to 105.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion maximum 2.0 EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% (per ICH Q1E) 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% (see 3.2.S.4) 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT2.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion maximum2.0 EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion not more than2.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion -5.0--1.0 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for <0.1% despite sufficient other points 56ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 1,000 despite sufficient other points 3ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 12abc despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for BLQ despite sufficient other points 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > retains an independent valid series but withholds an incomplete programme shelf life 9ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > uses exponent results and month labels identically to the equivalent numeric observations 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > does not discard a present result with an absent time while fitting the other six 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses unsupported criterion notation even after valid criteria in every fitted path 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > retains genuine missing results in recorded counts while allowing the complete observations to fit 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains <0.1% raw, without presenting an exact conformance or trend 13ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 1,000 raw, without presenting an exact conformance or trend 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 12abc raw, without presenting an exact conformance or trend 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > compares an exact exponent result at its real magnitude 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > does not compare a supported result against an unsupported exponent criterion 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > reports readable comparisons but withholds stability support when another recorded payload is unreadable 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > preserves value comparisons but withholds stability support for an unresolved measured observation time 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from 95.0-1e2%
AssertionError: expected { limit: 1, …(3) } to be null

- Expected:
null

+ Received:
{
  "direction": "decreasing",
  "limit": 1,
  "twoSided": true,
  "upperLimit": 95,
}

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:66:51


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from 0-1e-4
AssertionError: expected { limit: +0, …(3) } to be null

- Expected:
null

+ Received:
{
  "direction": "decreasing",
  "limit": 0,
  "twoSided": true,
  "upperLimit": 1,
}

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:66:51


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from 95.0-1.2.3
AssertionError: expected { limit: 1.2, …(3) } to be null

- Expected:
null

+ Received:
{
  "direction": "decreasing",
  "limit": 1.2,
  "twoSided": true,
  "upperLimit": 95,
}

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:66:51


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from 0-.5
AssertionError: expected { limit: 2, …(3) } to be null

- Expected:
null

+ Received:
{
  "direction": "increasing",
  "limit": 2,
  "twoSided": false,
  "upperLimit": null,
}

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:67:62


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯


 Test Files  1 failed (1)
      Tests  4 failed | 116 passed (120)
   Start at  05:35:28
   Duration  1.40s (transform 691ms, setup 103ms, import 629ms, tests 136ms, environment 0ms)


```

## Numeric-prefix operator/unit matrix before correction: 144 failed / 315 passed (459)

```text
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

 RUN  v4.1.7 /workspace/scratch/bd36ee581acd/concept2cure

 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value 0 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value -0.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value " +98.4 % " 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "-.5" 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value ".5" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "12." 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "1e-05" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "-1.25E+2" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "1e-05 %" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "0e-999" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "5e-324" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "<0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "≤0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value ">95" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "NMT 0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "BLQ" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "ND" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1,000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1 000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1_000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12abc" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1.2.3" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12 mg" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e+" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e309" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e-999" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "NaN" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "Infinity" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value " " 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value undefined 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value true 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value false 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value 12 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value {"value":12} 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value {} 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "0x10" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12%%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time 6 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "+6.0" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6e0" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6M" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 mo" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 mos" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 month" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "Month 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "Month6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "MONTHS 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is -1 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "-1 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6 days" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "Week 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "1 year" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6 months 2 days" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6abc" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "<6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is undefined 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > keeps genuine missing results separate and leaves every raw record unchanged 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1e-4 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1,000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1,000mg 7ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1,000EU/mL 1ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1,000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1,000mg 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1,000EU/mL 3ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1,000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1,000mg 2ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1,000EU/mL 1ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1,000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1,000mg 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1,000EU/mL 1ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1,000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1,000mg 2ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1,000EU/mL 1ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1,000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1,000mg 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1,000EU/mL 1ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1,000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1,000mg 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1,000EU/mL 0ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1,000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1,000mg 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1,000EU/mL 0ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1,000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1,000mg 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1,000EU/mL 1ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1,000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1,000mg 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1,000EU/mL 0ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1,000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1,000mg 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1,000EU/mL 0ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1,000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1,000mg 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1,000EU/mL 1ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1_000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1_000mg 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1_000EU/mL 1ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1_000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1_000mg 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1_000EU/mL 0ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1_000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1_000mg 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1_000EU/mL 0ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1_000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1_000mg 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1_000EU/mL 0ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1_000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1_000mg 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1_000EU/mL 0ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1_000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1_000mg 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1_000EU/mL 0ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1_000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1_000mg 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1_000EU/mL 1ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1_000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1_000mg 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1_000EU/mL 0ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1_000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1_000mg 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1_000EU/mL 0ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1_000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1_000mg 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1_000EU/mL 1ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1_000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1_000mg 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1_000EU/mL 1ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1_000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1_000mg 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1_000EU/mL 0ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1 000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1 000mg 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1 000EU/mL 0ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1 000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1 000mg 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1 000EU/mL 1ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1 000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1 000mg 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1 000EU/mL 0ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1 000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1 000mg 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1 000EU/mL 0ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1 000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1 000mg 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1 000EU/mL 1ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1 000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1 000mg 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1 000EU/mL 1ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1 000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1 000mg 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1 000EU/mL 0ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1 000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1 000mg 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1 000EU/mL 1ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1 000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1 000mg 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1 000EU/mL 4ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1 000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1 000mg 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1 000EU/mL 1ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1 000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1 000mg 1ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1 000EU/mL 1ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1 000% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1 000mg 0ms
   → expected { limit: 1, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1 000EU/mL 0ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1.2.3% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1.2.3mg 1ms
   → expected { limit: 1.2, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1.2.3EU/mL 1ms
   → expected { limit: 1.2, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1.2.3% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1.2.3mg 0ms
   → expected { limit: 1.2, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1.2.3EU/mL 0ms
   → expected { limit: 1.2, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1.2.3% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1.2.3mg 0ms
   → expected { limit: 1.2, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1.2.3EU/mL 0ms
   → expected { limit: 1.2, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1.2.3% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1.2.3mg 0ms
   → expected { limit: 1.2, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1.2.3EU/mL 0ms
   → expected { limit: 1.2, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1.2.3% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1.2.3mg 0ms
   → expected { limit: 1.2, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1.2.3EU/mL 0ms
   → expected { limit: 1.2, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1.2.3% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1.2.3mg 0ms
   → expected { limit: 1.2, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1.2.3EU/mL 0ms
   → expected { limit: 1.2, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1.2.3% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1.2.3mg 0ms
   → expected { limit: 1.2, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1.2.3EU/mL 0ms
   → expected { limit: 1.2, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1.2.3% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1.2.3mg 0ms
   → expected { limit: 1.2, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1.2.3EU/mL 0ms
   → expected { limit: 1.2, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1.2.3% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1.2.3mg 0ms
   → expected { limit: 1.2, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1.2.3EU/mL 1ms
   → expected { limit: 1.2, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1.2.3% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1.2.3mg 0ms
   → expected { limit: 1.2, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1.2.3EU/mL 0ms
   → expected { limit: 1.2, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1.2.3% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1.2.3mg 1ms
   → expected { limit: 1.2, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1.2.3EU/mL 0ms
   → expected { limit: 1.2, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1.2.3% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1.2.3mg 0ms
   → expected { limit: 1.2, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1.2.3EU/mL 0ms
   → expected { limit: 1.2, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT.5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT.5mg 1ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT.5EU/mL 2ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT .5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT .5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT .5mg 1ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT .5EU/mL 0ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT.5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT.5mg 0ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT.5EU/mL 0ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT .5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT .5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT .5mg 1ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT .5EU/mL 0ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max.5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max.5mg 0ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max.5EU/mL 0ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max .5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max .5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max .5mg 0ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max .5EU/mL 1ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min.5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min.5mg 0ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min.5EU/mL 0ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min .5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min .5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min .5mg 1ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min .5EU/mL 1ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=.5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=.5mg 0ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=.5EU/mL 0ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= .5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= .5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= .5mg 0ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= .5EU/mL 1ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=.5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=.5mg 0ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=.5EU/mL 1ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= .5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= .5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= .5mg 1ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= .5EU/mL 1ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT-.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT-.5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT-.5mg 0ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT-.5EU/mL 0ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT -.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT -.5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT -.5mg 0ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT -.5EU/mL 0ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT-.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT-.5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT-.5mg 0ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT-.5EU/mL 0ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT -.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT -.5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT -.5mg 1ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT -.5EU/mL 0ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max-.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max-.5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max-.5mg 0ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max-.5EU/mL 1ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max -.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max -.5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max -.5mg 0ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max -.5EU/mL 1ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min-.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min-.5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min-.5mg 0ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min-.5EU/mL 0ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min -.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min -.5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min -.5mg 0ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min -.5EU/mL 0ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=-.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=-.5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=-.5mg 1ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=-.5EU/mL 1ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= -.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= -.5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= -.5mg 0ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= -.5EU/mL 1ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=-.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=-.5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=-.5mg 0ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=-.5EU/mL 0ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= -.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= -.5% 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= -.5mg 1ms
   → expected { limit: 5, …(3) } to be null
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= -.5EU/mL 0ms
   → expected { limit: 5, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e-4 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1E+4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e+ 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1.2.3 5ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= .5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NLT1e+4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from max1e+ 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from maximum1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from minimum1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from not more than1e-4 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from not less than1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT-1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT.5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from 95.0-1e2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from 0-1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from 0--1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from 95.0-1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from 0-.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NLT -5.0 °C 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion <= 2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion 95.0-105.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion 95.0 to 105.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion maximum 2.0 EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% (per ICH Q1E) 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% (see 3.2.S.4) 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT2.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion maximum2.0 EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion not more than2.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion -5.0--1.0 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT1000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT2.0mg (see 3.2.S.4) 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for <0.1% despite sufficient other points 415ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 1,000 despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 12abc despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for BLQ despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > retains an independent valid series but withholds an incomplete programme shelf life 10ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > uses exponent results and month labels identically to the equivalent numeric observations 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > does not discard a present result with an absent time while fitting the other six 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses unsupported criterion notation even after valid criteria in every fitted path 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > retains genuine missing results in recorded counts while allowing the complete observations to fit 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains <0.1% raw, without presenting an exact conformance or trend 17ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 1,000 raw, without presenting an exact conformance or trend 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 12abc raw, without presenting an exact conformance or trend 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > compares an exact exponent result at its real magnitude 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > does not compare a supported result against an unsupported exponent criterion 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > reports readable comparisons but withholds stability support when another recorded payload is unreadable 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > preserves value comparisons but withholds stability support for an unresolved measured observation time 1ms

⎯⎯⎯⎯⎯⎯ Failed Tests 144 ⎯⎯⎯⎯⎯⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1,000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1,000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1,000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1,000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1,000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1,000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1,000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1,000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1,000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1,000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1,000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1,000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1_000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1_000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1_000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1_000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1_000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1_000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1_000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1_000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1_000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1_000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1_000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1_000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1 000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1 000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1 000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1 000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1 000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1 000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1 000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1 000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1 000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1 000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1 000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1 000EU/mL
AssertionError: expected { limit: 1, …(3) } to be null

- Expected:
null

+ Received:
{
  "direction": "increasing",
  "limit": 1,
  "twoSided": false,
  "upperLimit": null,
}

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:74:51
     72|
     73|   it.each(numericBoundaryMatrix)('refuses unsupported numeric prefixes…
     74|     expect(parseAcceptanceCriterion([criterion])).toBeNull();
       |                                                   ^
     75|     expect(parseAcceptanceCriterion(['<= 2.0%', criterion])).toBeNull(…
     76|     expect(parseAcceptanceCriterion([criterion, '<= 2.0%'])).toBeNull(…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/144]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1,000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1,000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1,000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1,000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1,000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1,000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1,000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1,000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1,000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1,000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1,000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1,000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1_000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1_000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1_000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1_000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1_000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1_000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1_000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1_000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1_000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1_000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1_000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1_000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1 000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1 000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1 000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1 000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1 000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1 000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1 000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1 000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1 000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1 000EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1 000mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1 000EU/mL
AssertionError: expected { limit: 1, …(3) } to be null

- Expected:
null

+ Received:
{
  "direction": "decreasing",
  "limit": 1,
  "twoSided": false,
  "upperLimit": null,
}

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:74:51
     72|
     73|   it.each(numericBoundaryMatrix)('refuses unsupported numeric prefixes…
     74|     expect(parseAcceptanceCriterion([criterion])).toBeNull();
       |                                                   ^
     75|     expect(parseAcceptanceCriterion(['<= 2.0%', criterion])).toBeNull(…
     76|     expect(parseAcceptanceCriterion([criterion, '<= 2.0%'])).toBeNull(…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/144]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1.2.3mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1.2.3EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1.2.3mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1.2.3EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1.2.3mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1.2.3EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1.2.3mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1.2.3EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1.2.3mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1.2.3EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1.2.3mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1.2.3EU/mL
AssertionError: expected { limit: 1.2, …(3) } to be null

- Expected:
null

+ Received:
{
  "direction": "increasing",
  "limit": 1.2,
  "twoSided": false,
  "upperLimit": null,
}

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:74:51
     72|
     73|   it.each(numericBoundaryMatrix)('refuses unsupported numeric prefixes…
     74|     expect(parseAcceptanceCriterion([criterion])).toBeNull();
       |                                                   ^
     75|     expect(parseAcceptanceCriterion(['<= 2.0%', criterion])).toBeNull(…
     76|     expect(parseAcceptanceCriterion([criterion, '<= 2.0%'])).toBeNull(…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/144]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1.2.3mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1.2.3EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1.2.3mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1.2.3EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1.2.3mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1.2.3EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1.2.3mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1.2.3EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1.2.3mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1.2.3EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1.2.3mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1.2.3EU/mL
AssertionError: expected { limit: 1.2, …(3) } to be null

- Expected:
null

+ Received:
{
  "direction": "decreasing",
  "limit": 1.2,
  "twoSided": false,
  "upperLimit": null,
}

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:74:51
     72|
     73|   it.each(numericBoundaryMatrix)('refuses unsupported numeric prefixes…
     74|     expect(parseAcceptanceCriterion([criterion])).toBeNull();
       |                                                   ^
     75|     expect(parseAcceptanceCriterion(['<= 2.0%', criterion])).toBeNull(…
     76|     expect(parseAcceptanceCriterion([criterion, '<= 2.0%'])).toBeNull(…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/144]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT.5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT.5EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT .5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT .5EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max.5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max.5EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max .5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max .5EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=.5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=.5EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= .5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= .5EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT-.5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT-.5EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT -.5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT -.5EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max-.5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max-.5EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max -.5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max -.5EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=-.5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=-.5EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= -.5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= -.5EU/mL
AssertionError: expected { limit: 5, …(3) } to be null

- Expected:
null

+ Received:
{
  "direction": "increasing",
  "limit": 5,
  "twoSided": false,
  "upperLimit": null,
}

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:74:51
     72|
     73|   it.each(numericBoundaryMatrix)('refuses unsupported numeric prefixes…
     74|     expect(parseAcceptanceCriterion([criterion])).toBeNull();
       |                                                   ^
     75|     expect(parseAcceptanceCriterion(['<= 2.0%', criterion])).toBeNull(…
     76|     expect(parseAcceptanceCriterion([criterion, '<= 2.0%'])).toBeNull(…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/144]⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT.5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT.5EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT .5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT .5EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min.5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min.5EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min .5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min .5EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=.5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=.5EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= .5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= .5EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT-.5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT-.5EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT -.5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT -.5EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min-.5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min-.5EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min -.5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min -.5EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=-.5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=-.5EU/mL
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= -.5mg
 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= -.5EU/mL
AssertionError: expected { limit: 5, …(3) } to be null

- Expected:
null

+ Received:
{
  "direction": "decreasing",
  "limit": 5,
  "twoSided": false,
  "upperLimit": null,
}

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:74:51
     72|
     73|   it.each(numericBoundaryMatrix)('refuses unsupported numeric prefixes…
     74|     expect(parseAcceptanceCriterion([criterion])).toBeNull();
       |                                                   ^
     75|     expect(parseAcceptanceCriterion(['<= 2.0%', criterion])).toBeNull(…
     76|     expect(parseAcceptanceCriterion([criterion, '<= 2.0%'])).toBeNull(…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/144]⎯


 Test Files  1 failed (1)
      Tests  144 failed | 315 passed (459)
   Start at  05:38:12
   Duration  1.43s (transform 576ms, setup 84ms, import 433ms, tests 596ms, environment 0ms)


```

## Adjacent repeated dots before correction: 1 failed / 459 passed (460)

```text
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

 RUN  v4.1.7 /workspace/scratch/bd36ee581acd/concept2cure

 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value 0 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value -0.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value " +98.4 % " 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "-.5" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value ".5" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "12." 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "1e-05" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "-1.25E+2" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "1e-05 %" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "0e-999" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads the complete finite value "5e-324" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "<0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "≤0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value ">95" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "NMT 0.1%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "BLQ" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "ND" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1,000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1 000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1_000" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12abc" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1.2.3" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12 mg" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e+" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e309" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "1e-999" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "NaN" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "Infinity" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value " " 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value undefined 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value true 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value false 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value 12 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value {"value":12} 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value {} 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "0x10" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12%%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "12 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time 6 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "+6.0" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6e0" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6M" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 mo" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 mos" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 month" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "6 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "Month 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "Month6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > reads a complete month time "MONTHS 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is -1 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "-1 months" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6 days" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "Week 6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "1 year" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6%" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6 months 2 days" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "6abc" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "<6" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is null 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is undefined 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "" 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > keeps genuine missing results separate and leaves every raw record unchanged 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1e-4 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1e-4 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1e-4mg 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1e-4mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1e-4EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1,000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1,000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1,000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1,000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1,000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1,000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1,000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1,000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1,000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1,000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1,000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1,000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1,000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1,000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1,000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1,000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1,000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1,000EU/mL 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1,000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1,000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1,000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1,000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1,000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1,000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1,000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1,000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1,000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1,000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1,000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1,000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1,000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1,000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1,000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1,000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1,000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1,000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1_000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1_000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1_000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1_000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1_000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1_000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1_000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1_000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1_000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1_000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1_000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1_000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1_000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1_000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1_000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1_000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1_000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1_000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1_000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1_000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1_000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1_000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1_000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1_000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1_000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1_000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1_000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1_000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1_000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1_000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1_000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1_000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1_000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1_000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1_000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1_000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1 000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1 000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1 000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1 000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1 000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1 000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1 000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1 000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1 000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1 000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1 000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1 000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1 000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1 000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1 000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1 000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1 000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1 000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1 000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1 000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1 000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1 000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1 000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1 000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1 000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1 000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1 000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1 000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1 000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1 000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1 000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1 000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1 000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1 000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1 000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1 000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1.2.3% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1.2.3mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1.2.3EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1.2.3% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1.2.3mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1.2.3EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1.2.3% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1.2.3mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1.2.3EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1.2.3% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1.2.3mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1.2.3EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1.2.3% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1.2.3mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1.2.3EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1.2.3% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1.2.3mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1.2.3EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1.2.3% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1.2.3mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1.2.3EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1.2.3% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1.2.3mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1.2.3EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1.2.3% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1.2.3mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1.2.3EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1.2.3% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1.2.3mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1.2.3EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1.2.3% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1.2.3mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1.2.3EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1.2.3% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1.2.3mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1.2.3EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT.5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT.5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT.5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT .5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT .5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT .5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT .5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT.5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT.5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT.5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT .5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT .5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT .5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT .5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max.5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max.5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max.5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max .5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max .5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max .5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max .5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min.5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min.5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min.5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min .5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min .5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min .5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min .5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=.5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=.5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=.5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= .5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= .5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= .5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= .5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=.5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=.5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=.5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= .5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= .5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= .5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= .5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT-.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT-.5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT-.5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT-.5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT -.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT -.5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT -.5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT -.5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT-.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT-.5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT-.5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT-.5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT -.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT -.5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT -.5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT -.5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max-.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max-.5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max-.5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max-.5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max -.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max -.5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max -.5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max -.5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min-.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min-.5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min-.5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min-.5EU/mL 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min -.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min -.5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min -.5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min -.5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=-.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=-.5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=-.5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=-.5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= -.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= -.5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= -.5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= -.5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=-.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=-.5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=-.5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=-.5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= -.5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= -.5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= -.5mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= -.5EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1E+4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1e+ 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1_000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= 1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from <= .5 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT1e-4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NLT1e+4% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from max1e+ 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from maximum1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from minimum1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from not more than1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from not less than1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT-1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT1,000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT.5% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from 95.0-1e2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from 0-1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from 0--1e-4 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from 95.0-1.2.3 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from 0-.5 0ms
 × server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT1...2mg 7ms
   → expected { limit: 1, …(3) } to be null
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NLT -5.0 °C 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion <= 2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion 95.0-105.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion 95.0 to 105.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion maximum 2.0 EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% (per ICH Q1E) 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% (see 3.2.S.4) 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT2.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion maximum2.0 EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion not more than2.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion -5.0--1.0 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT1000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT2.0mg (see 3.2.S.4) 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for <0.1% despite sufficient other points 18ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 1,000 despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 12abc despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for BLQ despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > retains an independent valid series but withholds an incomplete programme shelf life 9ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > uses exponent results and month labels identically to the equivalent numeric observations 3ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > does not discard a present result with an absent time while fitting the other six 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses unsupported criterion notation even after valid criteria in every fitted path 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > retains genuine missing results in recorded counts while allowing the complete observations to fit 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains <0.1% raw, without presenting an exact conformance or trend 14ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 1,000 raw, without presenting an exact conformance or trend 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 12abc raw, without presenting an exact conformance or trend 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > compares an exact exponent result at its real magnitude 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > does not compare a supported result against an unsupported exponent criterion 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > reports readable comparisons but withholds stability support when another recorded payload is unreadable 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > preserves value comparisons but withholds stability support for an unresolved measured observation time 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT1...2mg
AssertionError: expected { limit: 1, …(3) } to be null

- Expected:
null

+ Received:
{
  "direction": "increasing",
  "limit": 1,
  "twoSided": false,
  "upperLimit": null,
}

 ❯ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts:80:51


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 459 passed (460)
   Start at  05:39:47
   Duration  1.01s (transform 445ms, setup 94ms, import 438ms, tests 119ms, environment 0ms)


```
