/**
 * DeviceProfilePanel — compact collapsible intake card for the active
 * program's device profile (product name · class · pathway · product code ·
 * intended use · the five device-level facts the official eSTAR reads from the
 * program: common name, classification name, regulation number, associated
 * product codes, Indications for Use citation), backed by GET/PUT
 * /api/510k/device/profile.
 *
 * The openFDA classification lookup OFFERS autofill: the top hit's product
 * code / device class / regulation number / classification "device name" fill
 * the form fields, and the user still reviews and clicks Save. Honest states
 * throughout — an unavailable lookup shows the server's unavailableReason, a
 * rejected save says "Not saved", and no field is ever filled from a guess
 * (unmappable device classes are left alone).
 *
 * The recognized-standards lookup sits beside it because it answers the other
 * half of intake: once the product code is known, which consensus standards has
 * FDA recognized for it. That list comes from a vendored FDA dataset, so the
 * panel renders three distinct states and never merges them — the dataset is
 * not held, the dataset is held and lists nothing for this code, or here is
 * FDA's list. An empty table that could mean either of the first two would be
 * the dishonest rendering.
 *
 * Uses the kit's section/pma-mod classes for visual consistency
 * (EstarFilingPanel is the reference idiom).
 */

import * as React from 'react';
import { useEffect, useState } from 'react';
import {
  useDeviceProfile,
  lookupClassification,
  lookupRecognizedStandards,
  romanDeviceClass,
  ESTAR_DEVICE_FIELDS,
  type ClassificationHit,
  type DeviceProfilePatch,
  type DeviceProfileView,
  type DeviceClass,
  type EstarDeviceField,
  type RegulatoryPath,
  type RecognizedStandardsResult,
} from '../hooks/useDeviceProfile';
import { describeSaveFailure } from '../hooks/useFetchJson';
import { notifyOfficialEstarFieldsChanged } from '../hooks/useEstarOfficialFields';

const DEVICE_CLASSES: DeviceClass[] = ['I', 'II', 'III'];
const REGULATORY_PATHS: Array<{ value: RegulatoryPath; label: string }> = [
  { value: '510k', label: '510(k)' },
  { value: 'de_novo', label: 'De Novo' },
  { value: 'pma', label: 'PMA' },
];

function pathLabel(path: string | null): string | null {
  return REGULATORY_PATHS.find((p) => p.value === path)?.label ?? path;
}

/** The five eSTAR device facts as the intake form labels them. `max` mirrors
 *  the route's write limits (server/routes/510k-device-routes.ts), the same
 *  contract ESTAR_CORRESPONDENT_FIELDS carries for the correspondent block.
 *  Without it one over-long value 400s the WHOLE patch, so every other edit
 *  the user made in this form is discarded with it. */
const ESTAR_DEVICE_FIELD_LABELS: Record<
  EstarDeviceField,
  { label: string; placeholder: string; max: number }
> = {
  commonName: { label: 'Common name', placeholder: 'e.g. Continuous glucose monitor', max: 500 },
  classificationName: { label: 'Classification name', placeholder: 'The 21 CFR classification name', max: 500 },
  regulationNumber: { label: 'Regulation number (21 CFR)', placeholder: 'e.g. 862.1355', max: 50 },
  associatedProductCodes: { label: 'Associated product codes', placeholder: 'Secondary codes, separated by ;', max: 500 },
  indicationsForUseCitation: {
    label: 'Indications for Use citation (attachment and page)',
    placeholder: 'e.g. Attachment 4, page 1',
    max: 1000,
  },
};

export interface FormState extends Record<EstarDeviceField, string> {
  productName: string;
  deviceClass: string;
  regulatoryPath: string;
  productCode: string;
  intendedUse: string;
}

function formFromProfile(profile: DeviceProfileView | null): FormState {
  const estar = Object.fromEntries(
    ESTAR_DEVICE_FIELDS.map((field) => [field, profile?.[field] ?? '']),
  ) as Record<EstarDeviceField, string>;
  return {
    ...estar,
    productName: profile?.productName ?? '',
    deviceClass: profile?.deviceClass ?? '',
    regulatoryPath: profile?.regulatoryPath ?? '',
    productCode: profile?.productCode ?? '',
    intendedUse: profile?.intendedUse ?? '',
  };
}

/**
 * Diff the form against the loaded profile into a PUT patch of ONLY the
 * changed fields. Fields the server requires non-empty (name, class, path,
 * code) are omitted when cleared — clearing them is not a supported write.
 * The five eSTAR facts are different: an emptied one is sent as '' because
 * that IS the clear signal, and the eSTAR field then honestly stays blank.
 */
export function profilePatch(profile: DeviceProfileView | null, form: FormState): DeviceProfilePatch {
  const base = formFromProfile(profile);
  const patch: DeviceProfilePatch = {};
  const name = form.productName.trim();
  if (name && name !== base.productName) patch.productName = name;
  if (form.deviceClass && form.deviceClass !== base.deviceClass) {
    patch.deviceClass = form.deviceClass as DeviceClass;
  }
  if (form.regulatoryPath && form.regulatoryPath !== base.regulatoryPath) {
    patch.regulatoryPath = form.regulatoryPath as RegulatoryPath;
  }
  const code = form.productCode.trim();
  if (code && code !== base.productCode) patch.productCode = code;
  if (form.intendedUse !== base.intendedUse) patch.intendedUse = form.intendedUse;
  for (const field of ESTAR_DEVICE_FIELDS) {
    const value = form[field].trim();
    if (value !== base[field]) patch[field] = value;
  }
  return patch;
}

/**
 * Pure: offer an openFDA classification hit into the form. The hit's product
 * code and device class fill as before; its regulation number fills
 * regulationNumber and its "device name" — which in openFDA's classification
 * dataset IS the 21 CFR classification name — fills classificationName. A
 * blank or unmappable value leaves the typed field alone. Nothing is saved
 * here; the user reviews and clicks Save.
 */
export function classificationAutofill(form: FormState, hit: ClassificationHit): FormState {
  const cls = romanDeviceClass(hit.deviceClass);
  return {
    ...form,
    productCode: hit.productCode?.trim() || form.productCode,
    deviceClass: cls ?? form.deviceClass,
    regulationNumber: hit.regulationNumber?.trim() || form.regulationNumber,
    classificationName: hit.deviceName?.trim() || form.classificationName,
  };
}

/**
 * The one-line verdict above the standards list. Pure + exported so the three
 * states stay pinned by a test rather than by however the JSX happens to read.
 *
 * `null` means "the request itself failed" — distinct again from the server's
 * own honest unavailable, because a network error is not evidence about FDA's
 * list either way.
 */
export function standardsStatusLine(result: RecognizedStandardsResult | null): string {
  if (!result) return 'Standards lookup failed — could not reach the server';
  if (!result.available) {
    return `Recognized standards unavailable — ${result.unavailableReason ?? 'unknown reason'}`;
  }
  if (result.matched === 0) {
    return (
      `FDA's recognition list holds no consensus standard against product code ` +
      `${result.productCode ?? '—'}. This is the list's answer, not a gap in the lookup.`
    );
  }
  const list = result.provenance?.recognitionListNumber;
  return (
    `${result.matched} recognized standard${result.matched === 1 ? '' : 's'} for product code ` +
    `${result.productCode ?? '—'}${list ? ` · FDA Recognition List ${list}` : ''}`
  );
}

/** The kit's intake-field idiom, shared with EstarFilingPanel's
 *  correspondent block so both forms read as one. */
export const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-300)',
  display: 'block',
  marginBottom: 3,
};
export const fieldInputStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 12,
  padding: '5px 8px',
  background: 'var(--bg-050)',
  border: '1px solid var(--border-100)',
  borderRadius: 6,
  color: 'var(--text-200)',
};

/** One labelled single-line intake input in the kit's form markup. */
export function IntakeTextField({
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label>
      <span style={fieldLabelStyle}>{label}</span>
      <input
        style={fieldInputStyle}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
      />
    </label>
  );
}

/** The five eSTAR device facts, laid out under the classification row. */
function EstarDeviceFields({
  form,
  onChange,
}: {
  form: FormState;
  onChange: (field: EstarDeviceField, value: string) => void;
}) {
  const field = (name: EstarDeviceField) => (
    <IntakeTextField
      label={ESTAR_DEVICE_FIELD_LABELS[name].label}
      placeholder={ESTAR_DEVICE_FIELD_LABELS[name].placeholder}
      value={form[name]}
      maxLength={ESTAR_DEVICE_FIELD_LABELS[name].max}
      onChange={(v) => onChange(name, v)}
    />
  );
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 10, marginTop: 10 }}>
        {field('commonName')}
        {field('classificationName')}
        {field('regulationNumber')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10, marginTop: 10 }}>
        {field('associatedProductCodes')}
        {field('indicationsForUseCitation')}
      </div>
    </>
  );
}

export interface DeviceProfilePanelProps {
  /** regulatoryPrograms UUID or program code; null = no program selected. */
  ident: string | null;
}

export function DeviceProfilePanel({ ident }: DeviceProfilePanelProps) {
  const { profile, loading, error, save, saveFailure } = useDeviceProfile(ident);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => formFromProfile(null));
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  /* A failed save is held as a FLAG, not as a sentence. The sentence depends on
     `saveFailure`, which the hook sets in the same batch as this flag, so
     resolving it at render time reads the current classification rather than a
     stale one captured inside the handler's closure. */
  const [saveRefused, setSaveRefused] = useState(false);
  const [standardsBusy, setStandardsBusy] = useState(false);
  /* undefined = never asked. null = the request failed. Otherwise the server's
     labelled envelope, rendered as-is. */
  const [standards, setStandards] = useState<RecognizedStandardsResult | null | undefined>(
    undefined,
  );

  /* Re-seed the form whenever the loaded profile changes (program switch,
     refresh after save) — never mid-edit from a stale render. */
  useEffect(() => {
    setForm(formFromProfile(profile));
    /* A standards answer belongs to the product code it was asked for. Drop it
       on a program switch rather than let it sit under the next device. */
    setStandards(undefined);
  }, [profile]);

  const patch = profilePatch(profile, form);
  const dirty = Object.keys(patch).length > 0;

  const summary = !ident
    ? 'The device profile is held per program'
    : loading
      ? 'Loading device profile…'
      : error
        ? `Device profile unavailable — ${error}`
        : profile
          ? [
              profile.productName ?? profile.name,
              profile.deviceClass ? `Class ${profile.deviceClass}` : null,
              pathLabel(profile.regulatoryPath),
              profile.productCode ? `code ${profile.productCode}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'No intake details yet'
          : 'No device profile yet';

  async function onSave() {
    if (!ident || !dirty || saving) return;
    setSaving(true);
    setStatus(null);
    setSaveRefused(false);
    const saved = await save(patch);
    setSaving(false);
    setSaveRefused(!saved);
    setStatus(saved ? 'Saved' : null);
    /* The official eSTAR preview reads these five facts and names this form as
       their home ("Not set — Device profile · common name"). Only an ACCEPTED
       save changed anything, so only an accepted save asks it to re-read. */
    if (saved) notifyOfficialEstarFieldsChanged();
  }

  async function onLookup() {
    if (lookingUp) return;
    setLookingUp(true);
    setStatus(null);
    /* A lookup result replaces the save outcome in the one status line, so the
       refusal must clear with it — otherwise the lookup's message and a stale
       "not saved" would compete for the same slot. */
    setSaveRefused(false);
    const code = form.productCode.trim();
    const result = await lookupClassification(
      code ? { productCode: code } : { deviceName: form.productName.trim() },
    );
    setLookingUp(false);
    if (!result) {
      setStatus('Classification lookup failed — could not reach the server');
      return;
    }
    if (!result.available) {
      setStatus(`Classification lookup unavailable — ${result.unavailableReason ?? 'unknown reason'}`);
      return;
    }
    if (result.results.length === 0) {
      setStatus('No openFDA classification matched — check the product code or device name');
      return;
    }
    const top = result.results[0];
    const cls = romanDeviceClass(top.deviceClass);
    setForm((f) => classificationAutofill(f, top));
    setStatus(
      `openFDA match: ${top.deviceName || 'unnamed device'} · code ${top.productCode || '—'} · class ${
        cls ?? (top.deviceClass || '—')
      } · reg ${top.regulationNumber || '—'} — review and Save`,
    );
  }

  async function onLookupStandards() {
    if (standardsBusy) return;
    setStandardsBusy(true);
    /* Send the typed code when there is one so an operator can check a code
       before saving it; otherwise let the server read the saved profile. */
    const typed = form.productCode.trim();
    const result = await lookupRecognizedStandards({ ident, productCode: typed || null });
    setStandards(result);
    setStandardsBusy(false);
  }

  return (
    <>
      <div className="section-hdr">
        <div>
          <div className="section-title">Device profile</div>
          <div className="section-sub">{summary}</div>
        </div>
        <button
          className="section-more"
          disabled={!ident}
          title={ident ? (open ? 'Collapse the intake form' : 'Edit the device intake fields') : 'Editing is available once a program is open'}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Hide' : 'Edit'}
        </button>
      </div>

      {open && ident && (
        <div
          style={{
            margin: '8px 0 12px',
            padding: '12px 14px',
            border: '1px solid var(--border-100)',
            borderRadius: 6,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10 }}>
            <IntakeTextField
              label="Product name"
              value={form.productName}
              onChange={(v) => setForm((f) => ({ ...f, productName: v }))}
              placeholder="e.g. Continuous glucose monitor"
            />
            <label>
              <span style={fieldLabelStyle}>Device class</span>
              <select
                style={fieldInputStyle}
                value={form.deviceClass}
                onChange={(e) => setForm((f) => ({ ...f, deviceClass: e.target.value }))}
              >
                <option value="">Not set</option>
                {DEVICE_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    Class {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span style={fieldLabelStyle}>Regulatory path</span>
              <select
                style={fieldInputStyle}
                value={form.regulatoryPath}
                onChange={(e) => setForm((f) => ({ ...f, regulatoryPath: e.target.value }))}
              >
                <option value="">Not set</option>
                {REGULATORY_PATHS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <IntakeTextField
              label="Product code"
              value={form.productCode}
              onChange={(v) => setForm((f) => ({ ...f, productCode: v }))}
              placeholder="e.g. MDS"
            />
          </div>
          <EstarDeviceFields
            form={form}
            onChange={(field, v) => setForm((f) => ({ ...f, [field]: v }))}
          />
          <label style={{ display: 'block', marginTop: 10 }}>
            <span style={fieldLabelStyle}>Intended use</span>
            <textarea
              style={{ ...fieldInputStyle, resize: 'vertical' }}
              rows={3}
              value={form.intendedUse}
              onChange={(e) => setForm((f) => ({ ...f, intendedUse: e.target.value }))}
              placeholder="Intended use statement"
            />
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
            <button
              className="section-more"
              disabled={saving || !dirty}
              title={dirty ? 'Save the changed fields' : 'No changes to save'}
              onClick={() => void onSave()}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              className="section-more"
              disabled={lookingUp || (!form.productCode.trim() && form.productName.trim().length < 2)}
              title="Look up the FDA classification on openFDA by product code (or device name) — fills the form, you still Save"
              onClick={() => void onLookup()}
            >
              {lookingUp ? 'Looking up…' : 'Look up classification'}
            </button>
            <button
              className="section-more"
              disabled={standardsBusy}
              title="Look up the consensus standards FDA recognizes for this product code"
              onClick={() => void onLookupStandards()}
            >
              {standardsBusy ? 'Looking up…' : 'Recognized standards'}
            </button>
            {(status || saveRefused) && (
              <span className="section-sub" role="status" style={{ margin: 0 }}>
                {saveRefused ? describeSaveFailure(saveFailure ?? 'unavailable') : status}
              </span>
            )}
          </div>

          {standards !== undefined && (
            <div style={{ marginTop: 12, borderTop: '1px solid var(--border-100)', paddingTop: 10 }}>
              <div style={fieldLabelStyle}>FDA recognized consensus standards</div>
              <div className="section-sub" role="status" style={{ margin: '0 0 8px' }}>
                {standardsStatusLine(standards)}
              </div>
              {standards?.available && standards.matched > 0 && (
                <div style={{ display: 'grid', gap: 8 }}>
                  {standards.standards.map((s) => (
                    <div
                      key={`${s.recognitionNumber}·${s.designationNumber}`}
                      style={{
                        border: '1px solid var(--border-100)',
                        borderRadius: 6,
                        padding: '8px 10px',
                      }}
                    >
                      <div style={{ fontSize: 12, color: 'var(--text-200)' }}>
                        {s.designationNumber}
                        {s.sdo ? ` · ${s.sdo}` : ''}
                        {` · recognition ${s.recognitionNumber}`}
                        {s.recognitionStatus ? ` · ${s.recognitionStatus}` : ''}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-300)', marginTop: 2 }}>
                        {s.title}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-300)', marginTop: 4 }}>
                        Extent of recognition: {s.extentOfRecognition}
                      </div>
                      {s.transitionEndDate && (
                        <div style={{ fontSize: 11, color: 'var(--text-300)', marginTop: 2 }}>
                          Transition ends {s.transitionEndDate}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {standards?.provenance && (
                <div style={{ fontSize: 11, color: 'var(--text-300)', marginTop: 8 }}>
                  Source: {standards.provenance.source} · retrieved{' '}
                  {standards.provenance.retrievedOn}. Recognition is FDA's; whether a standard
                  applies to this device remains the submitter's determination.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
