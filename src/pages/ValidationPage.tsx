import React, { useEffect, useState } from 'react';
import { getValidationProfiles, getValidationRules } from '../services/validationService';

type ValidationProfile = {
  name: string;
  version: string;
  description: string;
  supported_regions: string[];
};

type ValidationRules = {
  file_format_rules: any[];
  document_rules: any[];
  sequence_rules: any[];
  metadata_rules: any[];
  required_modules: Record<string, any[]>;
};

export default function ValidationPage() {
  const [profiles, setProfiles] = useState<Record<string, ValidationProfile>>({});
  const [rules, setRules] = useState<ValidationRules | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string>('FDA');
  const [submissionType, setSubmissionType] = useState<string>('initial');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProfiles();
  }, []);

  useEffect(() => {
    if (selectedRegion) {
      loadRules(selectedRegion);
    }
  }, [selectedRegion]);

  const loadProfiles = async () => {
    setLoading(true);
    try {
      const result = await getValidationProfiles();
      if (result.status === 'success' && result.profiles) {
        setProfiles(result.profiles);
      } else {
        setError('Failed to load validation profiles');
      }
    } catch (error) {
      console.error('Error loading profiles:', error);
      setError('Failed to load validation profiles');
    } finally {
      setLoading(false);
    }
  };

  const loadRules = async (region: string) => {
    try {
      const result = await getValidationRules(region);
      if (result.status === 'success' && result.rules) {
        setRules(result.rules);
      } else {
        console.error(`Failed to load rules for ${region}`);
        setError(`Failed to load rules for ${region}`);
      }
    } catch (error) {
      console.error(`Error loading rules for ${region}:`, error);
      setError(`Failed to load rules for ${region}`);
    }
  };

  const handleRegionChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedRegion(event.target.value);
  };

  const handleSubmissionTypeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSubmissionType(event.target.value);
  };

  // Render required modules for the selected region and submission type
  const renderRequiredModules = () => {
    if (!rules || !rules.required_modules || !rules.required_modules[submissionType]) {
      return <p>No required modules found for this submission type.</p>;
    }

    const modules = rules.required_modules[submissionType];

    return (
      <div className="table-responsive">
        <table className="table table-striped table-bordered">
          <thead>
            <tr>
              <th>Module</th>
              <th>Name</th>
              <th>Required</th>
            </tr>
          </thead>
          <tbody>
            {modules.map((module, index) => (
              <tr key={index}>
                <td>{module.id}</td>
                <td>{module.name}</td>
                <td>
                  {module.required ? (
                    <span className="badge bg-danger">Required</span>
                  ) : (
                    <span className="badge bg-secondary">Optional</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Render validation rules for the selected region
  const renderValidationRules = () => {
    if (!rules || !rules.file_format_rules) {
      return <p>No validation rules found.</p>;
    }

    return (
      <div className="table-responsive">
        <h5>File Format Rules</h5>
        <table className="table table-striped table-bordered">
          <thead>
            <tr>
              <th>Rule ID</th>
              <th>Description</th>
              <th>Severity</th>
            </tr>
          </thead>
          <tbody>
            {rules.file_format_rules.map((rule, index) => (
              <tr key={index}>
                <td>{rule.id}</td>
                <td>{rule.description}</td>
                <td>
                  <span
                    className={`badge ${rule.severity === 'error' ? 'bg-danger' : 'bg-warning'}`}
                  >
                    {rule.severity}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (loading) {
    return <div className="container mt-4">Loading validation profiles...</div>;
  }

  if (error) {
    return <div className="container mt-4 alert alert-danger">{error}</div>;
  }

  return (
    <div className="container py-4">
      <h2>Validation Profiles</h2>
      <div className="row mb-4">
        <div className="col-md-6">
          <div className="card">
            <div className="card-header">
              <h5>Region Selection</h5>
            </div>
            <div className="card-body">
              <div className="mb-3">
                <label htmlFor="regionSelect" className="form-label">
                  Select Regulatory Region
                </label>
                <select
                  id="regionSelect"
                  className="form-select"
                  value={selectedRegion}
                  onChange={handleRegionChange}
                >
                  <option value="FDA">FDA (US)</option>
                  <option value="EMA">EMA (EU)</option>
                  <option value="PMDA">PMDA (Japan)</option>
                </select>
              </div>
              <div className="mb-3">
                <label htmlFor="submissionTypeSelect" className="form-label">
                  Submission Type
                </label>
                <select
                  id="submissionTypeSelect"
                  className="form-select"
                  value={submissionType}
                  onChange={handleSubmissionTypeChange}
                >
                  <option value="initial">Initial</option>
                  <option value="variation">Variation</option>
                  <option value="renewal">Renewal</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <div className="col-md-6">
          <div className="card">
            <div className="card-header">
              <h5>Profile Information</h5>
            </div>
            <div className="card-body">
              {profiles[selectedRegion] ? (
                <div>
                  <h6>
                    {profiles[selectedRegion].name} v{profiles[selectedRegion].version}
                  </h6>
                  <p>{profiles[selectedRegion].description}</p>
                  <div>
                    <strong>Supported Regions:</strong>{' '}
                    {profiles[selectedRegion].supported_regions.join(', ')}
                  </div>
                </div>
              ) : (
                <p>No profile information available for {selectedRegion}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header">
          <h5>
            Required Modules for {selectedRegion} - {submissionType}
          </h5>
        </div>
        <div className="card-body">{renderRequiredModules()}</div>
      </div>

      <div className="card">
        <div className="card-header">
          <h5>Validation Rules for {selectedRegion}</h5>
        </div>
        <div className="card-body">{renderValidationRules()}</div>
      </div>
    </div>
  );
}
