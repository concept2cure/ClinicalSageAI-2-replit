import React, { useEffect, useState } from 'react';
import api from '../services/api';

const RULES = [
  'ACK_MISSING',
  'FORMS_MISSING',
  'SERIAL_DUP',
  'META_INCOMPLETE',
  'MODULE3_STALE',
  'MODULE1_STALE',
  'ESG_ROTATE',
  'SAML_EXPIRE',
  'IDP_MISMATCH',
];

const RULE_DESCRIPTIONS = {
  ACK_MISSING: 'ESG submission serial with no ACK_RECEIVED after 24h',
  FORMS_MISSING: 'Any of Form 1571/1572/3674 missing in latest eCTD sequence',
  SERIAL_DUP: 'Duplicate serial number detected in eCTD directory',
  META_INCOMPLETE: 'Project metadata missing required fields (sponsor, PI, IND #)',
  MODULE3_STALE: 'Module 3 doc > 180 days old',
  MODULE1_STALE: 'Any Form 1571/72/3674 > 90 days old',
  ESG_ROTATE: 'ESG key age > 330 days (warn) or > 365 days (critical)',
  SAML_EXPIRE: 'IdP cert expires < 30 days',
  IDP_MISMATCH: 'IdP cert fingerprint changed',
};

export default function RulesSettings({ org }) {
  const [flags, setFlags] = useState({});
  const [form, setForm] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    if (org) {
      api
        .get(`/api/org/${org}/rules`)
        .then(r => {
          setFlags(r.data);
          setForm(r.data);
        })
        .catch(err => console.error('Error loading rules:', err));
    }
  }, [org]);

  const toggle = k => setFlags({ ...flags, [k]: !flags[k] });

  const save = () => {
    setIsSaving(true);
    api
      .put(`/api/org/${org}/rules`, { ...flags, ...form })
      .then(() => {
        setSaveStatus('Rules saved successfully');
        setTimeout(() => setSaveStatus(''), 3000);
      })
      .catch(err => {
        console.error('Error saving rules:', err);
        setSaveStatus('Error saving rules');
      })
      .finally(() => setIsSaving(false));
  };

  if (!org) return <p>Select an organization to configure compliance rules</p>;

  return (
    <div className="border rounded-lg p-5 bg-white shadow">
      <h3 className="text-xl font-semibold mb-4">Compliance Rule Settings</h3>
      <p className="text-sm text-gray-600 mb-4">
        Enable or disable specific compliance rules for this organization. Disabled rules will not
        generate alerts during nightly audits.
      </p>

      <div className="space-y-3 mb-6">
        {RULES.map(k => (
          <div key={k} className="flex items-center p-2 hover:bg-gray-50 rounded">
            <input
              type="checkbox"
              id={`rule-${k}`}
              className="h-4 w-4 text-blue-600"
              checked={flags[k] || false}
              onChange={() => toggle(k)}
            />
            <div className="ml-3">
              <label htmlFor={`rule-${k}`} className="font-medium">
                {k.replace(/_/g, ' ')}
              </label>
              <p className="text-sm text-gray-500">{RULE_DESCRIPTIONS[k]}</p>
            </div>
          </div>
        ))}
      </div>

      <h3 className="text-xl font-semibold mt-8 mb-4">Threshold Settings</h3>
      <p className="text-sm text-gray-600 mb-4">
        Customize the threshold values for each compliance rule.
      </p>

      <div className="space-y-3 mb-6">
        {Object.entries({
          ACK_MISSING_H: 'ESG ACK Missing (hours)',
          MODULE3_STALE_D: 'Module 3 Document Staleness (days)',
          MODULE1_STALE_D: 'Module 1 Forms Staleness (days)',
          ESG_WARN_D: 'ESG Key Rotation Warning (days)',
          ESG_CRIT_D: 'ESG Key Rotation Critical (days)',
          SAML_EXPIRE_D: 'SAML Certificate Expiry Warning (days)',
        }).map(([key, label]) => (
          <div key={key} className="flex items-center p-2 hover:bg-gray-50 rounded">
            <div className="flex-grow">
              <label htmlFor={`threshold-${key}`} className="block font-medium">
                {label}
              </label>
              <p className="text-sm text-gray-500">
                {key.includes('_H') ? 'Hours' : 'Days'} before an alert is triggered
              </p>
            </div>
            <input
              id={`threshold-${key}`}
              type="number"
              className="w-24 px-3 py-2 border rounded-md text-right"
              value={form[key] || ''}
              onChange={e => setForm({ ...form, [key]: parseInt(e.target.value, 10) })}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center">
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium disabled:opacity-70"
          onClick={save}
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Rules'}
        </button>
        {saveStatus && (
          <span
            className={`ml-3 text-sm ${saveStatus.includes('Error') ? 'text-red-600' : 'text-green-600'}`}
          >
            {saveStatus}
          </span>
        )}
      </div>
    </div>
  );
}
