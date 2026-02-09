"""
HSM-backed signatures for 21 CFR Part 11 production.
Uses AWS KMS (RSA-4096) with CloudTrail audit logging.
"""

import json
import hashlib
import base64
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from ind_automation.signatures.pki_signer import Part11Signature


class HSMSignature(Part11Signature):
    """HSM-backed signatures via AWS KMS.

    Private key never leaves KMS/HSM boundary. CloudTrail records Sign operations
    for auditability (who, when, which key).
    """

    def __init__(self, kms_key_id: str, region: str = "us-east-1", certificate_path: Optional[str] = None):
        import boto3  # lazy import — keeps module importable without AWS SDK

        # Do not call super().__init__ to avoid generating dev keys
        self.kms_client = boto3.client('kms', region_name=region)
        self.kms_key_id = kms_key_id
        self.certificate = None
        self.public_key = None
        self.signing_algorithm = None

        if certificate_path:
            with open(certificate_path, 'rb') as f:
                self.certificate = f.read()
        else:
            # Fetch public key from KMS for auditing/verification
            self._fetch_public_key()

    def _fetch_public_key(self):
        resp = self.kms_client.get_public_key(KeyId=self.kms_key_id)
        # PublicKey is DER-encoded SubjectPublicKeyInfo
        self.public_key = resp.get('PublicKey')
        self.signing_algorithm = resp.get('SigningAlgorithms', [None])[0]

    def sign_raw(self, data: bytes) -> bytes:
        """Sign pre-hashed data via KMS. Caller must provide the digest (MessageType='DIGEST')."""
        # Data here is expected to be the digest for KMS when MessageType='DIGEST'
        resp = self.kms_client.sign(
            KeyId=self.kms_key_id,
            Message=data,
            MessageType='DIGEST',
            SigningAlgorithm='RSASSA_PKCS1_V1_5_SHA_256'
        )
        return resp['Signature']

    def sign_document(self, docx_path: Path, signer_info: dict) -> Path:
        """Sign document and inject XAdES signature using HSM-sourced signature bytes.

        Creates the same XAdES structure as Part11Signature but uses the KMS signature
        for SignatureValue and includes HSM metadata in KeyInfo for traceability.
        """
        # Compute document hash (content hash) and include hsm metadata in payload
        doc_hash = self.calculate_document_hash(docx_path)
        sig_payload = {
            "document_hash": doc_hash,
            "signer": signer_info,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "meaning": signer_info.get("meaning", "HSM-approved"),
            "hsm_key_id": self.kms_key_id,
            "cloud_trail": True
        }

        message = json.dumps(sig_payload, sort_keys=True).encode('utf-8')
        # KMS expects pre-hashed digest when MessageType='DIGEST'
        digest = hashlib.sha256(message).digest()
        signature = self.sign_raw(digest)

        # Build XAdES XML using HSM signature (hex) and include HSM metadata in KeyInfo
        xades_xml = self._create_xades_with_hsm_sig(sig_payload, signature, signer_info)

        signed_path = docx_path.parent / f"{docx_path.stem}-hsm-signed.docx"
        self._inject_signature(docx_path, signed_path, xades_xml)

        return signed_path

    def create_fhir_signature_event(self, signature_result: dict, signer_info: dict, document_id: str) -> dict:
        """Override to include HSM/KMS metadata in audit event details."""
        event = super().create_fhir_signature_event(signature_result, signer_info, document_id)
        # Append HSM-specific details for traceability
        details = event['entity'][0]['detail']
        details.append({"type": "hsm-provider", "valueString": "AWS-KMS"})
        details.append({"type": "kms-key-id", "valueString": self.kms_key_id})
        return event

    def _create_xades_with_hsm_sig(self, payload: dict, signature: bytes, signer_info: dict) -> str:
        """Create a simplified XAdES XML and embed HSM metadata in KeyInfo."""
        from lxml import etree

        root = etree.Element('XAdESSignatures', xmlns='http://uri.etsi.org/01903/v1.3.2#')
        sig_el = etree.SubElement(root, 'Signature', Id='DocSignature')

        signed_info = etree.SubElement(sig_el, 'SignedInfo')
        etree.SubElement(signed_info, 'CanonicalizationMethod', Algorithm='http://www.w3.org/2001/10/xml-exc-c14n#')
        etree.SubElement(signed_info, 'SignatureMethod', Algorithm='http://www.w3.org/2001/04/xmldsig-more#rsa-sha256')

        ref = etree.SubElement(signed_info, 'Reference', URI='')
        etree.SubElement(ref, 'DigestMethod', Algorithm='http://www.w3.org/2001/04/xmlenc#sha256')
        digest_val = etree.SubElement(ref, 'DigestValue')
        digest_val.text = payload['document_hash']

        sig_val = etree.SubElement(sig_el, 'SignatureValue')
        sig_val.text = signature.hex()

        key_info = etree.SubElement(sig_el, 'KeyInfo')
        x509_data = etree.SubElement(key_info, 'X509Data')
        if self.certificate:
            x509_cert = etree.SubElement(x509_data, 'X509Certificate')
            x509_cert.text = self.certificate.decode('utf-8')

        # HSM metadata
        hsm_info = etree.SubElement(key_info, 'HSMInfo')
        hsm_info.set('provider', 'AWS-KMS')
        hsm_info.set('keyId', self.kms_key_id)

        # Signed properties
        obj = etree.SubElement(sig_el, 'Object')
        qual_props = etree.SubElement(obj, 'QualifyingProperties')
        signed_props = etree.SubElement(qual_props, 'SignedProperties')
        signed_sig_props = etree.SubElement(signed_props, 'SignedSignatureProperties')

        signing_time = etree.SubElement(signed_sig_props, 'SigningTime')
        signing_time.text = payload['timestamp']

        signer_role = etree.SubElement(signed_sig_props, 'SignerRole')
        claimed_role = etree.SubElement(signer_role, 'ClaimedRoles')
        role_el = etree.SubElement(claimed_role, 'ClaimedRole')
        role_el.text = signer_info.get('role', 'HSM-User')

        return etree.tostring(root, pretty_print=True, xml_declaration=True, encoding='UTF-8').decode('utf-8')
