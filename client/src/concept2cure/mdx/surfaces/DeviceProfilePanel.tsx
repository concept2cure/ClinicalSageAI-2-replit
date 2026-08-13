/**
 * DeviceProfilePanel — compact collapsible intake card for the active
 * program's device profile (product name · class · pathway · product code ·
 * intended use), backed by GET/PUT /api/510k/device/profile.
 *
 * The openFDA classification lookup OFFERS autofill: the top hit's product
 * code / device class fill the form fields, and the user still reviews and
 * clicks Save. Honest states throughout — an unavailable lookup shows the
 * server's unavailableReason, a rejected save says "Not saved", and no field
 * is ever filled from a guess (unmappable device classes are left alone).
 *
 * Uses the kit's section/pma-mod classes for visual consistency
 * (EstarFilingPanel is the reference idiom).
 */

import * as React from 'react';
import { useEffect, useState } from 'react';
import {
  useDeviceProfile,
  lookupClassification,
  romanDeviceClass,
  type DeviceProfilePatch,
  type DeviceProfileView,
  type DeviceClass,
  type RegulatoryPath,
} from '../hooks/useDeviceProfile';

const DEVICE_CLASSES: DeviceClass[] = ['I', 'II', 'III'];
const REGULATORY_PATHS: Array<{ value: RegulatoryPath; label: string }> = [
  { value: '510k', label: '510(k)' },
  { value: 'de_novo', label: 'De Novo' },
  { value: 'pma', label: 'PMA' },
];

function pathLabel(path: string | null): string | null {
  return REGULATORY_PATHS.find((p) => p.value === path)?.label ?? path;
}

interface FormState {
  productName: string;
  deviceClass: string;
  regulatoryPath: string;
  productCode: string;
  intendedUse: string;
}

function formFromProfile(profile: DeviceProfileView | null): FormState {
  return {
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
  return patch;
}

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-300)',
  display: 'block',
  marginBottom: 3,
};
const fieldInputStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 12,
  padding: '5px 8px',
  background: 'var(--bg-050)',
  border: '1px solid var(--border-100)',
  borderRadius: 6,
  color: 'var(--text-200)',
};

export interface DeviceProfilePanelProps {
  /** regulatoryPrograms UUID or program code; null = no program selected. */
  ident: string | null;
}

export function DeviceProfilePanel({ ident }: DeviceProfilePanelProps) {
  const { profile, loading, error, save } = useDeviceProfile(ident);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => formFromProfile(null));
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  /* Re-seed the form whenever the loaded profile changes (program switch,
     refresh after save) — never mid-edit from a stale render. */
  useEffect(() => {
    setForm(formFromProfile(profile));
  }, [profile]);

  const patch = profilePatch(profile, form);
  const dirty = Object.keys(patch).length > 0;

  const summary = !ident
    ? 'Select a program to load its device profile'
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
    const saved = await save(patch);
    setSaving(false);
    setStatus(saved ? 'Saved' : 'Not saved — the server rejected the update');
  }

  async function onLookup() {
    if (lookingUp) return;
    setLookingUp(true);
    setStatus(null);
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
    setForm((f) => ({
      ...f,
      productCode: top.productCode || f.productCode,
      deviceClass: cls ?? f.deviceClass,
    }));
    setStatus(
      `openFDA match: ${top.deviceName || 'unnamed device'} · code ${top.productCode || '—'} · class ${
        cls ?? (top.deviceClass || '—')
      } · reg ${top.regulationNumber || '—'} — review and Save`,
    );
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
          title={ident ? (open ? 'Collapse the intake form' : 'Edit the device intake fields') : 'Select a program first'}
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
            <label>
              <span style={fieldLabelStyle}>Product name</span>
              <input
                style={fieldInputStyle}
                value={form.productName}
                onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
                placeholder="e.g. Continuous glucose monitor"
              />
            </label>
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
            <label>
              <span style={fieldLabelStyle}>Product code</span>
              <input
                style={fieldInputStyle}
                value={form.productCode}
                onChange={(e) => setForm((f) => ({ ...f, productCode: e.target.value }))}
                placeholder="e.g. MDS"
              />
            </label>
          </div>
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
            {status && (
              <span className="section-sub" role="status" style={{ margin: 0 }}>
                {status}
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
