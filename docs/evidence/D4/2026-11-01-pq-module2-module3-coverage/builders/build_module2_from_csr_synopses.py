"""Build the module-2-clinical gold tasks from the three public CSR synopses in csrs/.

Every `input` is cut verbatim from the cleaned text between two anchors (page
furniture removed: page counters, the running header and the approval stamp;
the PDF's private-use bullet glyph becomes "•"). A missing anchor is an error,
so nothing here can drift from the source.
"""
import json, re, sys

S = '/tmp/claude-0/-home-user-ClinicalSageAI-2-replit/4b86d83b-c79b-5f17-8052-4fe90b657ef3/scratchpad/csr/'
TEXT = {n: open(S + n + '.clean.txt').read().replace('', '•').replace('', '•')
        for n in ['A0081186_Synopsis', 'A0221045_Synopsis', 'NCT01561027-Synopsis']}

SRC = {
    'A0081186_Synopsis': {
        'document': 'csrs/A0081186_Synopsis.pdf',
        'title': 'Public Disclosure Synopsis, Protocol A0081186: Randomized, Double-Blind, 12-Month Study of Pregabalin in Subjects With Restless Legs Syndrome',
        'sponsor': 'Pfizer Inc.', 'date': '18 July 2014', 'product': 'Lyrica (pregabalin)',
    },
    'A0221045_Synopsis': {
        'document': 'csrs/A0221045_Synopsis.pdf',
        'title': 'Public Disclosure Synopsis, Protocol A0221045: Fesoterodine Flexible Dose Regimen in Elderly Patients With Overactive Bladder',
        'sponsor': 'Pfizer Inc.', 'date': '28 March 2014', 'product': 'Toviaz (fesoterodine fumarate)',
    },
    'NCT01561027-Synopsis': {
        'document': 'csrs/NCT01561027-Synopsis.pdf',
        'title': 'CSR synopsis, Protocol 1014802/201 (NCT01561027): CNV1014802 in neuropathic pain from lumbosacral radiculopathy',
        'sponsor': 'Convergence Pharmaceuticals Ltd', 'date': '04 September 2014', 'product': 'CNV1014802',
    },
}


def cut(doc, start, end, include_end=True):
    t = TEXT[doc]
    i = t.find(start)
    if i < 0:
        sys.exit(f'anchor not found in {doc}: {start!r}')
    j = t.find(end, i)
    if j < 0:
        sys.exit(f'end anchor not found in {doc}: {end!r}')
    return t[i:j + len(end)] if include_end else t[i:j]


def src(doc, section):
    return {**SRC[doc], 'section': section,
            'transcription': 'verbatim; page counters, running headers and approval stamps removed; bullet glyphs as "•"',
            'retrieved': '2026-11-01'}


P, F, C = 'A0081186_Synopsis', 'A0221045_Synopsis', 'NCT01561027-Synopsis'
OVERCLAIM = ['proven safe and effective', 'there were no adverse events', 'eliminates all symptoms']
tasks = []


def gen(slug, doc, section, parts, required, forbidden, tags):
    tasks.append({
        'id': f'm2-{slug}-generate', 'docType': 'module-2-clinical', 'taskType': 'generation',
        'input': '\n\n'.join(parts), 'requiredSections': required, 'forbiddenPatterns': forbidden,
        'tags': ['ctd', 'module-2', *tags], 'source': src(doc, section),
    })


def ext(slug, doc, section, parts, fields, tags):
    tasks.append({
        'id': f'm2-{slug}-extract', 'docType': 'module-2-clinical', 'taskType': 'extraction',
        'input': '\n\n'.join(parts), 'expectedFields': fields,
        'tags': ['ctd', 'module-2', *tags], 'source': src(doc, section),
    })


# ── Pregabalin, restless legs syndrome (A0081186) ─────────────────────────────
p_design = cut(P, 'Study Design: This was a fixed-dose', 'continued\nstudy treatment for the remaining 40 weeks.')
p_primary = cut(P, 'Primary Efficacy Endpoints:\nIRLS Total Score 12-Week Assessment for Pregabalin Versus Placebo:', '(p<0.0001 and p=0.3603, respectively).')
p_augment = cut(P, 'Augmentation Rates 52-Week Assessment:', 'c. p-value was obtained using Stratified log-rank test by block.')
p_disposition = cut(P, 'Subject Disposition and Demography: A total of 1379', 'these are detailed in Table 4.')
p_safety = cut(P, 'Safety Results: An overview of treatment-emergent AEs', '0.25 mg, and placebo to pramipexole 0.50 mg treatment, respectively (Table 30).')
p_common = cut(P, 'The most frequently reported all causality treatment-emergent AEs during pregabalin 300 mg', 'pramipexole 0.25 mg treatment were influenza, weight increase, dizziness, and headache.')
p_conclusion = cut(P, 'CONCLUSIONS: Pregabalin 300 mg/day', 'consistent with the known safety profile of pregabalin.')

gen('pregabalin-rls-efficacy', P, 'Methods: Study Design; Results: Primary Efficacy Endpoints (IRLS total score)',
    [p_design, p_primary], ['study design', 'IRLS total score', 'results'],
    ['cures restless legs', 'superior to all comparators', *OVERCLAIM], ['2.7.3', 'efficacy', 'pregabalin'])
gen('pregabalin-rls-augmentation', P, 'Results: Augmentation Rates 52-Week Assessment, Table 10',
    [p_augment], ['augmentation rate', 'pramipexole', 'results'],
    ['prevents augmentation entirely', 'significantly lower than both pramipexole doses', *OVERCLAIM], ['2.7.3', 'efficacy', 'pregabalin'])
gen('pregabalin-rls-safety', P, 'Results: Safety Results and all-causality adverse events',
    [p_safety, p_common], ['overview', 'serious adverse event', 'common adverse event'],
    ['no safety concerns', 'safer than pramipexole', *OVERCLAIM], ['2.7.4', 'safety', 'pregabalin'])
gen('pregabalin-rls-overview', P, 'Results: Subject Disposition and Demography; Conclusions',
    [p_disposition, p_conclusion], ['efficacy conclusion', 'safety conclusion', 'discontinuation'],
    ['cures restless legs', 'all subjects completed', *OVERCLAIM], ['2.5', 'clinical-overview', 'pregabalin'])

ext('pregabalin-rls-disposition', P, 'Results: Subject Disposition and Demography', [p_disposition],
    {'subjects_screened': '1379', 'subjects_assigned_to_treatment': '731', 'subjects_dosed': '719',
     'subjects_completed': '354', 'withdrawals_due_to_related_aes': '127'}, ['2.7.4', 'disposition', 'pregabalin'])
ext('pregabalin-rls-primary', P, 'Results: Primary Efficacy Endpoints (IRLS total score)', [p_primary],
    {'primary_measure': 'IRLS total score', 'assessment_period_weeks': '12',
     'pregabalin_vs_placebo_p_value': '<0.0001', 'pramipexole_0_25_mg_vs_placebo_p_value': '0.3603'},
    ['2.7.3', 'efficacy', 'pregabalin'])
ext('pregabalin-rls-augmentation', P, 'Results: Augmentation Rates 52-Week Assessment, Table 10', [p_augment],
    {'pregabalin_block_52_augmentation': '3 (1.7', 'pramipexole_0_5_mg_block_52_augmentation': '16 (9.0',
     'p_value_vs_pramipexole_0_5_mg': '0.0012', 'p_value_vs_pramipexole_0_25_mg': '0.0826',
     'statistical_test': 'Stratified log-rank test'}, ['2.7.3', 'efficacy', 'pregabalin'])
ext('pregabalin-rls-safety', P, 'Results: Safety Results and all-causality adverse events', [p_safety, p_common],
    {'pregabalin_saes_percent': '4.9', 'pregabalin_severe_aes_percent': '11.5',
     'most_frequent_ae_pregabalin': 'dizziness', 'most_frequent_ae_pramipexole_0_25_mg': 'headache'},
    ['2.7.4', 'safety', 'pregabalin'])

# ── Fesoterodine, elderly overactive bladder (A0221045) ───────────────────────
f_objective = cut(F, 'Primary Objective: To compare the efficacy', 'elderly subjects with\noveractive bladder (OAB).')
f_design = cut(F, 'Study Design: This was a 24-week', 'once daily\n(QD), and were randomized to receive instructions to take the study medication either in the\nevening or in the morning.')
f_subjects = cut(F, 'Number of Subjects (Planned and Analyzed): Approximately 790', 'efficacy.')
f_primary = cut(F, 'Primary Endpoint Result: Treatment with fesoterodine', 'the 95% CI for the\ndifference was (-2.12, -0.97).')
f_secondary = cut(F, 'Secondary Endpoint Results:\n• Percent Changes From Baseline of Micturition-Related Urgency Episodes:', 'was (-14.67%, -14.25%) (Table 7).')
f_severe = cut(F, 'Changes From Baseline in Mean Number of Severe Micturition-Related Urgency\nEpisodes:', 'difference was (-1.28, -0.42) (Table 8).')
f_withdrawals = cut(F, 'One subject in each of the treatment groups died.', 'withdrew due to AEs considered treatment-related).')
f_safety = cut(F, 'Safety Results: An overall summary of treatment-emergent AEs', 'discontinued from the study due to TEAEs compared to those who received fesoterodine\nduring the DB phase.')
f_table29 = cut(F, 'Table 29. Overview of Treatment-Emergent Adverse Events (Double-Blind and\nOpen-Label Phases)', 'Treatment-related 42 (10.7) 15 (3.8) 4 (1.3) 31 (9.1)')
f_concl_a = cut(F, 'CONCLUSIONS:', 'in an elderly population at Week 12.')
f_concl_b = cut(F, '• The additional efficacy achieved with fesoterodine treatment compared to placebo in\nbladder diary', 'for up\nto 24 weeks.')

gen('fesoterodine-oab-primary', F, 'Study Objectives; Methods: Study Design; Results: Primary Endpoint Result',
    [f_objective, f_design, f_primary], ['primary objective', 'study design', 'primary endpoint'],
    ['cures overactive bladder', 'eliminates urgency episodes', *OVERCLAIM], ['2.7.3', 'efficacy', 'fesoterodine'])
gen('fesoterodine-oab-secondary', F, 'Results: Secondary Endpoint Results',
    [f_secondary, f_severe], ['secondary endpoint', 'urgency episode', 'results'],
    ['improvement in every endpoint', 'eliminates urgency episodes', *OVERCLAIM], ['2.7.3', 'efficacy', 'fesoterodine'])
gen('fesoterodine-oab-safety', F, 'Results: Safety Results, Table 29',
    [f_safety, f_table29], ['overview', 'serious adverse event', 'open-label'],
    ['no serious adverse events occurred', 'safety profile identical to placebo', *OVERCLAIM], ['2.7.4', 'safety', 'fesoterodine'])
gen('fesoterodine-oab-overview', F, 'Conclusions (the bullet on the ≤75-year subgroup is omitted: its "≤" did not survive text extraction)',
    [f_concl_a, f_concl_b], ['efficacy conclusion', 'safety conclusion', 'elderly'],
    ['cures overactive bladder', 'no adverse events in elderly', *OVERCLAIM], ['2.5', 'clinical-overview', 'fesoterodine'])

ext('fesoterodine-oab-subjects', F, 'Number of Subjects (Planned and Analyzed)', [f_subjects],
    {'subjects_screened': '1045', 'subjects_assigned_to_treatment': '794', 'subjects_treated': '785',
     'full_analysis_set': '756', 'fesoterodine_arm_assigned': '398'}, ['2.7.3', 'disposition', 'fesoterodine'])
ext('fesoterodine-oab-primary', F, 'Results: Primary Endpoint Result', [f_primary],
    {'primary_endpoint': 'urgency episodes per 24 hours', 'ls_mean_difference': '-1.54',
     'ci_95_lower': '-2.12', 'ci_95_upper': '-0.97', 'p_value': '<0.0001', 'timepoint_weeks': '12'},
    ['2.7.3', 'efficacy', 'fesoterodine'])
ext('fesoterodine-oab-withdrawals', F, 'Results: Subject Disposition and Demography', [f_withdrawals],
    {'fesoterodine_withdrawals_due_to_aes_percent': '11.6', 'placebo_withdrawals_due_to_aes_percent': '5.6',
     'fesoterodine_treatment_related_ae_withdrawals_percent': '9.2', 'placebo_treatment_related_ae_withdrawals_percent': '4.3'},
    ['2.7.4', 'disposition', 'fesoterodine'])
ext('fesoterodine-oab-safety', F, 'Results: Safety Results, Table 29', [f_safety, f_table29],
    {'treatment_related_sae': 'urinary retention', 'db_fesoterodine_sae_all_causalities_percent': '3.6',
     'db_fesoterodine_subjects_with_aes_percent': '62.2', 'db_placebo_subjects_with_aes_percent': '36.1'},
    ['2.7.4', 'safety', 'fesoterodine'])

# ── CNV1014802, lumbosacral radiculopathy (NCT01561027) ───────────────────────
c_method = cut(C, 'Methodology:\nThis was a multi-centre', 'received placebo.')
c_numbers = cut(C, 'Number of subjects:\nPlanned Randomized: 80', 'Treated: 81 (CNV1014802 N=79; Placebo N=73)')
c_efficacy = cut(C, 'Efficacy:\n• CNV1014802 significantly improved', 'and the Monotherapy subjects (-0.81, p=0.0555).')
c_pk = cut(C, 'Pharmacokinetics:\n• CNV1014802 plasma concentrations', 'The PK data suggested no evidence of major non-compliance.')
c_safety = cut(C, 'Safety:\n• CNV1014802 was well tolerated', 'associated\nwith CNV1014802')
c_conclusion = cut(C, 'SUMMARY: CONCLUSION', 'ECG changes were reported.')

gen('cnv1014802-lsr-efficacy', C, 'Methodology; Results: Efficacy',
    [c_method, c_efficacy], ['study design', 'primary endpoint', 'monotherapy'],
    ['cures neuropathic pain', 'significant on every secondary endpoint', *OVERCLAIM], ['2.7.3', 'efficacy', 'cnv1014802'])
gen('cnv1014802-lsr-pharmacokinetics', C, 'Results: Pharmacokinetics',
    [c_pk], ['pharmacokinetics', 'exposure', 'compliance'],
    ['dose proportionality was established', 'no inter-subject variability', *OVERCLAIM], ['2.7.2', 'clinical-pharmacology', 'cnv1014802'])
gen('cnv1014802-lsr-safety', C, 'Results: Safety',
    [c_safety], ['common adverse events', 'discontinuation', 'laboratory'],
    ['no liver signal', 'no discontinuations due to adverse events', *OVERCLAIM], ['2.7.4', 'safety', 'cnv1014802'])
gen('cnv1014802-lsr-overview', C, 'Summary: Conclusion',
    [c_conclusion], ['low back pain', 'safety', 'secondary endpoint'],
    ['cures neuropathic pain', 'robust effect on low back pain', *OVERCLAIM], ['2.5', 'clinical-overview', 'cnv1014802'])

ext('cnv1014802-lsr-design', C, 'Methodology; Number of subjects', [c_method, c_numbers],
    {'subjects_enrolled': '137', 'subjects_randomized': '82', 'dose_mg': '350', 'dosing_frequency': 'BID',
     'washout_period_days': '13'}, ['2.7.3', 'design', 'cnv1014802'])
ext('cnv1014802-lsr-efficacy', C, 'Results: Efficacy', [c_efficacy],
    {'primary_difference_vs_placebo': '-0.43', 'primary_p_value': '0.0255',
     'monotherapy_difference_vs_placebo': '-0.73', 'monotherapy_p_value': '0.0038'},
    ['2.7.3', 'efficacy', 'cnv1014802'])
ext('cnv1014802-lsr-pharmacokinetics', C, 'Results: Pharmacokinetics', [c_pk],
    {'subjects_with_pk_estimates': '78/79', 'median_auc_0_24_ss': '55', 'median_cmax_ss': '3.7',
     'median_cmin_ss': '1.4'}, ['2.7.2', 'clinical-pharmacology', 'cnv1014802'])
ext('cnv1014802-lsr-safety', C, 'Results: Safety', [c_safety],
    {'cnv1014802_headache_incidence_percent': '15.2', 'cnv1014802_dizziness_incidence_percent': '11.4',
     'cnv1014802_discontinued_due_to_teaes_percent': '10.1', 'alt_threshold': '3xULN'},
    ['2.7.4', 'safety', 'cnv1014802'])

json.dump(tasks, open(S + '../m2-tasks.json', 'w'), indent=2, ensure_ascii=False)
print(len(tasks), 'tasks', sum(t['taskType'] == 'generation' for t in tasks), 'generation')
