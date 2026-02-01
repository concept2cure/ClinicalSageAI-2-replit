from flask import Flask, request, send_file
import subprocess
import tempfile
import os
from datetime import datetime

app = Flask(__name__)

CERT_DIR = "/certs"
TSA_CERT = f"{CERT_DIR}/tsa_cert.pem"
TSA_KEY = f"{CERT_DIR}/tsa_key.pem"
CA_CERT = f"{CERT_DIR}/ca_cert.pem"


def ensure_certs():
    if not os.path.exists(TSA_CERT):
        os.makedirs(CERT_DIR, exist_ok=True)
        # Generate CA
        subprocess.run([
            "openssl", "req", "-x509", "-nodes", "-newkey", "rsa:4096",
            "-keyout", CA_CERT.replace("ca_cert", "ca_key"),
            "-out", CA_CERT, "-days", "3650", "-subj", "/CN=ROS Staging CA"
        ], check=True)
        # Generate TSA cert
        subprocess.run([
            "openssl", "req", "-newkey", "rsa:4096", "-nodes",
            "-keyout", TSA_KEY, "-out", f"{CERT_DIR}/tsa_req.pem",
            "-subj", "/CN=ROS Staging TSA"
        ], check=True)
        subprocess.run([
            "openssl", "x509", "-req", "-in", f"{CERT_DIR}/tsa_req.pem",
            "-CA", CA_CERT, "-CAkey", CA_CERT.replace("ca_cert", "ca_key"),
            "-out", TSA_CERT, "-days", "1825", "-extensions", "v3_req"
        ], check=True)

@app.route("/tsa", methods=["POST"])
def timestamp():
    """RFC 3161 Time Stamping Authority endpoint"""
    req_data = request.data
    
    with tempfile.NamedTemporaryFile(delete=False) as req_file:
        req_file.write(req_data)
        req_path = req_file.name
    
    resp_path = f"{req_path}.tsr"
    
    try:
        subprocess.run([
            "openssl", "ts", "-reply",
            "-queryfile", req_path,
            "-signer", TSA_CERT,
            "-inkey", TSA_KEY,
            "-cert", "1",  # Include cert in response
            "-out", resp_path
        ], check=True, capture_output=True)
        
        return send_file(resp_path, mimetype="application/timestamp-reply")
    finally:
        os.unlink(req_path)
        if os.path.exists(resp_path):
            os.unlink(resp_path)

@app.route("/health")
def health():
    return {"status": "alive", "tsa_cert_exists": os.path.exists(TSA_CERT)}

if __name__ == "__main__":
    ensure_certs()
    app.run(host="0.0.0.0", port=8080)
