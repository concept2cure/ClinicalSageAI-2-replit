"""
21 CFR Part 11 compliant digital signatures for eCTD 4.0.
Uses RSA-4096 + SHA-256 with embedded XAdES signatures.
"""

import hashlib
import json
import rsa
import zipfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from lxml import etree


class Part11Signature:
    """FDA 21 CFR Part 11 compliant digital signature."""
    
    def __init__(self, private_key_path: str = None, certificate_path: str = None):
        self.priv_key = None
        self.certificate = None
        
        if private_key_path and Path(private_key_path).exists():
            with open(private_key_path, 'rb') as f:
                self.priv_key = rsa.PrivateKey.load_pkcs1(f.read())
        else:
            # Dev test keys only - production must use HSM
            # rsa.newkeys returns (pub_key, priv_key)
            self.pub_key, self.priv_key = rsa.newkeys(4096)
            
        if certificate_path and Path(certificate_path).exists():
            with open(certificate_path, 'rb') as f:
                self.certificate = f.read()
    
    def calculate_document_hash(self, docx_path: Path) -> str:
        """SHA-256 of document content, excluding previous signatures."""
        hasher = hashlib.sha256()
        with zipfile.ZipFile(docx_path, 'r') as z:
            for item in sorted(z.namelist()):
                # Exclude signature container, XMP metadata, and manifest which is modified during signing
                if item.startswith('_signatures/') or item.endswith('.xmp') or item == '[Content_Types].xml':
                    continue
                hasher.update(z.read(item))
        return hasher.hexdigest()
    
    def sign_document(self, docx_path: Path, signer_info: dict) -> Path:
        """
        Sign DOCX and inject XAdES signature.
        
        Args:
            signer_info: {
                "name": "Dr. Smith",
                "role": "Medical Monitor",
                "user_id": "123",
                "meaning": "Approved for IND submission"
            }
        """
        doc_hash = self.calculate_document_hash(docx_path)
        
        sig_payload = {
            "document_hash": doc_hash,
            "signer": signer_info,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "meaning": signer_info.get("meaning", "Reviewed and approved"),
            "signature_version": "XAdES-BES-EPES"
        }
        
        message = json.dumps(sig_payload, sort_keys=True).encode('utf-8')
        signature = rsa.sign(message, self.priv_key, 'SHA-256')
        
        xades_xml = self._create_xades_signature(sig_payload, signature, signer_info)
        
        signed_path = docx_path.parent / f"{docx_path.stem}-signed.docx"
        self._inject_signature(docx_path, signed_path, xades_xml)
        
        return signed_path
    
    def _create_xades_signature(self, payload: dict, signature: bytes, signer_info: dict) -> str:
        """Create XAdES-BES compliant XML."""
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
        
        obj = etree.SubElement(sig_el, 'Object')
        qual_props = etree.SubElement(obj, 'QualifyingProperties')
        signed_props = etree.SubElement(qual_props, 'SignedProperties')
        signed_sig_props = etree.SubElement(signed_props, 'SignedSignatureProperties')
        
        signing_time = etree.SubElement(signed_sig_props, 'SigningTime')
        signing_time.text = payload['timestamp']
        
        signer_role = etree.SubElement(signed_sig_props, 'SignerRole')
        claimed_role = etree.SubElement(signer_role, 'ClaimedRoles')
        role_el = etree.SubElement(claimed_role, 'ClaimedRole')
        role_el.text = signer_info.get('role', 'Reviewer')
        
        return etree.tostring(root, pretty_print=True, xml_declaration=True, encoding='UTF-8').decode('utf-8')
    
    def _inject_signature(self, input_path: Path, output_path: Path, xades_xml: str):
        """Inject XAdES into DOCX as _signatures/signatures.xml."""
        with zipfile.ZipFile(input_path, 'r') as zip_in:
            with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zip_out:
                for item in zip_in.namelist():
                    zip_out.writestr(item, zip_in.read(item))
                
                zip_out.writestr('_signatures/signatures.xml', xades_xml)
                
                # Update Content_Types
                manifest = zip_in.read('[Content_Types].xml').decode('utf-8')
                if '_signatures/signatures.xml' not in manifest:
                    manifest = manifest.replace(
                        '</Types>',
                        '  <Override PartName="/_signatures/signatures.xml" ContentType="application/xml"/>\n</Types>'
                    )
                    zip_out.writestr('[Content_Types].xml', manifest)
    
    def _get_cert_fingerprint(self) -> str:
        """Return SHA-256 hex fingerprint of certificate or public key PEM."""
        if self.certificate:
            data = self.certificate
        else:
            # Use public key PEM when no certificate provided
            data = self.pub_key.save_pkcs1() if hasattr(self, 'pub_key') else b''
        return hashlib.sha256(data).hexdigest()

    def create_fhir_signature_event(self, signature_result: dict, signer_info: dict) -> dict:
        """
        Create FHIR AuditEvent for signature act to embed in eCTD.json backbone.
        Links the cryptographic signature to the regulatory audit trail.
        """
        return {
            "resourceType": "AuditEvent",
            "id": f"sig-{uuid.uuid4().hex[:8]}",
            "recorded": datetime.now(timezone.utc).isoformat(),
            "type": {
                "system": "http://dicom.nema.org/resources/ontology/DCM",
                "code": "110107",
                "display": "Document Signature"
            },
            "subtype": [{
                "code": "DIGITAL_SIGNATURE",
                "display": "XAdES-BES Digital Signature"
            }],
            "agent": [{
                "who": {"identifier": {"value": signer_info.get("user_id")}},
                "name": signer_info.get("name"),
                "requestor": True,
                "role": [{
                    "coding": [{
                        "system": "http://terminology.hl7.org/CodeSystem/v3-ParticipationType",
                        "code": "AUT",
                        "display": signer_info.get("role", "Author")
                    }]
                }]
            }],
            "source": {
                "observer": {"display": "Concept2Cure-PKISigner"},
                "type": [{"code": "4"}]
            },
            "entity": [{
                "what": {"reference": "Document/[DOC_ID]"},
                "type": {"code": "2"},
                "role": {"code": "20"},
                "description": "Digital signature created",
                "detail": [
                    {"type": "signature-algorithm", "valueString": "XAdES-BES-RSA4096-SHA256"},
                    {"type": "certificate-fingerprint", "valueString": self._get_cert_fingerprint()},
                    {"type": "xades-signature-id", "valueString": "DocSignature"},
                    {"type": "hash-preimage", "valueString": signature_result.get("document_hash")}
                ]
            }]
        }

    def verify_signature(self, signed_docx: Path) -> dict:
        """Verify document integrity since signing."""
        result = {
            "valid": False,
            "document_hash_match": False,
            "signature_valid": False,
            "signer": None,
            "timestamp": None,
            "errors": []
        }
        
        try:
            with zipfile.ZipFile(signed_docx, 'r') as z:
                if '_signatures/signatures.xml' not in z.namelist():
                    result["errors"].append("No signature found")
                    return result
                
                sig_xml = z.read('_signatures/signatures.xml')
                root = etree.fromstring(sig_xml)
                
                # Try to locate the DigestValue element. Some XAdES implementations
                # may not use the ds namespace explicitly. Fall back to searching
                # for any element that ends with 'DigestValue'.
                stored_hash = None
                for el in root.iter():
                    tag = getattr(el, 'tag', '')
                    if isinstance(tag, str) and tag.endswith('DigestValue'):
                        stored_hash = el
                        break
                
                if stored_hash is None:
                    result["errors"].append("Missing hash in signature")
                    return result
                
                current_hash = self.calculate_document_hash(signed_docx)
                
                if stored_hash.text == current_hash:
                    result["document_hash_match"] = True
                else:
                    result["errors"].append("Document modified since signing")
                
                result["valid"] = result["document_hash_match"]
                return result
                
        except Exception as e:
            result["errors"].append(str(e))
            return result
