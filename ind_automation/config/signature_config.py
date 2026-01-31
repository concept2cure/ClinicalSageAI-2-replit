"""
FDA 21 CFR Part 11 compliant signature configuration.
Environment-based signer selection with audit logging.
"""

import os
from typing import Dict, Any
from enum import Enum


class SignerMode(Enum):
    DEV = "dev"           # Ephemeral keys (CI/local)
    HSM_KMS = "hsm_kms"   # AWS KMS production
    HSM_VAULT = "hsm_vault"  # HashiCorp Vault (future)
    PKCS11 = "pkcs11"     # YubiHSM/SmartCard (future)


class SignatureConfig:
    """
    Loads signature configuration from environment.
    Validates FDA Part 11 requirements for production.
    """

    def __init__(self):
        mode_val = os.getenv('CONCEPT2CURE_SIGNER_MODE', 'dev')
        try:
            self.mode = SignerMode(mode_val)
        except ValueError:
            raise ValueError(f"Unknown SIGNER_MODE: {mode_val}. Valid: {[m.value for m in SignerMode]}")
        self._validate_config()

    def _validate_config(self):
        """Ensure production configs have required security parameters."""
        if self.mode == SignerMode.HSM_KMS:
            required = ['KMS_KEY_ID', 'AWS_REGION']
            missing = [var for var in required if not os.getenv(var)]
            if missing:
                raise ValueError(
                    f"HSM_KMS mode requires env vars: {missing}. Found: {list(os.environ.keys())}"
                )

            # FDA Part 11: Key custody documentation required
            if not os.getenv('KMS_KEY_CUSTODY_SOP'):
                import warnings
                warnings.warn(
                    "FDA Warning: No KMS_KEY_CUSTODY_SOP documented. Required for 21 CFR Part 11 audit trail."
                )

    def get_signer_config(self) -> Dict[str, Any]:
        """Return signer class and initialization parameters."""
        if self.mode == SignerMode.DEV:
            from ind_automation.signatures.pki_signer import Part11Signature
            return {
                'class': Part11Signature,
                'params': {
                    'private_key_path': os.getenv('DEV_KEY_PATH'),
                    'certificate_path': os.getenv('DEV_CERT_PATH')
                }
            }

        elif self.mode == SignerMode.HSM_KMS:
            from ind_automation.signatures.hsm_signer import HSMSignature
            return {
                'class': HSMSignature,
                'params': {
                    'kms_key_id': os.getenv('KMS_KEY_ID'),
                    'region': os.getenv('AWS_REGION', 'us-east-1'),
                    'certificate_path': os.getenv('KMS_CERT_PATH')
                },
                'audit': {
                    'cloudtrail': True,
                    'key_custody_sop': os.getenv('KMS_KEY_CUSTODY_SOP'),
                    'rotation_policy': os.getenv('KMS_ROTATION_POLICY', 'annual')
                }
            }

        else:
            raise NotImplementedError(f"Mode {self.mode} not implemented")

    def is_production(self) -> bool:
        """Determine if running in production (HSM-backed)."""
        return self.mode in [SignerMode.HSM_KMS, SignerMode.HSM_VAULT, SignerMode.PKCS11]

    def get_audit_metadata(self) -> Dict[str, str]:
        """Return configuration metadata for FHIR AuditEvent."""
        return {
            'signer_mode': self.mode.value,
            'environment': 'production' if self.is_production() else 'development',
            'key_custody': os.getenv('KMS_KEY_CUSTODY_SOP', 'n/a'),
            'hosted_in': os.getenv('AWS_REGION', 'local')
        }
