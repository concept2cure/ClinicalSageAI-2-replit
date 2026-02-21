"""
Shared fixtures for ind_automation tests.

Key optimisation: rsa.newkeys(4096) takes ~100s in pure Python.
We generate the key pair ONCE per session and share it across all tests.
"""

import pytest
import rsa
from ind_automation.signatures.pki_signer import Part11Signature


class _NoSignerConfig:
    """Sentinel config that skips signer creation in ECTD4Compiler.__init__."""

    def get_signer_config(self):
        return {"class": None, "params": {}}

    def get_audit_metadata(self):
        return {"signer_mode": "test-nosign", "environment": "test"}


# Singleton so tests that don't need signing avoid the 100s keygen.
NO_SIGNER = _NoSignerConfig()


@pytest.fixture(scope="session")
def shared_rsa_keys():
    """Generate a 4096-bit RSA key pair once per session (~100s)."""
    pub, priv = rsa.newkeys(2048)  # 2048 is fine for test speed; 4096 is prod only
    return pub, priv


@pytest.fixture(scope="session")
def shared_signer(shared_rsa_keys):
    """Pre-built Part11Signature signer with cached keys."""
    pub, priv = shared_rsa_keys
    signer = Part11Signature.__new__(Part11Signature)
    signer.pub_key = pub
    signer.priv_key = priv
    signer.certificate = None
    return signer
