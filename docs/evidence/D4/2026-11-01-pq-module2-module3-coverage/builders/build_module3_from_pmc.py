"""Build CMC / Module 3 gold-bank tasks from verbatim PMC full-text paragraphs.

Edits allowed on the source text, and the only ones made here:
  * empty citation brackets left by the PMC export ("[]", "[,]", "[,,]") are dropped;
  * figure/table call-out remnants ("()", "as demonstrated in", "presented in.") are
    dropped, each one named explicitly in `drop` and asserted present before removal;
  * whitespace is normalised (paragraphs joined with one space);
  * an excerpt may stop at a sentence boundary inside its last paragraph (`end`).
Nothing is reworded. Every expected field value is asserted to be in the input.
"""
import json, re, sys

SRC, OUT = sys.argv[1], sys.argv[2]
RETRIEVED = '2026-11-01'

META = {
  'PMC13414520': dict(pmid='42515747', doi='10.3390/ph19071066', journal='Pharmaceuticals (Basel)', year='2026',
                      title='Development and Optimisation of a Stability-Indicating Analytical Method for Itraconazole in Drug Product by High-Performance Liquid Chromatography Using a QbD Approach'),
  'PMC12114650': dict(pmid='40430439', doi='10.3390/ph18050619', journal='Pharmaceuticals (Basel)', year='2025',
                      title='Developing a Chromatographic Method for Quantifying Latanoprost and Related Substances in Glaucoma Treatments'),
  'PMC11768339': dict(pmid='39861185', doi='10.3390/ph18010124', journal='Pharmaceuticals (Basel)', year='2025',
                      title='The Stability-Indicating Ultra High-Performance Liquid Chromatography with Diode Array Detector and Tandem Mass Spectrometry Method Applied for the Forced Degradation Study of Ritlecitinib: An Appraisal of Green and Blue Metrics'),
  'PMC9311562':  dict(pmid='35884151', doi='10.3390/antibiotics11070897', journal='Antibiotics (Basel)', year='2022',
                      title='Forced Degradation Studies and Development and Validation of HPLC-UV Method for the Analysis of Velpatasvir Copovidone Solid Dispersion'),
  'PMC10221331': dict(pmid='37242646', doi='10.3390/pharmaceutics15051404', journal='Pharmaceutics', year='2023',
                      title='Cistracurium Besylate 10 mg/mL Solution Compounded in a Hospital Pharmacy to Prevent Drug Shortages: A Stability Study Involving Four Degradation Products'),
  'PMC8538641':  dict(pmid='34683893', doi='10.3390/pharmaceutics13101600', journal='Pharmaceutics', year='2021',
                      title='Solid-State Stability Profiling of Ramipril to Optimize Its Quality Efficiency and Safety'),
  'PMC10819580': dict(pmid='38256876', doi='10.3390/ph17010042', journal='Pharmaceuticals (Basel)', year='2023',
                      title='Potency and Powder X-ray Diffraction (PXRD) Evaluation of Levothyroxine Sodium Tablets under Ambient, Accelerated, and Stressed Conditions'),
  'PMC13516646': dict(pmid='42654088', doi='10.3390/pharmaceutics18080971', journal='Pharmaceutics', year='2026',
                      title='Stability Study of Meropenem 50 mg/mL Eye Drops in Polypropylene Dropper Bottles'),
  'PMC5198025':  dict(pmid='27754407', doi='10.3390/scipharm84040654', journal='Scientia Pharmaceutica', year='2016',
                      title='Development and Validation of Miglitol and Its Impurities by RP-HPLC and Characterization Using Mass Spectrometry Techniques'),
  'PMC13516048': dict(pmid='42653752', doi='10.3390/ph19081255', journal='Pharmaceuticals (Basel)', year='2026',
                      title='AQbD-Driven RP-HPLC Method for Rapid Dissolution Monitoring of Amiodarone Hydrochloride Tablets Without Sample Dilution'),
  'PMC9739382':  dict(pmid='36499947', doi='10.3390/ma15238451', journal='Materials (Basel)', year='2022',
                      title='Dissolution Assay of Bupropion/Naltrexone Hydrochloride Salts of Bilayer Composition Tablets Following the Development and Validation of a Novel HPLC Method'),
}
LICENSE = 'CC BY 4.0'

_paras = {}
def paras(pmc):
    if pmc not in _paras:
        a = json.load(open(f'{SRC}/{pmc}.json'))
        _paras[pmc] = [p for p in a['full_text'].split('\n') if p.strip()]
    return _paras[pmc]

def excerpt(pmc, idx, drop=(), end=None, start=None):
    text = ' '.join(paras(pmc)[i].strip() for i in idx)
    for d in drop:
        assert d in text, f'{pmc} {idx}: call-out remnant not found: {d!r}'
        text = text.replace(d, '', 1) if not isinstance(d, tuple) else text
    if start is not None:
        assert text.startswith(start), f'{pmc}: start {start!r}'
        text = text[len(start):]
    if end is not None:
        k = text.find(end)
        assert k >= 0, f'{pmc}: end marker not found {end!r}'
        text = text[:k + len(end)]
    # empty citation brackets from the PMC export
    text = re.sub(r'\s*\[[,\s]*\]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def src(pmc, section):
    m = META[pmc]
    return dict(pmid=m['pmid'], pmcid=pmc, doi=m['doi'], title=m['title'], journal=m['journal'],
                year=m['year'], license=LICENSE, section=section, retrieved=RETRIEVED)

tasks = []
def gen(id, pmc, idx, section, required, forbidden, tags, **kw):
    tasks.append(dict(id=id, docType='module-3-quality', taskType='generation',
                      input=excerpt(pmc, idx, **kw), requiredSections=required,
                      forbiddenPatterns=forbidden, tags=['module-3', 'cmc', 'small-molecule'] + tags,
                      source=src(pmc, section)))

def ext(id, pmc, idx, section, fields, tags, **kw):
    tasks.append(dict(id=id, docType='module-3-quality', taskType='extraction',
                      input=excerpt(pmc, idx, **kw), expectedFields=fields,
                      tags=['module-3', 'cmc', 'small-molecule'] + tags,
                      source=src(pmc, section)))

# ───────────────────────────── generation (12) ─────────────────────────────
gen('m3-itraconazole-stress-mass-balance-generate', 'PMC13414520', [76, 77, 78],
    '2. Results and Discussion > 2.4. Selectivity Study of the Optimised Analytical Method (stress study results, paragraphs 4-6)',
    ['stress conditions', 'oxidative', 'mass balance', 'degradation products', 'stability studies'],
    ['mass balance of 100%', 'no degradation under any', 'free of all impurities', 'stable under all conditions'],
    ['3.2.P.5.5', '3.2.P.5.3', 'forced-degradation', 'mass-balance', 'itraconazole', 'tablets'],
    drop=[' listed in'])

gen('m3-latanoprost-forced-degradation-generate', 'PMC12114650', [16, 17],
    '2. Results > 2.2. Method Validation > 2.2.2. Specificity and Stability-Indicating Power (paragraphs 2-3, second truncated)',
    ['forced degradation', 'alkaline hydrolysis', 'mass balance', 'impurity H', 'latanoprost acid'],
    ['free of all impurities', 'mass balance of 100%', 'stable under all conditions', 'fully validated for all'],
    ['3.2.P.5.5', '3.2.P.5.3', 'forced-degradation', 'impurities', 'latanoprost', 'ophthalmic-solution'],
    drop=[' The results are presented in. The chromatograms obtained during the degradation studies are included in the.'],
    end='into a pharmacologically active moiety.')

gen('m3-ritlecitinib-validation-generate', 'PMC11768339', [20, 21, 22],
    '2. Results and Discussion > 2.2. Method Validation (paragraphs 3-5)',
    ['LOD', 'LOQ', 'repeatability', 'intermediate precision', 'accuracy'],
    ['fully validated for all', 'robustness was demonstrated', 'zero variability', '100% recovery'],
    ['3.2.S.4.3', 'validation', 'ich-q2', 'ritlecitinib', 'drug-substance'],
    drop=[' ()', ' (,)', ' ()'])

gen('m3-ritlecitinib-forced-degradation-generate', 'PMC11768339', [27, 28, 29],
    '2. Results and Discussion > 2.3. Forced Degradation Study (paragraphs 3-5)',
    ['basic hydrolysis', 'oxidative', 'acidic', 'thermal', 'photolytic'],
    ['stable under all conditions', 'no degradation under any', 'free of all impurities', 'stable indefinitely'],
    ['3.2.S.7.3', '3.2.S.3.2', 'forced-degradation', 'ritlecitinib', 'drug-substance'])

gen('m3-velpatasvir-forced-degradation-generate', 'PMC9311562', [31],
    '3. Results and Discussion > 3.7. Forced Degradation Studies (paragraph 1)',
    ['alkaline', 'oxidative', 'photolytic', 'dry heat', 'humidity'],
    ['stable under all conditions', 'not photolabile', 'no degradation under any', 'light protection is not required'],
    ['3.2.S.7.3', '3.2.P.5.5', 'forced-degradation', 'photostability', 'velpatasvir', 'solid-dispersion'],
    drop=[' (and)', ' ()'])

gen('m3-miglitol-forced-degradation-generate', 'PMC5198025', [52],
    '3. Results and Discussion > 3.2. Results of Forced Degradation Studies',
    ['oxidative', 'photolytic', 'thermal', 'peak purity', 'relative retention time'],
    ['stable under all stress conditions', 'structure was confirmed', 'structurally identified as', 'free of all impurities'],
    ['3.2.S.7.3', '3.2.S.4.3', 'forced-degradation', 'specificity', 'miglitol', 'drug-substance'],
    drop=[' (,,,,,,and)', ' The summary of the forced degradation is captured in.'])

gen('m3-ramipril-degradation-impurities-generate', 'PMC8538641', [88],
    '4. Discussion > 4.7. Degradants',
    ['hydrolysis', 'intramolecular', 'ramiprilat', 'diketopiperazine', 'toxicological'],
    ['has been qualified', 'no safety concern', 'free of all impurities', 'proven non-toxic'],
    ['3.2.S.3.2', '3.2.S.7.3', 'impurities', 'degradation-pathway', 'hplc-ms', 'ramipril'],
    drop=['; this is demonstrated in', ' ()', ' (and)'])

gen('m3-cisatracurium-shelf-life-generate', 'PMC10221331', [72, 73, 74, 75],
    '3. Results and Discussion > 3.3.3. The HPLC-UV Analysis of Compounded Ampoules (paragraphs 2-5)',
    ['shelf life', 'storage', 'acceptance', 'overage', 'ICH Q1E'],
    ['stable indefinitely', 'no loss of potency', 'guaranteed shelf life', 'stable at room temperature'],
    ['3.2.P.8.1', '3.2.P.8.3', 'stability', 'shelf-life', 'ich-q1e', 'cisatracurium', 'injection'],
    drop=[' ()', ' ()'])

gen('m3-levothyroxine-accelerated-stability-generate', 'PMC10819580', [30],
    '3. Discussion > 3.1. Possible Role of Excipients on Levothyroxine Tablets Stability (paragraph 1)',
    ['accelerated', 'potency', 'assay limits', 'desiccant', 'stress'],
    ['no loss of potency', 'stable under all conditions', 'guaranteed shelf life', 'stable indefinitely'],
    ['3.2.P.8.3', '3.2.P.8.1', 'stability', 'accelerated', 'levothyroxine', 'tablets'])

gen('m3-meropenem-in-use-stability-generate', 'PMC13516646', [35, 36, 37],
    '3. Results > 3.2.2. Refrigerated Conditions (paragraphs 2-4)',
    ['pH', 'osmolality', 'color', 'microbiological', 'refrigeration'],
    ['chemically stable for up to 7 days', 'no color change', 'stable indefinitely', 'no change in appearance'],
    ['3.2.P.8.3', '3.2.P.8.1', 'stability', 'in-use', 'microbiological', 'meropenem', 'ophthalmic-solution'],
    drop=[' ()'])

gen('m3-amiodarone-dissolution-accuracy-generate', 'PMC13516048', [35],
    '2. Results and Discussion > 2.4. Method Validation > 2.4.5. Accuracy',
    ['accuracy', 'recovery', 'placebo', 'polysorbate 80', 'acceptance criteria'],
    ['fully validated for all', 'validated for all dissolution media', 'zero variability', '100% recovery at all'],
    ['3.2.P.5.3', 'validation', 'accuracy', 'dissolution', 'amiodarone', 'tablets'],
    drop=[' ()'])

gen('m3-bupropion-naltrexone-release-generate', 'PMC9739382', [59],
    '3. Results and Discussion > 3.5. Dissolution Study Results (paragraph 2)',
    ['modified release', 'release profile', 'solubility', 'naltrexone', 'bupropion'],
    ['bioequivalence was demonstrated', 'zero-order', '100% released', 'complete release within'],
    ['3.2.P.2.2', 'dissolution', 'modified-release', 'bupropion', 'naltrexone', 'bilayer-tablets'],
    start='From, ', drop=[' ()'])

# ───────────────────────────── extraction (12) ─────────────────────────────
ext('m3-itraconazole-hplc-conditions-extract', 'PMC13414520', [115, 116],
    '4. Conclusions (paragraphs 1-2)',
    {'column': 'Poroshell EC-C18',
     'flow_rate': '0.6 mL/min',
     'detection_wavelength': '260 nm',
     'column_temperature': '50 °C',
     'assay_working_range': '70 to 130 µg/mL',
     'related_substances_working_range': '0.15 to 1.30 µg/mL'},
    ['3.2.P.5.2', '3.2.P.5.3', 'hplc', 'itraconazole', 'distractor'],
    drop=[', as listed in,'])

ext('m3-latanoprost-lod-loq-criteria-extract', 'PMC12114650', [49, 50],
    '2. Results > 2.2. Method Validation > 2.2.5. Limit of Detection and Quantification (paragraphs 3-4)',
    {'lod_acceptance_criterion': 'signal-to-noise ratio of no less than 3',
     'loq_acceptance_criterion': 'signal-to-noise ratio of no less than 10',
     'rsd_acceptance_criterion': 'no more than 5.0%',
     'verification_concentrations': '0.025 µg/mL, 0.035 µg/mL, and 0.050 µg/mL',
     'reporting_threshold': '0.050 µg/mL'},
    ['3.2.P.5.3', 'validation', 'lod-loq', 'reporting-threshold', 'latanoprost', 'distractor'],
    drop=['presents the experimentally determined limits.'])

ext('m3-velpatasvir-stress-conditions-extract', 'PMC9311562', [12],
    '2. Experimental > 2.4. Forced Degradation Studies',
    {'acid_hydrolysis_reagent': '5 M HCl',
     'base_hydrolysis_reagent': '1 M sodium hydroxide',
     'hydrolysis_reflux_durations': '4 h and 8 h',
     'dry_heat_condition': '105 °C ± 5 °C',
     'heat_humidity_condition': '80 °C/75 ± 5% RH',
     'solution_stability_period': '7 days'},
    ['3.2.S.7.3', 'forced-degradation', 'stress-conditions', 'velpatasvir'],
    drop=[' ()'])

ext('m3-cisatracurium-acceptance-criteria-extract', 'PMC10221331', [45],
    '2. Materials and Methods > 2.4.6. Data Analysis (paragraph 1)',
    {'assay_acceptance_range': 'between 90 and 110% of the initial value',
     'laudanosine_limit': '4%',
     'impurity_a_limit': '4.3%',
     'impurity_o_limit': '2.5%',
     'total_degradation_products_limit': '14.4%'},
    ['3.2.P.5.1', '3.2.P.8.1', 'specification', 'degradation-products', 'cisatracurium', 'distractor'])

ext('m3-ramipril-specificity-limits-extract', 'PMC8538641', [58, 59],
    '3. Results > 3.1. Validation of the Analytical Method',
    {'selectivity_time_range': '2 to 10 min',
     'ramipril_retention_time': '7.80 min',
     'degradation_product_retention_times': '4.15 and 5.83 min',
     'quantitation_limit': '0.0083%',
     'detection_limit': '0.0027%'},
    ['3.2.S.4.3', 'validation', 'specificity', 'ramipril'],
    drop=[', as demonstrated in', ' ()', ', as demonstrated in', ' The regression parameters are provided in.'])

ext('m3-levothyroxine-storage-conditions-extract', 'PMC10819580', [45],
    '4. Materials and Methods > 4.2. Storage Conditions for Tests Samples',
    {'accelerated_storage_condition': '40 °C/75% RH',
     'real_time_storage_temperature': '23 °C',
     'stress_storage_condition': '50 °C/75% RH',
     'humidity_control': 'saturated brine solution',
     'oven_mapping_tolerance': '±5 °C',
     'sampling_time_points': '0, 1.5, 3, and 6 months'},
    ['3.2.P.8.1', 'stability-protocol', 'ich-q1a', 'levothyroxine', 'tablets'])

ext('m3-levothyroxine-system-suitability-extract', 'PMC10819580', [51, 52],
    '4. Materials and Methods > 4.3.1. Levothyroxine Sodium Tablets USP Assay Methods 1 and 2 (chromatographic system and system suitability)',
    {'detection_wavelength': '225 nm',
     'column_packing': 'L10',
     'flow_rate': '1.5 mL/min',
     'injection_volume': '100 µL',
     'resolution_requirement': '5.0',
     'rsd_requirement': '2.0%'},
    ['3.2.P.5.2', 'system-suitability', 'compendial-method', 'levothyroxine'])

ext('m3-meropenem-validation-results-extract', 'PMC13516646', [27],
    '3. Results > 3.1. Validation of the Analytical Method',
    {'coefficient_of_determination': '0.9997',
     'intra_day_rsd_range': '0.114 to 0.150',
     'inter_day_rsd_range': '0.649 to 0.888',
     'recovery_range': '99.89% to 100.09%',
     'lod': '0.81',
     'loq': '2.70'},
    ['3.2.P.5.3', 'validation', 'meropenem', 'ophthalmic-solution', 'distractor'],
    drop=[' ()', ' ()', ' ()', ' ()', ' ()'])

ext('m3-miglitol-related-substances-conditions-extract', 'PMC5198025', [13],
    '2. Materials and Methods > 2.2.2. Chromatographic Conditions',
    {'column': 'prevail carbohydrate ES',
     'mobile_phase_a': '10 mM dipotassium hydrogen orthophosphate',
     'mobile_phase_a_ph': '8.0',
     'column_temperature': '35 °C',
     'detection_wavelength': '210 nm',
     'injection_volume': '20 µL'},
    ['3.2.S.4.2', 'related-substances', 'hplc', 'miglitol'])

ext('m3-amiodarone-dissolution-procedure-extract', 'PMC13516048', [61],
    '3. Materials and Method > 3.5.3. Dissolution Samples',
    {'dissolution_apparatus': 'Paddle method',
     'medium_volume': '900 mL',
     'medium_ph': '4.0',
     'paddle_speed': '75 rpm',
     'sampling_time': '30 min',
     'sample_filter': 'RC syringe filter'},
    ['3.2.P.5.2', 'dissolution', 'amiodarone', 'tablets'])

ext('m3-amiodarone-dissolution-linearity-extract', 'PMC13516048', [69],
    '3. Materials and Method > 3.6. Method Validation > 3.6.3. Linearity and Range',
    {'dissolution_specification': 'not less than 80% dissolution within 30 min',
     'linearity_range': '20% to 120%',
     'calibration_levels': '44.0, 110.0, 176.0, 220.0, and 264.0',
     'determination_coefficient_criterion': '0.99',
     'regression_method': 'least-squares method'},
    ['3.2.P.5.1', '3.2.P.5.3', 'dissolution', 'linearity', 'specification', 'amiodarone'],
    drop=[' ()', ' ()'])

ext('m3-bupropion-naltrexone-dissolution-media-extract', 'PMC9739382', [17],
    '2. Materials and Methods > 2.5. In Vitro Dissolution Studies',
    {'dissolution_apparatus': 'USP type II',
     'paddle_speed': '50 rpm',
     'acid_stage_medium': '1.2 pH HCl solution',
     'acid_stage_sampling_interval': 'every 30 min',
     'buffer_stage_ph': '6.8',
     'final_medium_volume': '900 mL'},
    ['3.2.P.2.2', '3.2.P.5.2', 'dissolution', 'modified-release', 'bupropion', 'naltrexone'])

json.dump(tasks, open(OUT, 'w'), ensure_ascii=False, indent=2)
print('wrote', len(tasks), 'tasks')
