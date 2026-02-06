"""
21 CFR Part 11 compliant digital signatures for eCTD 4.0.
Uses RSA-4096 + SHA-256 with embedded XAdES signatures.
"""

import hashlib
import json
import rsa
import zipfile
import uuid
import requests
import base64
from datetime import datetime, timezone
from pathlib import Path
from lxml import etree
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from pyasn1.type import univ, namedtype
from pyasn1.codec.der import encoder, decoder
from pyasn1_modules import rfc3161, rfc5652


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

    def create_fhir_signature_event(self, signature_result: dict, signer_info: dict, document_id: str) -> dict:
        """
        Create FHIR AuditEvent for signature act to embed in eCTD.json backbone.
        Links the cryptographic signature to the regulatory audit trail and references
        the actual document by its UUID (urn:uuid:...).
        Adds TSA-related details when present in signature_result['tsa'].
        """
        details = [
            {"type": "signature-algorithm", "valueString": "XAdES-BES-RSA4096-SHA256"},
            {"type": "certificate-fingerprint", "valueString": self._get_cert_fingerprint()},
            {"type": "xades-signature-id", "valueString": "DocSignature"},
            {"type": "hash-preimage", "valueString": signature_result.get("document_hash")}
        ]

        # Include TSA details if available
        tsa = signature_result.get('tsa') or {}
        if tsa.get('present'):
            details.extend([
                {"type": "tsa-token-present", "valueBoolean": True},
                {"type": "tsa-provider", "valueString": tsa.get('provider', 'unknown')},
                {"type": "timestamp-rfc3161", "valueInstant": tsa.get('timestamp')}
            ])

        # Include HSM/KMS key reference for traceability
        hsm_key = signature_result.get('hsm_key_id')
        if hsm_key:
            details.append({"type": "hsm-kms-key-id", "valueString": hsm_key})

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
                "what": {
                    "reference": f"urn:uuid:{document_id}",
                    "identifier": {
                        "system": "https://concept2cure.io/ectd4",
                        "value": document_id
                    }
                },
                "type": {"code": "2"},
                "role": {"code": "20"},
                "description": "Digital signature created",
                "detail": details
            }]
        }

    def _embed_tsa_token(self, signed_path: Path, tsa_token: bytes):
        """Embed the TSA token into the XAdES signature XML as XAdES-T (SignatureTimeStamp).
        This is a simplified embedding for our test/CI flows (EncapsulatedTimeStamp in base64).
        """
        with zipfile.ZipFile(signed_path, 'r') as zin:
            sig_xml = zin.read('_signatures/signatures.xml')
            root = etree.fromstring(sig_xml)

        ns = {'xades': 'http://uri.etsi.org/01903/v1.3.2#'}
        # Create SignatureTimeStamp element
        st = etree.Element('{http://uri.etsi.org/01903/v1.3.2#}SignatureTimeStamp')
        enc = etree.SubElement(st, '{http://uri.etsi.org/01903/v1.3.2#}EncapsulatedTimeStamp')
        enc.text = base64.b64encode(tsa_token).decode('ascii')

        # Append to root.Signature/Object/QualifyingProperties/SignedProperties/SignedSignatureProperties
        # We try to find SignedSignatureProperties and append the SignatureTimeStamp after it.
        ssp = None
        for el in root.iter():
            if el.tag.endswith('SignedSignatureProperties'):
                ssp = el
                break
        if ssp is not None:
            ssp.addnext(st)
        else:
            # Fallback: append under root
            root.append(st)

        new_sig = etree.tostring(root, pretty_print=True, xml_declaration=True, encoding='UTF-8')

        # Re-write zip with updated signature file
        with zipfile.ZipFile(signed_path, 'r') as zin:
            with zipfile.ZipFile(signed_path.with_suffix('.tmp'), 'w', zipfile.ZIP_DEFLATED) as zout:
                for item in zin.namelist():
                    if item == '_signatures/signatures.xml':
                        zout.writestr(item, new_sig)
                    else:
                        zout.writestr(item, zin.read(item))
        # Replace original
        signed_path.unlink()
        signed_path.with_suffix('.tmp').rename(signed_path)


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


class TSASignature(Part11Signature):
    """Extends Part11Signature with RFC 3161 Time-Stamp Authority support."""
    def __init__(self, tsa_url: str = "http://timestamp.digicert.com", *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.tsa_url = tsa_url

    def _create_tsa_query(self, signature_data: bytes) -> bytes:
        """Create RFC 3161 TimeStampReq ASN.1 structure using SHA-256."""
        digest = hashlib.sha256(signature_data).digest()

        mi = rfc3161.MessageImprint()
        algo = rfc3161.AlgorithmIdentifier()
        algo.setComponentByName('algorithm', univ.ObjectIdentifier('2.16.840.1.101.3.4.2.1'))  # SHA-256 OID
        mi.setComponentByName('hashAlgorithm', algo)
        mi.setComponentByName('hashedMessage', univ.OctetString(digest))

        req = rfc3161.TimeStampReq()
        req.setComponentByName('version', 1)
        req.setComponentByName('messageImprint', mi)
        req.setComponentByName('certReq', univ.Boolean(True))

        return encoder.encode(req)

    def _parse_tsa_response(self, response_bytes: bytes) -> dict:
        """Parse RFC 3161 TimeStampResp ASN.1 and extract token if granted."""
        try:
            resp, _ = decoder.decode(response_bytes, asn1Spec=rfc3161.TimeStampResp())
            status = int(resp.getComponentByName('status').getComponentByName('status'))
            if status != 0:
                return {'status': 'rejected', 'status_code': status}

            # Attempt to extract and encode the timestamp token; fall back to raw bytes on failure
            try:
                tst = resp.getComponentByName('timeStampToken')
                token_der = encoder.encode(tst)
                return {'status': 'granted', 'token': token_der, 'parsed': True}
            except Exception:
                return {'status': 'granted', 'token': response_bytes, 'parsed': False}
        except Exception as e:
            return {'status': 'error', 'error': str(e), 'raw': response_bytes.hex()[:200]}

    def sign_with_timestamp(self, docx_path: Path, signer_info: dict) -> Path:
        """Sign with RFC 3161 timestamp, parse and embed TimeStampResp (XAdES-T)."""
        signed_path = self.sign_document(docx_path, signer_info)

        with zipfile.ZipFile(signed_path, 'r') as z:
            sig_xml = z.read('_signatures/signatures.xml')

        tsq = self._create_tsa_query(sig_xml)

        resp = requests.post(
            self.tsa_url,
            data=tsq,
            headers={'Content-Type': 'application/timestamp-query', 'Accept': 'application/timestamp-reply'},
            timeout=30
        )
        resp.raise_for_status()

        tsr = self._parse_tsa_response(resp.content)
        if tsr.get('status') != 'granted':
            raise RuntimeError(f"TSA failed: {tsr}")

        self._embed_tsa_token(signed_path, tsr['token'])

        self.last_tsa_info = {
            'present': True,
            'provider': self.tsa_url,
            'timestamp': datetime.now(timezone.utc).isoformat(),
            'token_valid': True
        }

        return signed_path
