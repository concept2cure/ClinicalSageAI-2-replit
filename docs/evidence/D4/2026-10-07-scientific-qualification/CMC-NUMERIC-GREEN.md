# CMC numeric qualification — GREEN execution output

Actual local output captured on 2026-10-07. Commands and limits are in
[CMC-NUMERIC-RESULTS.md](CMC-NUMERIC-RESULTS.md). Core RED ran before production
changes; later RED controls preceded their corresponding approved fixes.
Compatibility REDs caught regressions in the proposed guard during review.

## Main regression: 13 files, 677 passed

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
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses a present result whose time is "1 year" 1ms
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
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1,000EU/mL 0ms
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
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1...2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1...2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1...2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1...2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1...2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1...2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1...2mg 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1...2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1...2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1...2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1...2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1...2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1...2EU/mL 0ms
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
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min-.5EU/mL 0ms
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
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT1...2mg 0ms
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
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for <0.1% despite sufficient other points 21ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 1,000 despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 12abc despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for BLQ despite sufficient other points 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > retains an independent valid series but withholds an incomplete programme shelf life 8ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > uses exponent results and month labels identically to the equivalent numeric observations 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > does not discard a present result with an absent time while fitting the other six 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses unsupported criterion notation even after valid criteria in every fitted path 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > retains genuine missing results in recorded counts while allowing the complete observations to fit 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains <0.1% raw, without presenting an exact conformance or trend 18ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 1,000 raw, without presenting an exact conformance or trend 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 12abc raw, without presenting an exact conformance or trend 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > compares an exact exponent result at its real magnitude 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > does not compare a supported result against an unsupported exponent criterion 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > reports readable comparisons but withholds stability support when another recorded payload is unreadable 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > preserves value comparisons but withholds stability support for an unresolved measured observation time 1ms
stdout | server/services/ana/__tests__/deepening-tools.test.ts
{
  "timestamp": "2026-10-07T09:40:58.132Z",
  "level": "info",
  "message": "[database] Initializing PostgreSQL connection pool",
  "context": {}
}
{
  "timestamp": "2026-10-07T09:40:58.134Z",
  "level": "info",
  "message": "[database] RLS enforcement mode resolved",
  "context": {
    "mode": "off"
  }
}

stderr | server/services/ana/__tests__/deepening-tools.test.ts
{
  "timestamp": "2026-10-07T09:40:58.134Z",
  "level": "warn",
  "message": "[database] Skipping database startup connectivity test (SKIP_DB_STARTUP_TEST=true)",
  "context": {}
}

stdout | server/services/ana/__tests__/deepening-tools.test.ts
[database] Database connection successful

stderr | server/services/ana/__tests__/deepening-tools.test.ts > assess_recorded_batch_poolability > will not assess a partial set when an id is not in this organization
{
  "timestamp": "2026-10-07T09:41:03.358Z",
  "level": "warn",
  "message": "[tenant-rls-observability] Query issued without tenant scope (will be blocked once RLS is enabled)",
  "context": {
    "op": "pool.query",
    "caller": "unknown",
    "queryPreview": "select \"id\", \"study_title\", \"product_name\", \"batch_number\", \"storage_conditions\", \"duration\", \"stability_data\" from \"stability_studies\" where (\"stability_stu...",
    "enforcement": "off"
  }
}

stderr | server/services/ana/__tests__/deepening-tools.test.ts > get_submission_readiness_twin > will not report a score for a program outside the caller's organization
{
  "timestamp": "2026-10-07T09:41:03.409Z",
  "level": "warn",
  "message": "[tenant-rls-observability] Query issued without tenant scope (will be blocked once RLS is enabled)",
  "context": {
    "op": "pool.query",
    "caller": "server/services/c2c/program-access.ts:184:25",
    "queryPreview": "SELECT id FROM regulatory_programs WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL LIMIT 1",
    "enforcement": "off"
  }
}

 ✓ server/services/ana/__tests__/deepening-tools.test.ts > deepening tools — registration > assess_batch_poolability is defined and registered 2ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > deepening tools — registration > assess_recorded_batch_poolability is defined and registered 1ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > deepening tools — registration > list_cmc_registers is defined and registered 0ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > deepening tools — registration > estimate_recorded_shelf_life is defined and registered 0ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > deepening tools — registration > get_submission_readiness_twin is defined and registered 0ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > deepening tools — registration > assess_benefit_risk is defined and registered 0ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > deepening tools — registration > assess_recorded_stability_trend is defined and registered 0ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > deepening tools — registration > assess_recorded_process_capability is defined and registered 0ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > assess_recorded_batch_poolability > refuses without an organization context rather than reading across tenants 2ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > assess_recorded_batch_poolability > needs at least two distinct ids 1ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > assess_recorded_batch_poolability > will not assess a partial set when an id is not in this organization 26ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > assess_batch_poolability > decides poolability and a shelf life 6ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > assess_batch_poolability > requires ≥2 batches 0ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > assess_benefit_risk > computes a structured benefit-risk result 6ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > assess_benefit_risk > validates inputs 0ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > get_submission_readiness_twin > refuses without an organization context 0ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > get_submission_readiness_twin > requires a program id 1ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > get_submission_readiness_twin > will not report a score for a program outside the caller's organization 37ms
stderr | server/services/ana/__tests__/deepening-tools.test.ts > list_cmc_registers — the discovery the recorded tools point at > answers with the ids the recorded tools take, and never confuses unreadable with empty
{
  "timestamp": "2026-10-07T09:41:03.425Z",
  "level": "warn",
  "message": "[tenant-rls-observability] Query issued without tenant scope (will be blocked once RLS is enabled)",
  "context": {
    "op": "pool.query",
    "caller": "server/services/ana/AnaToolExecutor.ts:17167:37",
    "queryPreview": "SELECT id, study_title AS \"studyTitle\", product_name AS \"productName\", batch_number AS \"batchNumber\", study_type AS \"studyType\", storage_conditions AS \"stora...",
    "enforcement": "off"
  }
}

 ✓ server/services/ana/__tests__/deepening-tools.test.ts > list_cmc_registers — the discovery the recorded tools point at > refuses without an organization context rather than reading across tenants 14ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > list_cmc_registers — the discovery the recorded tools point at > answers with the ids the recorded tools take, and never confuses unreadable with empty 2ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > list_cmc_registers — the discovery the recorded tools point at > caps the page size so a broad call cannot pull a register wholesale 4ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > list_cmc_registers — the discovery the recorded tools point at > lists the container closure and reference standard registers too 3ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > list_cmc_registers — the discovery the recorded tools point at > declares both new registers as selectable values, so a scoped call is not a silent no-op 1ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > list_cmc_registers — the discovery the recorded tools point at > lists the impurity and dissolution registers, with the ICH inputs a threshold needs 2ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > list_cmc_registers — the discovery the recorded tools point at > reports the E&L and characterisation packages as presence flags, not as payloads 1ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > estimate_recorded_shelf_life — ICH Q1E over a study on file > refuses without an organization context 0ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > estimate_recorded_shelf_life — ICH Q1E over a study on file > needs a real study id, and points at the register to find one 0ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > estimate_recorded_shelf_life — ICH Q1E over a study on file > a study that is not this organization's is not found — never answered from elsewhere 1ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > the recorded engine is SHARED with the stability surface, not a second copy > estimateRecordedShelfLife refuses a multi-condition study — the same refusal the route serves 1ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > the recorded engine is SHARED with the stability surface, not a second copy > refuses a study with no recorded pull points rather than fitting nothing 0ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > the recorded engine is SHARED with the stability surface, not a second copy > fits the limiting attribute from recorded results, and says why an attribute is not estimable 2ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > compare_recorded_dissolution > is defined and registered 0ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > compare_recorded_dissolution > refuses without an organization context rather than reading across tenants 0ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > compare_recorded_dissolution > needs two real ids, and points at the register to find them 0ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > compare_recorded_dissolution > refuses to compare a profile against itself 0ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > compare_recorded_dissolution > will not answer from a partial set when a profile is not this organization 11ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > compare_recorded_dissolution > tells the model to relay a refusal rather than route around it with typed numbers 0ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > assess_recorded_stability_trend > refuses without an organization rather than reading across tenants 0ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > assess_recorded_stability_trend > asks for the study id instead of guessing one 0ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > assess_recorded_process_capability > refuses without an organization 0ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > assess_recorded_process_capability > asks which project when neither the session nor the caller names one 0ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > assess_recorded_process_capability > the OPEN program outranks a project id the model supplied 6ms
 ✓ server/services/ana/__tests__/deepening-tools.test.ts > assess_recorded_process_capability > says a project it could not find was not read, and never reports an absence of findings for it 1ms
 ✓ server/services/cmc/__tests__/stability-trending.test.ts > assessTrend — PhRMA regression control chart > raises no out-of-trend point on a clean linear series, and establishes the slope 5ms
 ✓ server/services/cmc/__tests__/stability-trending.test.ts > assessTrend — PhRMA regression control chart > projects the time the fitted trend meets the limit it is heading toward 2ms
 ✓ server/services/cmc/__tests__/stability-trending.test.ts > assessTrend — PhRMA regression control chart > names the injected excursion, and only it 1ms
 ✓ server/services/cmc/__tests__/stability-trending.test.ts > assessTrend — PhRMA regression control chart > computes the prediction interval as the textbook formula does 2ms
 ✓ server/services/cmc/__tests__/stability-trending.test.ts > assessTrend — PhRMA regression control chart > does not flag a point that sits exactly on a perfectly linear prior (floating point is not an excursion) 1ms
 ✓ server/services/cmc/__tests__/stability-trending.test.ts > assessTrend — PhRMA regression control chart > refuses a series with fewer than 4 prior points to fit, with the reason 1ms
 ✓ server/services/cmc/__tests__/stability-trending.test.ts > assessTrend — PhRMA regression control chart > refuses without an acceptance criterion rather than assessing against nothing 0ms
 ✓ server/services/cmc/__tests__/stability-trending.test.ts > assessTrend — PhRMA regression control chart > refuses when the time points do not vary 0ms
 ✓ server/services/cmc/__tests__/stability-trending.test.ts > assessTrend — PhRMA regression control chart > projects nothing when the slope has the safe sign for the recorded limit 1ms
 ✓ server/services/cmc/__tests__/stability-trending.test.ts > assessTrend — PhRMA regression control chart > on a two-sided range, projects toward whichever bound the trend is heading for 1ms
 ✓ server/services/cmc/__tests__/stability-trending.test.ts > assessTrend — PhRMA regression control chart > reports a non-significant slope as such rather than projecting from it 2ms
 ✓ server/services/cmc/__tests__/stability-trending.test.ts > assessTrend — PhRMA regression control chart > ignores non-finite values and refuses an alpha outside (0, 0.5) 2ms
 ✓ server/services/cmc/__tests__/stability-signal.test.ts > the stability verdict is computed from the recorded results > an out-of-specification result outweighs a conclusion sentence that says otherwise 13ms
 ✓ server/services/cmc/__tests__/stability-signal.test.ts > the stability verdict is computed from the recorded results > states conformance when every recorded result is actually within its criterion 1ms
 ✓ server/services/cmc/__tests__/stability-signal.test.ts > the stability verdict is computed from the recorded results > reads an unspaced two-sided range, the way a specification is typed 1ms
 ✓ server/services/cmc/__tests__/stability-signal.test.ts > the stability verdict is computed from the recorded results > does not claim conformance from a sentence when no result carries a criterion 1ms
 ✓ server/services/cmc/__tests__/stability-signal.test.ts > the stability verdict is computed from the recorded results > a study with no recorded results at all defers, as it always did 0ms
 ✓ server/services/cmc/__tests__/stability-signal.test.ts > the stability verdict is computed from the recorded results > a recorded stability payload that cannot be parsed is said, not read as no data 1ms
 ✓ server/services/cmc/__tests__/stability-signal.test.ts > the stability verdict is computed from the recorded results > readable conforming points do not carry the section past an unreadable payload 1ms
 ✓ server/services/cmc/__tests__/stability-signal.test.ts > the batch-analyses disposition is computed where the record allows it > a declared pass over a failing number is named as the contradiction it is 5ms
 ✓ server/services/cmc/__tests__/stability-signal.test.ts > the batch-analyses disposition is computed where the record allows it > counts a genuinely conforming result as within criterion 1ms
 ✓ server/services/cmc/__tests__/stability-signal.test.ts > the batch-analyses disposition is computed where the record allows it > does not verify a disposition it cannot compare, and says so 1ms
 ✓ server/services/cmc/__tests__/stability-signal.test.ts > the batch-analyses disposition is computed where the record allows it > reads a two-sided assay range on either side 1ms
 ✓ server/services/cmc/__tests__/shelf-life-poolability.test.ts > assessBatchPoolability (ICH Q1E) > pools combinable batches and estimates from the pooled regression 6ms
 ✓ server/services/cmc/__tests__/shelf-life-poolability.test.ts > assessBatchPoolability (ICH Q1E) > refuses to pool batches with clearly different slopes and uses the minimum 1ms
 ✓ server/services/cmc/__tests__/shelf-life-poolability.test.ts > assessBatchPoolability (ICH Q1E) > validates inputs 1ms
 ✓ server/services/cmc/__tests__/shelf-life-poolability.test.ts > assessBatchPoolability (ICH Q1E) > is deterministic 3ms
 ✓ server/services/cmc/__tests__/recorded-stability-trending.test.ts > assessRecordedTrending > assesses each recorded attribute at its condition and finds the clean series clean 7ms
 ✓ server/services/cmc/__tests__/recorded-stability-trending.test.ts > assessRecordedTrending > names an out-of-trend pull point 1ms
 ✓ server/services/cmc/__tests__/recorded-stability-trending.test.ts > assessRecordedTrending > separates attributes recorded against different conditions into their own series 3ms
 ✓ server/services/cmc/__tests__/recorded-stability-trending.test.ts > assessRecordedTrending > refuses a study spanning conditions whose results carry none 0ms
 ✓ server/services/cmc/__tests__/recorded-stability-trending.test.ts > assessRecordedTrending > refuses a series with no recorded criterion, and one whose criterion cannot be read, with different reasons 1ms
 ✓ server/services/cmc/__tests__/recorded-stability-trending.test.ts > assessRecordedTrending > refuses a short series with the point count it has 0ms
 ✓ server/services/cmc/__tests__/recorded-stability-trending.test.ts > assessRecordedTrending > refuses at the study level when nothing is recorded, and when the record is unreadable 1ms
 ✓ server/services/cmc/__tests__/recorded-poolability-two-sided.test.ts > assessRecordedPoolability — both bounds of a two-sided criterion > reports the UPPER bound as limiting for an attribute drifting upward 10ms
 ✓ server/services/cmc/__tests__/recorded-poolability-two-sided.test.ts > assessRecordedPoolability — both bounds of a two-sided criterion > two batches that share a lower bound but not an upper one do NOT pool as if they agreed 1ms
 ✓ server/services/cmc/__tests__/shelf-life-two-sided.test.ts > parseAcceptanceCriterion carries both bounds of a range > resolves "4.5 - 6.5" to lower=4.5, upper=6.5, twoSided 3ms
 ✓ server/services/cmc/__tests__/shelf-life-two-sided.test.ts > estimateRecordedShelfLife — two-sided criteria > does NOT report the full search horizon for an attribute rising toward the UPPER bound 5ms
 ✓ server/services/cmc/__tests__/shelf-life-two-sided.test.ts > estimateRecordedShelfLife — two-sided criteria > reports the UPPER bound as the limiting one, and shows both were evaluated 2ms
 ✓ server/services/cmc/__tests__/shelf-life-two-sided.test.ts > estimateRecordedShelfLife — two-sided criteria > the programme answer follows the limiting bound 1ms
 ✓ server/services/cmc/__tests__/shelf-life-two-sided.test.ts > estimateRecordedShelfLife — two-sided criteria > a falling attribute is still limited by the LOWER bound (unchanged path) 1ms
 ✓ server/services/cmc/__tests__/shelf-life-two-sided.test.ts > estimateRecordedShelfLife — two-sided criteria > a ONE-SIDED criterion is unaffected and carries no two-sided block 1ms
 ✓ server/services/__tests__/module3Composer.stability-trending.test.ts > the stability narrative states the trend assessment > reports no out-of-trend points and the projected crossing on a clean, trending series 17ms
 ✓ server/services/__tests__/module3Composer.stability-trending.test.ts > the stability narrative states the trend assessment > names the out-of-trend time point 2ms
 ✓ server/services/__tests__/module3Composer.stability-trending.test.ts > the stability narrative states the trend assessment > says the trend was not assessed, and why, on too short a series 2ms
 ✓ server/services/__tests__/module3Composer.stability-trending.test.ts > the stability narrative states the trend assessment > says the trend was not assessed when no criterion is recorded 1ms
 ✓ server/services/__tests__/module3Composer.stability-trending.test.ts > the stability narrative states the trend assessment > is never silent — a study with no recorded results says trend was not assessed 2ms
 ✓ server/services/__tests__/module3Composer.stability-trending.test.ts > the stability narrative states the trend assessment > §3.2.P.8 carries the same assessment for the drug product 1ms
 ✓ server/services/__tests__/module3Composer.stability-trending.test.ts > review: a study placed at two conditions is refused, not fitted as one line > refuses through the composer when the mapper carried the condition array, and when only the legacy joined string is stored 2ms
 ✓ server/services/cmc/__tests__/shelf-life.test.ts > estimateShelfLife (ICH Q1E) > estimates a shelf life within the data range for a declining attribute 3ms
 ✓ server/services/cmc/__tests__/shelf-life.test.ts > estimateShelfLife (ICH Q1E) > uses the upper confidence limit for an increasing impurity 1ms
 ✓ server/services/cmc/__tests__/shelf-life.test.ts > estimateShelfLife (ICH Q1E) > reports exceedsEvaluatedRange when the CL never crosses spec in range 1ms
 ✓ server/services/cmc/__tests__/shelf-life.test.ts > estimateShelfLife (ICH Q1E) > returns 0 shelf life when already failing at t=0 1ms
 ✓ server/services/cmc/__tests__/shelf-life.test.ts > estimateShelfLife (ICH Q1E) > validates inputs 2ms
 ✓ server/services/cmc/__tests__/shelf-life.test.ts > estimateShelfLife (ICH Q1E) > is deterministic 2ms
 ✓ server/services/cmc/__tests__/shelf-life.test.ts > estimateShelfLife — the Q1E extrapolation limit > never proposes a shelf life beyond what Q1E allows from the observed period 1ms
 ✓ server/services/cmc/__tests__/shelf-life.test.ts > estimateShelfLife — the Q1E extrapolation limit > applies the 12-month ceiling once the study is longer than twelve months 1ms
 ✓ server/services/cmc/__tests__/shelf-life.test.ts > estimateShelfLife — the Q1E extrapolation limit > reports the crossing itself when it falls inside the allowance 0ms
 ✓ server/services/cmc/__tests__/shelf-life.test.ts > estimateShelfLife — the Q1E extrapolation limit > caps the exceeds-range case too, rather than reporting the search horizon 0ms
 ✓ server/services/cmc/__tests__/shelf-life.test.ts > estimateShelfLife — the Q1E extrapolation limit > a shelf life of zero is not raised by the allowance 1ms
 ✓ server/services/cmc/__tests__/shelf-life.test.ts > estimateShelfLife — the nominal (mean-line) crossing > reports where the fitted line itself meets the limit, from the unrounded fit 1ms
 ✓ server/services/cmc/__tests__/shelf-life.test.ts > estimateShelfLife — the nominal (mean-line) crossing > is null when the line heads away from the limit — no crossing exists to report 0ms
 ✓ server/services/cmc/__tests__/shelf-life.test.ts > estimateShelfLife — the nominal (mean-line) crossing > is zero, never negative, when the line is already past the limit at t = 0 1ms
 ✓ server/services/__tests__/module3Composer.stability-honesty.test.ts > module3Composer — stability conclusions are not fabricated > 3.2.S.7 does NOT assert "is stable" when the data shows OOS/degradation 5ms
 ✓ server/services/__tests__/module3Composer.stability-honesty.test.ts > module3Composer — stability conclusions are not fabricated > 3.2.S.7 defers (does not assert stability) when no results are present 1ms
 ✓ server/services/__tests__/module3Composer.stability-honesty.test.ts > module3Composer — stability conclusions are not fabricated > 3.2.P.8 does NOT claim stability studies/shelf-life when only comparability is present 2ms
 ✓ server/services/__tests__/module3Composer.stability-honesty.test.ts > module3Composer — stability conclusions are not fabricated > spec tables do not fabricate a "Per monograph" compendial basis when no method is recorded 1ms
 ✓ server/services/__tests__/module3Composer.stability-filed.test.ts > §3.2.P.8 states the drug product study, not the drug substance one > files the product study’s condition, time points and shelf life 2ms
 ✓ server/services/__tests__/module3Composer.stability-filed.test.ts > the recorded stability results are filed with the section that cites them > §3.2.P.8 tabulates every product pull point, and none of the substance’s 2ms
 ✓ server/services/__tests__/module3Composer.stability-filed.test.ts > the recorded stability results are filed with the section that cites them > §3.2.S.7 tabulates the substance’s pull points 1ms
 ✓ server/services/__tests__/module3Composer.stability-filed.test.ts > the recorded stability results are filed with the section that cites them > does not render a list of test names as a data matrix of one-cell rows 0ms
 ✓ server/services/__tests__/module3Composer.stability-filed.test.ts > the recorded stability results are filed with the section that cites them > never cites data "summarized above" that the section does not carry 0ms
 ✓ server/services/cmc/__tests__/acceptance-criterion.test.ts > parseAcceptanceCriterion — two-sided ranges > reads an unspaced hyphenated range as a range, not as a negative number 3ms
 ✓ server/services/cmc/__tests__/acceptance-criterion.test.ts > parseAcceptanceCriterion — two-sided ranges > reads every dash the pharmacopoeias and keyboards actually produce 2ms
 ✓ server/services/cmc/__tests__/acceptance-criterion.test.ts > parseAcceptanceCriterion — two-sided ranges > keeps a genuinely negative one-sided limit 1ms
 ✓ server/services/cmc/__tests__/acceptance-criterion.test.ts > parseAcceptanceCriterion — two-sided ranges > still reads the one-sided forms 0ms
 ✓ server/services/cmc/__tests__/acceptance-criterion.test.ts > parseAcceptanceCriterion — two-sided ranges > refuses a range whose bounds cannot be ordered 0ms
 ✓ server/services/cmc/__tests__/acceptance-criterion.test.ts > parseAcceptanceCriterion — two-sided ranges > refuses text with nothing numeric in it 0ms

 Test Files  13 passed (13)
      Tests  677 passed (677)
   Start at  05:40:51
   Duration  14.68s (transform 7.30s, setup 274ms, import 11.25s, tests 452ms, environment 1ms)


```

## Other shared criterion and composer callers: 4 files, 180 passed

```text
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

 RUN  v4.1.7 /workspace/scratch/bd36ee581acd/concept2cure

stdout | server/services/__tests__/cmcWriteThroughMappers.test.ts
{
  "timestamp": "2026-10-07T09:40:11.355Z",
  "level": "info",
  "message": "[database] Initializing PostgreSQL connection pool",
  "context": {}
}
{
  "timestamp": "2026-10-07T09:40:11.359Z",
  "level": "info",
  "message": "[database] RLS enforcement mode resolved",
  "context": {
    "mode": "off"
  }
}

stderr | server/services/__tests__/cmcWriteThroughMappers.test.ts
{
  "timestamp": "2026-10-07T09:40:11.360Z",
  "level": "warn",
  "message": "[database] Skipping database startup connectivity test (SKIP_DB_STARTUP_TEST=true)",
  "context": {}
}

stdout | server/services/__tests__/cmcWriteThroughMappers.test.ts
[database] Database connection successful

 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapDrugSubstancePayload — the §3.2.S register row (Drizzle camelCase, nested manufacturing_process json) > 3.2.S.1's required fields come from the row: name and MANUFACTURER 2ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapDrugSubstancePayload — the §3.2.S register row (Drizzle camelCase, nested manufacturing_process json) > 3.2.S.2's manufacturingRoute and processDescription come from the nested route 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapDrugSubstancePayload — the §3.2.S register row (Drizzle camelCase, nested manufacturing_process json) > identity and structured evidence survive; characterization is NOT invented from a structure string 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapDrugProductPayload — the §3.2.P register row (nested packaging/process json) > 3.2.P.1's required fields survive — composition as TEXT, because every consumer reads it with val() 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapDrugProductPayload — the §3.2.P register row (nested packaging/process json) > the TSE/BSE scan can SEE the ingredients: a gelatin composition surfaces as scannable text 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapDrugProductPayload — the §3.2.P register row (nested packaging/process json) > an EMPTY composition {} maps to null — it must never satisfy a required field 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapDrugProductPayload — the §3.2.P register row (nested packaging/process json) > the container closure, process description and site come out of their nests 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapDrugProductPayload — the §3.2.P register row (nested packaging/process json) > 3.2.P.3's formulation is the BATCH formula as TEXT — never the per-unit composition, never an object 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapAnalyticalMethodPayload — the register row (title/technique/status identity) > 3.2.P.5's methodName and 3.2.S.4's validationStatus come from the row's real identity 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapAnalyticalMethodPayload — the register row (title/technique/status identity) > the ICH Q2 record travels whole 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapSpecificationPayload — the raw snake_case quality_specifications row > 3.2.S.4's acceptanceCriteria AND 3.2.P.5's releaseCriteria are both fed by the recorded limits 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapSpecificationPayload — the raw snake_case quality_specifications row > has no fabricated validation status — that field is the method register’s to produce 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapSpecificationPayload — the raw snake_case quality_specifications row > the register’s real {release, shelf} shape splits into DISTINCT claims — shelf never folds under the release label 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapSpecificationPayload — the raw snake_case quality_specifications row > blank limits fabricate NOTHING: {release:"", shelf:""} maps releaseCriteria to null 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapSpecificationPayload — the raw snake_case quality_specifications row > a NON-drug-product spec never produces releaseCriteria — a substance's limits must not bleed into 3.2.P.5 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapBatchRecordPayload — the raw snake_case cmc_batch_records row (with parity + release columns) > 3.2.P.3's batchNumber survives, and the governed release decision travels 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapBatchRecordPayload — the raw snake_case cmc_batch_records row (with parity + release columns) > formulation is never invented — this table has no such column 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapChangeControlPayload — the register row (nested risk_assessment, filing category) > the change identity, assessed risk and ICH Q12 filing category all survive 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapProcessValidationPayload — the register row (CPPs/CQAs/control strategy json) > 3.2.S.2's processControls is the recorded control strategy's own sentence — text, for the narrative's val() read 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapProcessValidationPayload — the register row (CPPs/CQAs/control strategy json) > the validation record travels whole — CPPs, CQAs, batches, protocol 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapProcessValidationPayload — the register row (CPPs/CQAs/control strategy json) > emits the KEYS the composer's PV slots actually read — protocol, validationStatus, consecutiveBatches 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapProcessValidationPayload — the register row (CPPs/CQAs/control strategy json) > a control strategy is NOT rendered as a process description 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > register row → payload → composed section: the whole chain, no "[object Object]", no false claims > a gelatin composition reaches 3.2.P.1 readably and 3.2.A.3 can never call it animal-free 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > register row → payload → composed section: the whole chain, no "[object Object]", no false claims > an EMPTY composition {} leaves 3.2.P.1 honestly incomplete 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > register row → payload → composed section: the whole chain, no "[object Object]", no false claims > two methods in different lifecycle states are reported BY NAME in 3.2.S.4 — one status is never stamped on every row 2ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > register row → payload → composed section: the whole chain, no "[object Object]", no false claims > a drug-substance spec's limits never render as the drug product's 3.2.P.5 release criteria 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > register row → payload → composed section: the whole chain, no "[object Object]", no false claims > the PV register renders a real Process Validation Summary in 3.2.S.2 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > register row → payload → composed section: the whole chain, no "[object Object]", no false claims > the recorded route renders ONCE in 3.2.S.2 — never duplicated as its own process description 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > §3.2.P.5.4 / §3.2.S.4.4 — the recorded QC results are RENDERED, not just counted > a finished-product result appears in the drug product batch-analyses table with its real values 3ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > §3.2.P.5.4 / §3.2.S.4.4 — the recorded QC results are RENDERED, not just counted > an out-of-specification result is reported as recorded — never smoothed into a pass 2ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > §3.2.P.5.4 / §3.2.S.4.4 — the recorded QC results are RENDERED, not just counted > a finished-product result never files itself as DRUG SUBSTANCE batch analyses, and vice versa 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > §3.2.P.5.4 / §3.2.S.4.4 — the recorded QC results are RENDERED, not just counted > a cleaning-verification swab is not a batch analysis — not counted AND not rendered, on EITHER side 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > §3.2.P.5.4 / §3.2.S.4.4 — the recorded QC results are RENDERED, not just counted > a reference-standard qualification is not batch data either — it belongs to §3.2.S.5 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > §3.2.P.5.4 / §3.2.S.4.4 — the recorded QC results are RENDERED, not just counted > completeness and the rendered table agree: a finished-product result greens ONLY the drug product section 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > §3.2.P.5.4 / §3.2.S.4.4 — the recorded QC results are RENDERED, not just counted > a raw-material result greens ONLY the drug substance section — the mirror case 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > §3.2.P.5.4 / §3.2.S.4.4 — the recorded QC results are RENDERED, not just counted > a result with no MEASUREMENT never counts — empty object, empty array, blanks, observation-only 2ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > §3.2.P.5.4 / §3.2.S.4.4 — the recorded QC results are RENDERED, not just counted > no QC results means no table and no sentence — never an empty table implying testing happened 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > §3.2.P.3 — the change history and the governed release decision reach the document > the ICH Q12 change history renders with its filing category — never inferred, only as recorded 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > §3.2.P.3 — the change history and the governed release decision reach the document > an unclassified change says so rather than guessing a filing category 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > §3.2.P.3 — the change history and the governed release decision reach the document > the QP release decision — which batch, who released it, when — is stated 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > §3.2.P.3 — the change history and the governed release decision reach the document > the release facts travel TOGETHER — one batch's releaser is never attached to another batch 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > §3.2.P.3 — the change history and the governed release decision reach the document > free text with newlines and pipes cannot shatter the governed markdown table 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > §3.2.P.8 — the comparability rationale, not just its one-word status > the assessment, what changed, its outcome and reviewer all render 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapContainerClosurePayload — the cmc_container_closures row > carries the container, closure, materials, E&L and integrity data through 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapContainerClosurePayload — the cmc_container_closures row > emits ONLY the drug-product side keys for a drug-product system 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapContainerClosurePayload — the cmc_container_closures row > emits both sides for a system recorded as evidence for both 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapContainerClosurePayload — the cmc_container_closures row > reports no E&L study for a form that was opened and left blank 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapContainerClosurePayload — the cmc_container_closures row > names the studies on file for §3.2.P.2, from the drug-product side only 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapContainerClosurePayload — the cmc_container_closures row > does not complete a section from a system recorded without a suitability justification 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapReferenceStandardPayload — the cmc_reference_standards row > builds the description from the record own fields and keeps the CoA 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapReferenceStandardPayload — the cmc_reference_standards row > emits ONLY the drug-substance side keys for a drug-substance standard 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapReferenceStandardPayload — the cmc_reference_standards row > produces no description at all for a record with neither a name nor a code 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > the two new registers reach their sections, and only their own > completes §3.2.P.7 and §3.2.S.5 from the recorded registers 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > the two new registers reach their sections, and only their own > leaves §3.2.S.6 and §3.2.P.6 honestly incomplete — the other side has no record 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > the two new registers reach their sections, and only their own > renders the drug-product container closure system with its materials, E&L and compendial citations 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > the two new registers reach their sections, and only their own > renders the drug-substance reference standard with its characterisation 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > the two new registers reach their sections, and only their own > feeds the drug-product container closure studies to §3.2.P.2 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > the composed sections refuse to assert what the register does not say > does not report a standard as qualified because it exists 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > the composed sections refuse to assert what the register does not say > does not assert an E&L safety conclusion the study has not reached 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: a section is never assembled out of records that are each incomplete > a register of systems none of which is justified does not complete §3.2.P.7 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: a section is never assembled out of records that are each incomplete > one fully recorded system does complete it 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: a section is never assembled out of records that are each incomplete > the same rule holds for a reference standard: identity and CoA on ONE record 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: a section is never assembled out of records that are each incomplete > a complete secondary carton does not stand in for an undescribed primary container 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: the composed text never credits what the data does not carry > an E&L conclusion with no per-analyte results is reported as unsupported 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: the composed text never credits what the data does not carry > a component with no recorded supplier does not inherit the system supplier 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: the composed text never credits what the data does not carry > §3.3 names as primary only a standard the register records as primary 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: the composed text never credits what the data does not carry > §3.3 asserts no primacy at all when the register records none 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: the composed text never credits what the data does not carry > the recorded qualification dates reach both sections 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapImpurityProfilePayload — one row per impurity, assessed against ICH > carries the ICH M7 inputs as recorded and never defaults them 3ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapImpurityProfilePayload — one row per impurity, assessed against ICH > renders a ppm level as ppm, never as a percentage 2ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapImpurityProfilePayload — one row per impurity, assessed against ICH > says so when a level carries no unit at all, rather than assuming a percentage 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapImpurityProfilePayload — one row per impurity, assessed against ICH > renders EVERY impurity in the register, not the first one 2ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapImpurityProfilePayload — one row per impurity, assessed against ICH > states no threshold at all when no maximum daily dose is recorded 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapImpurityProfilePayload — one row per impurity, assessed against ICH > does not count an impurity below the reporting threshold as a reported impurity 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapImpurityProfilePayload — one row per impurity, assessed against ICH > forces the statement when an impurity is above the qualification threshold with no basis 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapImpurityProfilePayload — one row per impurity, assessed against ICH > names an impurity above the identification threshold with no structure as unidentified 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapImpurityProfilePayload — one row per impurity, assessed against ICH > refuses to apply a Q3A threshold to a class the guideline does not cover 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapImpurityProfilePayload — one row per impurity, assessed against ICH > assesses an elemental impurity under Q3D once its route is recorded 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapImpurityProfilePayload — one row per impurity, assessed against ICH > refuses an elemental impurity whose route was never recorded 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapImpurityProfilePayload — one row per impurity, assessed against ICH > never states a total impurity figure from whatever rows are on file 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapImpurityProfilePayload — one row per impurity, assessed against ICH > does not let a drug-substance impurity serve the drug-product section 5ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapImpurityProfilePayload — one row per impurity, assessed against ICH > reports the recorded maximum daily doses disagreeing rather than picking one 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapDissolutionProfilePayload — a profile files under ONE section > a development profile serves §3.2.P.2 and never §3.2.P.5 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapDissolutionProfilePayload — a profile files under ONE section > a release-specification profile serves §3.2.P.5 and never §3.2.P.2 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapDissolutionProfilePayload — a profile files under ONE section > renders the profile per timepoint with its variability and unit count 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapDissolutionProfilePayload — a profile files under ONE section > says a profile with no unit count supports no conformance and no comparison 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapDissolutionProfilePayload — a profile files under ONE section > does not carry a typed pass/fail into the dossier 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapDissolutionProfilePayload — a profile files under ONE section > never asserts f2 similarity from a rendered table 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapDissolutionProfilePayload — a profile files under ONE section > a release profile with no acceptance criterion does not complete §3.2.P.5 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: the impurity section claims only what it compared > says nothing was compared when every impurity was refused 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: the impurity section claims only what it compared > does not report a section complete over impurities it cannot assess 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: the impurity section claims only what it compared > reads two spellings of the same dose as the same dose 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: the impurity section claims only what it compared > prints the limit the comparison actually used, not only the guideline wording 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: the impurity section claims only what it compared > leaves a retired impurity out of the current profile 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: the impurity section claims only what it compared > a section whose only sources are retired says so, rather than "no data" 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: the impurity section claims only what it compared > states a recorded threshold that contradicts the guideline instead of replacing it silently 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: the dissolution section > renders the reference profile a comparison is against 2ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: the dissolution section > says how many profiles carry timepoints when only some do 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: the dissolution section > reports variability as unrecorded when the register stored an explicit null 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: the dissolution section > leaves a retired profile out of the section, and says why it is empty 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapMaterialSpecPayload — one register, two source types > renders EVERY excipient, not the first one 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapMaterialSpecPayload — one register, two source types > a raw material files under §3.2.S.2.3, not the drug product excipient section 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapMaterialSpecPayload — one register, two source types > says when an excipient records neither a specification nor a monograph 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapMaterialSpecPayload — one register, two source types > names a novel excipient recorded without a justification 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapMaterialSpecPayload — one register, two source types > carries the recorded origin without inferring one 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapFormulationRecordPayload — one current version, rendered > renders the CURRENT formulation, not whichever arrived first 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapFormulationRecordPayload — one current version, rendered > refuses to elect a current formulation when none is marked current 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapFormulationRecordPayload — one current version, rendered > says which composition governs is not established when two claim to be current 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapFormulationRecordPayload — one current version, rendered > names an overage recorded without a justification 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapManufacturingProcessPayload — the process, not one sentence about it > orders the steps by their recorded number, not by array position 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapManufacturingProcessPayload — the process, not one sentence about it > keeps the recorded order when no step carries a number 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapManufacturingProcessPayload — the process, not one sentence about it > collects in-process controls from the steps as well as the process level 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapManufacturingProcessPayload — the process, not one sentence about it > scopes to the recorded side: a drug substance process cannot complete §3.2.P.3 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapManufacturingProcessPayload — the process, not one sentence about it > does not report a process complete when it records no in-process control 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapManufacturingProcessPayload — the process, not one sentence about it > §3.2.S.2 is not complete on a name and steps split across two records 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapManufacturingProcessPayload — the process, not one sentence about it > renders the steps, the CPPs and the equipment into §3.2.S.2 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapManufacturingProcessPayload — the process, not one sentence about it > names a critical parameter recorded without a proven range instead of dropping it 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapManufacturingProcessPayload — the process, not one sentence about it > a drug-product process does not appear in §3.2.S.2 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapManufacturingProcessPayload — the process, not one sentence about it > leaves a retired process out of the section 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapManufacturingProcessPayload — the process, not one sentence about it > emits §3.2.P.2's manufacturingProcessDev from the recorded process development, drug-product side only 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapManufacturingProcessPayload — the process, not one sentence about it > never emits a placeholder for manufacturingProcessDev when no development was recorded 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapManufacturingProcessPayload — the process, not one sentence about it > §3.2.P.3 renders the register rather than the drug product form when both exist 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapManufacturingProcessPayload — the process, not one sentence about it > still renders the drug product form list when no process is recorded 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapCharacterizationStudyPayload — one study answers ONE of the three questions > a structural study answers structuralElucidation and nothing else 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapCharacterizationStudyPayload — one study answers ONE of the three questions > three studies of one type do not complete the section 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapCharacterizationStudyPayload — one study answers ONE of the three questions > three studies of three types answer all three 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapCharacterizationStudyPayload — one study answers ONE of the three questions > a study with no result and no conclusion establishes nothing 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapCharacterizationStudyPayload — one study answers ONE of the three questions > reports a number whose unit was never recorded as such 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapCharacterizationStudyPayload — one study answers ONE of the three questions > a drug-product study does not answer the drug substance section 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapCharacterizationStudyPayload — one study answers ONE of the three questions > leaves a retired study out of the section 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapCharacterizationStudyPayload — one study answers ONE of the three questions > renders the supporting data attributed to its own study 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: what the register data is allowed to CLAIM > §3.2.P.3 does not deny the in-process controls it prints 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: what the register data is allowed to CLAIM > every recorded in-process control reaches a table, not just the first process 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: what the register data is allowed to CLAIM > a signed process validation reaches the composed section 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: what the register data is allowed to CLAIM > a drug-product characterisation study reaches §3.2.P.2 rather than nothing 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: what the register data is allowed to CLAIM > §3.2.P.1 is not complete over a formulation the section says does not govern 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: what the register data is allowed to CLAIM > §3.2.P.4 is not complete over an excipient with no recorded way of being tested 2ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: what the register data is allowed to CLAIM > §3.2.P.4 does not claim every excipient is controlled when one is not 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapFormulationRecordPayload — §3.2.P.2.2 has a producer > emits formulationDevelopment from the recorded rationale, and null when none is recorded 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > review: the stability mapper carries the condition array beside the joined string > emits storageConditions as an array so a multi-condition study can be told apart 8ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > §3.2.A.3 joins a formulation component to the excipient register row of the same name > a bovine gelatin shell whose CEP is on the register is reported CERTIFIED, once, and the section is complete 5ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > §3.2.A.3 joins a formulation component to the excipient register row of the same name > the join fills a blank origin and role from the register row, and never overwrites what the formulation recorded 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > §3.2.A.3 joins a formulation component to the excipient register row of the same name > a register row with NO certificate does not certify the formulation component, and the section stays incomplete 1ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > §3.2.A.3 joins a formulation component to the excipient register row of the same name > a register excipient the formulation does not name is still listed on its own 2ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapStabilityPayload — the scope the register captures reaches the composer > emits the scope and the side-scoped keys 0ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapStabilityPayload — the scope the register captures reaches the composer > a DRUG SUBSTANCE study does not complete §3.2.P.8, and vice versa 2ms
 ✓ server/services/__tests__/cmcWriteThroughMappers.test.ts > mapStabilityPayload — the scope the register captures reaches the composer > the drug product study does not set the drug substance section’s condition 1ms
 ✓ server/services/__tests__/module3Composer.test.ts > module3Composer > computes completeness and missing inputs deterministically 18ms
 ✓ server/services/__tests__/module3Composer.test.ts > module3Composer > maps impacted sections for changed source type 3ms
 ✓ server/services/__tests__/module3Composer.test.ts > module3Composer > marks the appendices (3.2.A.*) that require a changed source type impacted too 1ms
 ✓ server/services/__tests__/module3Composer.test.ts > 3.2.P.2 dissolution tables — the Batch column is a batch number or nothing > never prints the product name under "Batch" when no batch number was recorded 1ms
 ✓ server/services/__tests__/module3Composer.test.ts > renderComposedSectionMarkdown > is the label + narrative + rendered tables the bridge used to concatenate inline 1ms
 ✓ server/services/__tests__/module3Composer.test.ts > renderComposedSectionMarkdown > emits no table block and no trailing blank tail when the section composes no tables 2ms
 ✓ server/services/__tests__/module3Composer.test.ts > §3.2.P.8 — a first IND can file its stability section > does not require a comparability status no first-in-human programme can have 4ms
 ✓ server/services/__tests__/module3Composer.test.ts > §3.2.P.8 — a first IND can file its stability section > DOES require it once a comparability assessment is on file 1ms
 ✓ server/services/__tests__/module3Composer.test.ts > §3.2.P.8 — a first IND can file its stability section > is complete when the assessment on file states its status 1ms
 ✓ server/services/__tests__/module3Composer.test.ts > §3.2.P.8 — a first IND can file its stability section > still refuses when the shelf-life claim itself is missing 3ms
 ✓ server/services/cmc/__tests__/recorded-capability.test.ts > assessRecordedCapability — one series per test > assesses a test over its batches and reports the indices 6ms
 ✓ server/services/cmc/__tests__/recorded-capability.test.ts > assessRecordedCapability — one series per test > keeps each test in its own series, in first-seen order 4ms
 ✓ server/services/cmc/__tests__/recorded-capability.test.ts > assessRecordedCapability — one series per test > REFUSES a test whose batches were judged against different criteria — it does not average them 1ms
 ✓ server/services/cmc/__tests__/recorded-capability.test.ts > assessRecordedCapability — one series per test > carries the engine’s own refusal — five batches is not a capability estimate 1ms
 ✓ server/services/cmc/__tests__/recorded-capability.test.ts > assessRecordedCapability — one series per test > skips a row with no test method rather than opening an unnamed series 0ms
 ✓ server/services/cmc/__tests__/recorded-capability.test.ts > assessRecordedCapability — one series per test > falls back to the sample id when a result carries no batch number 0ms
 ✓ server/services/cmc/__tests__/recorded-capability.test.ts > isBatchAnalysisFor — one gate, shared with the mapper and the composer > honours the mapper’s decision over the sample type 4ms
 ✓ server/services/cmc/__tests__/recorded-capability.test.ts > isBatchAnalysisFor — one gate, shared with the mapper and the composer > refuses a cleaning swab and a reference-standard qualification on either side 0ms
 ✓ server/services/cmc/__tests__/recorded-capability.test.ts > isBatchAnalysisFor — one gate, shared with the mapper and the composer > classifies a payload written before batchAnalysisSide existed by its sample type 0ms
 ✓ server/services/cmc/__tests__/recorded-capability.test.ts > isBatchAnalysisFor — one gate, shared with the mapper and the composer > keeps a finished-product result out of the drug substance’s capability series 2ms
 ✓ server/services/cmc/__tests__/recorded-capability.test.ts > what a series may NOT quietly absorb > does not read an unrecorded result as a measured 0.0 1ms
 ✓ server/services/cmc/__tests__/recorded-capability.test.ts > what a series may NOT quietly absorb > does not judge a result against a criterion recorded on a DIFFERENT batch 0ms
 ✓ server/services/cmc/__tests__/recorded-capability.test.ts > what a series may NOT quietly absorb > distinguishes "criteria disagree" from "no criterion was recorded" 0ms
 ✓ server/services/cmc/__tests__/recorded-capability.test.ts > the route, the tool and the section read the same set > excludes a RETIRED result, as every composed section does 2ms
 ✓ server/services/cmc/__tests__/process-capability.test.ts > assessProcessCapability — the indices > computes Pp/Ppk from the overall sd and Cp/Cpk from the moving-range sd on a two-sided criterion 4ms
 ✓ server/services/cmc/__tests__/process-capability.test.ts > assessProcessCapability — the indices > reports the one-sided index only, on the side the criterion has 1ms
 ✓ server/services/cmc/__tests__/process-capability.test.ts > assessProcessCapability — the indices > names the batches outside the specification and does not pretend capability over them 0ms
 ✓ server/services/cmc/__tests__/process-capability.test.ts > assessProcessCapability — the indices > grades capability against the conventional 1.33 and 1.0 thresholds 0ms
 ✓ server/services/cmc/__tests__/process-capability.test.ts > assessProcessCapability — the indices > marks an estimate on fewer than 25 batches as preliminary, and says so 1ms
 ✓ server/services/cmc/__tests__/process-capability.test.ts > assessProcessCapability — refusals > refuses fewer than six batches rather than reporting an index over noise 0ms
 ✓ server/services/cmc/__tests__/process-capability.test.ts > assessProcessCapability — refusals > refuses without a criterion, and says the specification is what is missing 0ms
 ✓ server/services/cmc/__tests__/process-capability.test.ts > assessProcessCapability — refusals > refuses a series with no variation: a capability index over zero sigma is not a number 0ms
 ✓ server/services/cmc/__tests__/process-capability.test.ts > assessProcessCapability — refusals > drops non-numeric results and names them, refusing if too few remain 0ms

 Test Files  4 passed (4)
      Tests  180 passed (180)
   Start at  05:40:06
   Duration  8.35s (transform 3.22s, setup 292ms, import 5.41s, tests 199ms, environment 1ms)


```

## Final qualification file: 556 passed

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
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > recorded numeric lexemes > refuses an inexact or unsupported value "" 1ms
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
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1e-4EU/mL 1ms
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
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1,000EU/mL 0ms
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
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1_000% 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1_000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1_000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1 000% 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1 000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1 000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1 000 1ms
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
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1 000mg 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1 000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1 000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1 000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1 000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1 000 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1 000% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1 000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1 000EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1 000 10ms
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
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1..2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1..2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1..2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1..2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT1...2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NMT 1...2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT1...2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: NLT 1...2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max1...2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: max 1...2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min1...2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min 1...2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >=1...2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: >= 1...2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <=1...2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1...2 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1...2% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1...2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: <= 1...2EU/mL 0ms
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
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > refuses unsupported numeric prefixes through operator and unit boundaries: min-.5EU/mL 0ms
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
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT1e-4% 2ms
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
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > never extracts another limit from NMT1...2mg 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NLT -5.0 °C 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion <= 2mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion 95.0-105.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion 95.0 to 105.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion maximum 2.0 EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% (per ICH Q1E) 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT 2.0% (see 3.2.S.4) 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT2.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion maximum2.0 EU/mL 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion not more than2.0% 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion -5.0--1.0 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT1000mg 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT2.0mg (see 3.2.S.4) 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > unsupported criterion numeric notation is refused before choosing a candidate > retains established ordinary criterion NMT2EU/mL 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for <0.1% despite sufficient other points 46ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 1,000 despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for 12abc despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses all recorded fitting paths for BLQ despite sufficient other points 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > retains an independent valid series but withholds an incomplete programme shelf life 8ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > uses exponent results and month labels identically to the equivalent numeric observations 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > does not discard a present result with an absent time while fitting the other six 0ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > refuses unsupported criterion notation even after valid criteria in every fitted path 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > an invalid measured observation cannot be omitted before fitting > retains genuine missing results in recorded counts while allowing the complete observations to fit 2ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains <0.1% raw, without presenting an exact conformance or trend 16ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 1,000 raw, without presenting an exact conformance or trend 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > retains 12abc raw, without presenting an exact conformance or trend 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > compares an exact exponent result at its real magnitude 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > does not compare a supported result against an unsupported exponent criterion 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > reports readable comparisons but withholds stability support when another recorded payload is unreadable 1ms
 ✓ server/services/cmc/__tests__/recorded-numeric-qualification.test.ts > Module 3 stability and QC use the same complete numeric evidence > preserves value comparisons but withholds stability support for an unresolved measured observation time 1ms

 Test Files  1 passed (1)
      Tests  556 passed (556)
   Start at  05:41:33
   Duration  1.38s (transform 792ms, setup 207ms, import 647ms, tests 170ms, environment 0ms)


```

## Final scoped lint: 0 errors, 26 existing warnings

```text
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

/workspace/scratch/bd36ee581acd/concept2cure/server/services/cmc/recorded-stability.ts
  368:8  warning  Async function 'assessRecordedPoolability' has too many lines (207). Maximum allowed is 100  max-lines-per-function
  368:8  warning  Async function 'assessRecordedPoolability' has a complexity of 37. Maximum allowed is 15     complexity
  679:8  warning  Async function 'estimateRecordedShelfLife' has too many lines (141). Maximum allowed is 100  max-lines-per-function
  679:8  warning  Async function 'estimateRecordedShelfLife' has a complexity of 30. Maximum allowed is 15     complexity
  746:1  warning  File has too many lines (676). Maximum allowed is 500                                        max-lines

/workspace/scratch/bd36ee581acd/concept2cure/server/services/cmc/stability-trending.ts
  149:8  warning  Function 'assessTrend' has too many lines (121). Maximum allowed is 100  max-lines-per-function
  149:8  warning  Function 'assessTrend' has a complexity of 27. Maximum allowed is 15     complexity

/workspace/scratch/bd36ee581acd/concept2cure/server/services/module3Composer.ts
   579:10  warning  'readStabilitySignal' is defined but never used                                      @typescript-eslint/no-unused-vars
   672:10  warning  'stabilityScopeUnrecorded' is defined but never used                                 @typescript-eslint/no-unused-vars
   794:1   warning  File has too many lines (2314). Maximum allowed is 500                               max-lines
   826:1   warning  Function 'qcResultVerdict' has a complexity of 20. Maximum allowed is 15             complexity
  1034:1   warning  Function 'referenceStandardSection' has a complexity of 20. Maximum allowed is 15    complexity
  1142:1   warning  Function 'containerClosureSection' has too many lines (167). Maximum allowed is 100  max-lines-per-function
  1142:1   warning  Function 'containerClosureSection' has a complexity of 61. Maximum allowed is 15     complexity
  1385:1   warning  Function 'impurityRendering' has too many lines (164). Maximum allowed is 100        max-lines-per-function
  1385:1   warning  Function 'impurityRendering' has a complexity of 22. Maximum allowed is 15           complexity
  1426:35  warning  Arrow function has a complexity of 24. Maximum allowed is 15                         complexity
  1625:1   warning  Function 'dissolutionRendering' has a complexity of 51. Maximum allowed is 15        complexity
  1964:1   warning  Function 'processRendering' has too many lines (139). Maximum allowed is 100         max-lines-per-function
  1964:1   warning  Function 'processRendering' has a complexity of 86. Maximum allowed is 15            complexity
  2140:1   warning  Function 'characterizationRendering' has a complexity of 16. Maximum allowed is 15   complexity
  2246:3   warning  Method '3.2.S.1' has a complexity of 20. Maximum allowed is 15                       complexity
  2389:3   warning  Method '3.2.S.4' has a complexity of 17. Maximum allowed is 15                       complexity
  2611:3   warning  Method '3.2.P.3' has too many lines (105). Maximum allowed is 100                    max-lines-per-function
  2611:3   warning  Method '3.2.P.3' has a complexity of 40. Maximum allowed is 15                       complexity
  2748:3   warning  Method '3.2.P.5' has a complexity of 24. Maximum allowed is 15                       complexity

✖ 26 problems (0 errors, 26 warnings)


```

## Baseline recorded-stability lint: 0 errors, 5 warnings

```text
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

/workspace/scratch/bd36ee581acd/concept2cure/server/services/cmc/recorded-stability.ts
  294:8  warning  Async function 'assessRecordedPoolability' has too many lines (179). Maximum allowed is 100  max-lines-per-function
  294:8  warning  Async function 'assessRecordedPoolability' has a complexity of 32. Maximum allowed is 15     complexity
  576:8  warning  Async function 'estimateRecordedShelfLife' has too many lines (124). Maximum allowed is 100  max-lines-per-function
  576:8  warning  Async function 'estimateRecordedShelfLife' has a complexity of 25. Maximum allowed is 15     complexity
  758:1  warning  File has too many lines (571). Maximum allowed is 500                                        max-lines

✖ 5 problems (0 errors, 5 warnings)


```

## Baseline stability-trending lint: 0 errors, 2 warnings

```text
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

/workspace/scratch/bd36ee581acd/concept2cure/server/services/cmc/stability-trending.ts
  147:8  warning  Function 'assessTrend' has too many lines (121). Maximum allowed is 100  max-lines-per-function
  147:8  warning  Function 'assessTrend' has a complexity of 27. Maximum allowed is 15     complexity

✖ 2 problems (0 errors, 2 warnings)


```

## Baseline Module3 composer lint: 0 errors, 19 warnings

```text
npm warn Unknown env config "http-proxy". This will stop working in the next major version of npm.

/workspace/scratch/bd36ee581acd/concept2cure/server/services/module3Composer.ts
   568:10  warning  'readStabilitySignal' is defined but never used                                      @typescript-eslint/no-unused-vars
   661:10  warning  'stabilityScopeUnrecorded' is defined but never used                                 @typescript-eslint/no-unused-vars
   794:1   warning  File has too many lines (2303). Maximum allowed is 500                               max-lines
   815:1   warning  Function 'qcResultVerdict' has a complexity of 20. Maximum allowed is 15             complexity
  1023:1   warning  Function 'referenceStandardSection' has a complexity of 20. Maximum allowed is 15    complexity
  1131:1   warning  Function 'containerClosureSection' has too many lines (167). Maximum allowed is 100  max-lines-per-function
  1131:1   warning  Function 'containerClosureSection' has a complexity of 61. Maximum allowed is 15     complexity
  1374:1   warning  Function 'impurityRendering' has too many lines (164). Maximum allowed is 100        max-lines-per-function
  1374:1   warning  Function 'impurityRendering' has a complexity of 22. Maximum allowed is 15           complexity
  1415:35  warning  Arrow function has a complexity of 24. Maximum allowed is 15                         complexity
  1614:1   warning  Function 'dissolutionRendering' has a complexity of 51. Maximum allowed is 15        complexity
  1953:1   warning  Function 'processRendering' has too many lines (139). Maximum allowed is 100         max-lines-per-function
  1953:1   warning  Function 'processRendering' has a complexity of 86. Maximum allowed is 15            complexity
  2129:1   warning  Function 'characterizationRendering' has a complexity of 16. Maximum allowed is 15   complexity
  2235:3   warning  Method '3.2.S.1' has a complexity of 20. Maximum allowed is 15                       complexity
  2378:3   warning  Method '3.2.S.4' has a complexity of 17. Maximum allowed is 15                       complexity
  2600:3   warning  Method '3.2.P.3' has too many lines (105). Maximum allowed is 100                    max-lines-per-function
  2600:3   warning  Method '3.2.P.3' has a complexity of 40. Maximum allowed is 15                       complexity
  2737:3   warning  Method '3.2.P.5' has a complexity of 24. Maximum allowed is 15                       complexity

✖ 19 problems (0 errors, 19 warnings)


```
