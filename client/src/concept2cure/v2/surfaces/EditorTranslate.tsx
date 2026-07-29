import React, { useState, useMemo } from 'react';

/* ================================================================
   EditorTranslate.tsx -- Multi-market translation workflow
   TranslationPane   : section-level translation tracker per target language
   MarketCompareModal: side-by-side view of same section across two markets
   ================================================================ */

/* ── Type definitions ─────────────────────────────────────────────── */

type TransStatusKey = 'not_started' | 'draft' | 'in_review' | 'certified';
type LangCode = 'ja' | 'zh' | 'de' | 'fr' | 'en';

interface TransStatusMeta {
  label: string;
  color: string;
  bg: string;
}

interface LangMeta {
  label: string;
  flag: string;
  short: string;
}

interface LangEntry {
  lang: LangCode;
  agency: string;
  region: string;
  status: TransStatusKey;
  assigned: string | null;
  due: string;
  notes: string;
}

interface TranslationSection {
  id: string;
  num: string;
  label: string;
  vol: string;
  langs: LangEntry[];
}

interface FlatRow extends TranslationSection {
  lg: LangEntry;
}

interface Market {
  id: string;
  agency: string;
  region: string;
  lang: LangCode;
}

interface TranslationPaneProps {
  onTranslate?: (section: FlatRow, lang: LangEntry) => void;
}

interface MarketCompareModalProps {
  section: TranslationSection;
  currentMarket: Market;
  markets: Market[];
  docMap: Record<string, string>;
  onClose: () => void;
}

/* ── Translation seed data (BX-204 global program) ────────────────── */

const RCE_TRANSLATION_SECTIONS: TranslationSection[] = [
  { id: 'm25', num: '2.5', label: 'Clinical Overview', vol: 'Module 2',
    langs: [
      { lang: 'ja', agency: 'PMDA', region: 'JP', status: 'draft',       assigned: 'Tanaka K.',   due: '2025-08-15', notes: 'Machine draft exists; certified translator not engaged' },
      { lang: 'zh', agency: 'NMPA', region: 'CN', status: 'not_started', assigned: null,           due: '2025-10-01', notes: 'NMPA submission planned Q4 2025' },
    ] },
  { id: 'm273', num: '2.7.3', label: 'Summary of Clinical Efficacy', vol: 'Module 2',
    langs: [
      { lang: 'ja', agency: 'PMDA', region: 'JP', status: 'not_started', assigned: null,           due: '2025-08-15', notes: 'Section not yet authored in EN; translate after EN complete' },
      { lang: 'zh', agency: 'NMPA', region: 'CN', status: 'not_started', assigned: null,           due: '2025-10-01', notes: '' },
    ] },
  { id: 'm274', num: '2.7.4', label: 'Summary of Clinical Safety', vol: 'Module 2',
    langs: [
      { lang: 'ja', agency: 'PMDA', region: 'JP', status: 'not_started', assigned: null,           due: '2025-08-15', notes: 'Source EN draft incomplete -- unblocks translation' },
    ] },
  { id: 'm32p', num: '3.2.P', label: 'Drug Product (Finished Product)', vol: 'Module 3',
    langs: [
      { lang: 'ja', agency: 'PMDA', region: 'JP', status: 'in_review',   assigned: 'Yamamoto R.', due: '2025-07-30', notes: 'Stability section adapted for JP ICH Q1 requirements' },
    ] },
  { id: 'm321s', num: '3.2.S', label: 'Drug Substance', vol: 'Module 3',
    langs: [
      { lang: 'zh', agency: 'NMPA', region: 'CN', status: 'not_started', assigned: null,           due: '2025-10-01', notes: 'NMPA requires Chinese-language CMC summary' },
    ] },
  { id: 'm4231', num: '4.2.3.1', label: 'Toxicology -- Repeat-Dose', vol: 'Module 4',
    langs: [
      { lang: 'de', agency: 'BfArM', region: 'DE', status: 'in_review',  assigned: 'Mueller S.',  due: '2025-09-01', notes: 'BfArM scientific advice required in German' },
      { lang: 'fr', agency: 'ANSM',  region: 'FR', status: 'not_started', assigned: null,          due: '2025-09-01', notes: 'ANSM requires French-language summary for national procedure' },
    ] },
];

/* ── Status metadata ───────────────────────────────────────────────── */

const TRANS_STATUS: Record<TransStatusKey, TransStatusMeta> = {
  not_started: { label: 'Not started', color: 'var(--text-400)',  bg: 'var(--bg-200)' },
  draft:       { label: 'Draft',       color: 'var(--warning)',   bg: 'color-mix(in srgb,var(--warning) 10%,transparent)' },
  in_review:   { label: 'In review',   color: 'var(--warning)',   bg: 'color-mix(in srgb,var(--warning) 8%,transparent)' },
  certified:   { label: 'Certified',   color: 'var(--success)',   bg: 'color-mix(in srgb,var(--success) 12%,transparent)' },
};

/* ── Language metadata ─────────────────────────────────────────────── */

const LANG_META: Record<LangCode, LangMeta> = {
  ja: { label: 'Japanese', flag: 'JP', short: 'JP' },
  zh: { label: 'Chinese',  flag: 'CN', short: 'CN' },
  de: { label: 'German',   flag: 'DE', short: 'DE' },
  fr: { label: 'French',   flag: 'FR', short: 'FR' },
  en: { label: 'English',  flag: 'US', short: 'EN' },
};

/* ═══════════════════════════════════════════════════════════════════
   TranslationPane -- section-level translation tracker
   ═══════════════════════════════════════════════════════════════════ */

export function TranslationPane({ onTranslate }: TranslationPaneProps) {
  const [langFilter, setLangFilter] = useState<LangCode | 'all'>('all');
  const [certModal, setCertModal] = useState<FlatRow | null>(null);
  const [certReason, setCertReason] = useState('');
  const data = RCE_TRANSLATION_SECTIONS;

  /* flatten all lang entries */
  const rows = useMemo<FlatRow[]>(() => {
    const flat: FlatRow[] = [];
    data.forEach(sec => {
      sec.langs.forEach(lg => {
        if (langFilter === 'all' || lg.lang === langFilter) {
          flat.push({ ...sec, lg });
        }
      });
    });
    return flat;
  }, [langFilter, data]);

  const totalNeed = data.reduce((s, sec) => s + sec.langs.filter(l => l.status !== 'certified').length, 0);
  const certified = data.reduce((s, sec) => s + sec.langs.filter(l => l.status === 'certified').length, 0);
  const allLangs = [...new Set(data.flatMap(s => s.langs.map(l => l.lang)))];

  const handleCertify = () => {
    setCertModal(null);
    setCertReason('');
  };

  const CERT_MIN_LENGTH = 20;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-100)' }}>Translation tracker</span>
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'var(--bg-200)', color: 'var(--text-400)', fontWeight: 600 }}>
            {totalNeed} pending / {certified} certified
          </span>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-400)', lineHeight: 1.4 }}>
          Sections requiring localization for non-English target markets.
          ICH CTD M2-M5 common content -- translate once, certify per agency.
        </div>
      </div>

      {/* Language filter */}
      <div style={{ display: 'flex', gap: 3, padding: '8px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <button
          onClick={() => setLangFilter('all')}
          style={{
            fontSize: 10, padding: '3px 9px', borderRadius: 4,
            border: '1px solid var(--border)',
            background: langFilter === 'all' ? 'var(--accent-100)' : 'var(--bg-100)',
            color: langFilter === 'all' ? '#fff' : 'var(--text-300)',
            cursor: 'pointer', fontWeight: 600,
          }}
        >
          All
        </button>
        {allLangs.map(l => {
          const m = LANG_META[l] ?? { label: l, short: l.toUpperCase(), flag: l.toUpperCase() };
          return (
            <button
              key={l}
              onClick={() => setLangFilter(langFilter === l ? 'all' : l)}
              style={{
                fontSize: 10, padding: '3px 9px', borderRadius: 4,
                border: '1px solid var(--border)',
                background: langFilter === l ? 'var(--accent-100)' : 'var(--bg-100)',
                color: langFilter === l ? '#fff' : 'var(--text-300)',
                cursor: 'pointer',
              }}
            >
              {m.flag} {m.short}
            </button>
          );
        })}
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {rows.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-400)', fontSize: 12 }}>
            No sections require translation for the selected language.
          </div>
        )}
        {rows.map((row, ri) => {
          const lm = LANG_META[row.lg.lang] ?? { label: row.lg.lang, flag: row.lg.lang, short: row.lg.lang.toUpperCase() };
          const sm = TRANS_STATUS[row.lg.status] ?? TRANS_STATUS.not_started;
          return (
            <div key={ri} style={{ borderBottom: '1px solid var(--bg-100)', padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-300)', background: 'var(--bg-100)', borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace' }}>
                  {row.num}
                </span>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-100)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.label}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: sm.bg, color: sm.color }}>{sm.label}</span>
                <span style={{ fontSize: 10, color: 'var(--text-400)' }}>{lm.flag} {lm.label} / {row.lg.agency}</span>
                {row.lg.due && <span style={{ fontSize: 9, color: 'var(--text-400)', marginLeft: 'auto' }}>Due {row.lg.due}</span>}
              </div>
              {row.lg.assigned && (
                <div style={{ fontSize: 10, color: 'var(--text-400)', marginBottom: 5 }}>
                  Assigned: <span style={{ color: 'var(--text-300)', fontWeight: 500 }}>{row.lg.assigned}</span>
                </div>
              )}
              {row.lg.notes && (
                <div style={{ fontSize: 10, color: 'var(--text-400)', fontStyle: 'italic', marginBottom: 7, lineHeight: 1.4 }}>{row.lg.notes}</div>
              )}
              <div style={{ display: 'flex', gap: 6 }}>
                {(row.lg.status === 'not_started' || row.lg.status === 'draft') ? (
                  <button
                    onClick={() => onTranslate?.(row, row.lg)}
                    style={{ fontSize: 10, padding: '4px 10px', borderRadius: 4, border: '1px solid var(--accent-100)', background: 'var(--accent-100)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Translate with AnA
                  </button>
                ) : null}
                {row.lg.status === 'in_review' && (
                  <button
                    onClick={() => setCertModal(row)}
                    style={{ fontSize: 10, padding: '4px 10px', borderRadius: 4, border: '1px solid var(--success)', background: 'color-mix(in srgb,var(--success) 12%,transparent)', color: 'var(--success)', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Mark certified
                  </button>
                )}
                {row.lg.status === 'certified' && (
                  <span style={{ fontSize: 10, color: 'var(--success)', fontWeight: 600 }}>Certified translation on file</span>
                )}
                {row.lg.status !== 'not_started' && (
                  <button style={{ fontSize: 10, padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-100)', color: 'var(--text-300)', cursor: 'pointer' }}>
                    Open
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Certify modal */}
      {certModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setCertModal(null)}
        >
          <div
            style={{ background: 'var(--bg-000)', borderRadius: 12, padding: 24, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Certify translation</div>
            <div style={{ fontSize: 11, color: 'var(--text-400)', marginBottom: 14 }}>
              {'§'}{certModal.num} {certModal.label} {'->'} {LANG_META[certModal.lg.lang]?.label}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-300)', marginBottom: 6 }}>Certification statement / translator attestation</div>
            <textarea
              value={certReason}
              onChange={e => setCertReason(e.target.value)}
              placeholder="I certify that this translation accurately represents the source document and was prepared by a qualified regulatory translation professional..."
              style={{ width: '100%', height: 90, fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, padding: 8, resize: 'none', fontFamily: 'inherit', color: 'var(--text-100)', background: 'var(--bg-50)' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setCertModal(null)}
                style={{ fontSize: 11, padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-300)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleCertify}
                disabled={certReason.length < CERT_MIN_LENGTH}
                style={{
                  fontSize: 11, padding: '6px 14px', borderRadius: 6, border: 'none',
                  background: certReason.length >= CERT_MIN_LENGTH ? 'var(--success)' : 'var(--bg-200)',
                  color: certReason.length >= CERT_MIN_LENGTH ? '#fff' : 'var(--text-400)',
                  cursor: certReason.length >= CERT_MIN_LENGTH ? 'pointer' : 'default',
                  fontWeight: 600,
                }}
              >
                Certify &amp; sign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MarketCompareModal -- split view of same section across two markets
   ═══════════════════════════════════════════════════════════════════ */

export function MarketCompareModal({ section, currentMarket, markets, docMap, onClose }: MarketCompareModalProps) {
  const [rightMarket, setRightMarket] = useState<Market>(
    markets.find(m => m.id !== currentMarket.id) ?? markets[0],
  );
  const [showDiff, setShowDiff] = useState(true);

  const getContent = (_marketId: string, lang?: string): string | null => {
    const key = section.id + '::' + (lang ?? 'en');
    const html = docMap[key] ?? '';
    if (!html) return null;
    return html;
  };

  const leftContent  = getContent(currentMarket.id, currentMarket.lang);
  const rightContent = getContent(rightMarket.id, rightMarket.lang);

  /* extract plain-text sentences for diff annotation */
  const extractFacts = (html: string): string => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.innerText;
  };

  const leftText  = leftContent  ? extractFacts(leftContent)  : '';
  const rightText = rightContent ? extractFacts(rightContent) : '';

  /* Simple fact-diff: find numeric values in both texts */
  const extractNums = (txt: string): string[] => {
    const matches = [...txt.matchAll(/\d+\.?\d*\s*%|\d+\.?\d*\s*mg|\d+\.?\d*\s*months?/gi)];
    return matches.map(m => m[0].trim());
  };

  const leftNums  = new Set(extractNums(leftText));
  const rightNums = new Set(extractNums(rightText));
  const onlyLeft  = [...leftNums].filter(n => !rightNums.has(n));
  const onlyRight = [...rightNums].filter(n => !leftNums.has(n));

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 40 }}
      onClick={onClose}
    >
      <div
        style={{ width: '90vw', maxWidth: 1280, maxHeight: '85vh', background: 'var(--bg-000)', borderRadius: 14, boxShadow: '0 32px 80px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Compare markets -- {'§'}{section.num} {section.label}</span>
          <span style={{ flex: 1 }} />
          {(onlyLeft.length > 0 || onlyRight.length > 0) && (
            <button
              onClick={() => setShowDiff(v => !v)}
              style={{ fontSize: 10, padding: '4px 10px', borderRadius: 4, border: '1px solid var(--border)', background: showDiff ? 'var(--accent-100)' : 'var(--bg-100)', color: showDiff ? '#fff' : 'var(--text-300)', cursor: 'pointer' }}
            >
              {showDiff ? 'Hide' : 'Show'} fact diff ({onlyLeft.length + onlyRight.length})
            </button>
          )}
          <button
            onClick={onClose}
            style={{ fontSize: 18, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-400)', padding: '0 4px' }}
          >
            x
          </button>
        </div>

        {/* Fact diff strip */}
        {showDiff && (onlyLeft.length > 0 || onlyRight.length > 0) && (
          <div style={{ display: 'flex', gap: 16, padding: '8px 20px', background: 'oklch(0.97 0.03 60)', borderBottom: '1px solid var(--border)', fontSize: 10, flexShrink: 0, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-400)', fontWeight: 600, alignSelf: 'center' }}>Fact divergence:</span>
            {onlyLeft.map((n, i) => (
              <span key={'l' + i} style={{ padding: '2px 7px', borderRadius: 4, background: 'color-mix(in srgb,var(--error) 12%,transparent)', color: 'var(--error)', fontWeight: 600 }}>
                {currentMarket.agency} only: {n}
              </span>
            ))}
            {onlyRight.map((n, i) => (
              <span key={'r' + i} style={{ padding: '2px 7px', borderRadius: 4, background: 'color-mix(in srgb,var(--success) 12%,transparent)', color: 'var(--success)', fontWeight: 600 }}>
                {rightMarket.agency} only: {n}
              </span>
            ))}
          </div>
        )}

        {/* Columns */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {/* Left -- current market */}
          <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--bg-100)', background: 'var(--bg-50)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700 }}>{currentMarket.agency}</span>
              <span style={{ fontSize: 10, color: 'var(--text-400)' }}>{currentMarket.region} / {LANG_META[currentMarket.lang]?.label ?? 'English'}</span>
              <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'var(--accent-100)', color: '#fff', fontWeight: 700 }}>Active</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {leftContent
                ? <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-100)' }} dangerouslySetInnerHTML={{ __html: leftContent }} />
                : (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-400)', fontSize: 12 }}>
                    No content authored for {currentMarket.agency} yet.<br />This section is empty.
                  </div>
                )
              }
            </div>
          </div>

          {/* Right -- comparison market */}
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--bg-100)', background: 'var(--bg-50)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <select
                value={rightMarket.id}
                onChange={e => {
                  const found = markets.find(m => m.id === e.target.value);
                  if (found) setRightMarket(found);
                }}
                style={{ fontSize: 11, fontWeight: 700, border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', background: 'var(--bg-000)', color: 'var(--text-100)', cursor: 'pointer' }}
              >
                {markets.filter(m => m.id !== currentMarket.id).map(m => (
                  <option key={m.id} value={m.id}>{m.agency} -- {m.region}</option>
                ))}
              </select>
              <span style={{ fontSize: 10, color: 'var(--text-400)' }}>{LANG_META[rightMarket.lang]?.label ?? 'English'}</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {rightContent
                ? <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-100)' }} dangerouslySetInnerHTML={{ __html: rightContent }} />
                : (
                  <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-400)', fontSize: 12 }}>
                    <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.3 }} />
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>No {rightMarket.agency} content yet</div>
                    <div style={{ lineHeight: 1.5, marginBottom: 16 }}>
                      {rightMarket.id === 'pmda'
                        ? 'This section needs Japanese translation for PMDA. The common ICH CTD content can be adapted by AnA.'
                        : rightMarket.id === 'ema'
                        ? 'CHMP format adaptation needed. The FDA draft can be propagated and adapted for EMA.'
                        : 'The common module content from the active market can be propagated to this market.'}
                    </div>
                    <button style={{ fontSize: 11, padding: '8px 16px', borderRadius: 6, border: 'none', background: 'var(--accent-100)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                      Propagate &amp; adapt for {rightMarket.agency}
                    </button>
                  </div>
                )
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { RCE_TRANSLATION_SECTIONS, TRANS_STATUS, LANG_META };
export type { TranslationSection, LangEntry, TransStatusKey, LangCode, LangMeta, TransStatusMeta, Market, FlatRow };
