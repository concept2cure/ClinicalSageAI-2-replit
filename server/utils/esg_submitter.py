"""
FDA ESG (Electronic Submissions Gateway) Submitter
-------------------------------------------------
Handles creation of compliant eCTD submission packages and secure submission 
to the FDA ESG via SFTP, including acknowledgment processing.

Functions:
- generate_manifest: Creates an index-md5.txt manifest file for the sequence
- zip_sequence: Archives the sequence directory into a compliant submission zip
- submit_to_esg: Uploads the package to FDA ESG via SFTP
- check_acknowledgments: Polls for and retrieves acknowledgment files
- process_acknowledgment: Parses acknowledgment XML for status and metadata
"""

import os
import logging
import zipfile
import hashlib
import paramiko
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ESG Connection parameters - retrieved from environment variables
ESG_HOST = os.environ.get('ESG_HOST', '')
ESG_PORT = int(os.environ.get('ESG_PORT', '22'))
ESG_USER = os.environ.get('ESG_USER', '')
ESG_KEY_PATH = os.environ.get('ESG_KEY', '')
ESG_OUTGOING_DIR = 'outgoing'
ESG_INCOMING_DIR = 'incoming'


def generate_manifest(sequence_dir: str) -> str:
    """
    Walks the eCTD sequence directory and creates an index-md5.txt manifest file
    listing all files with their MD5 checksums.
    
    Args:
        sequence_dir: Path to the sequence directory (e.g., /mnt/data/ectd/0001)
        
    Returns:
        Path to the generated manifest file
    """
    logger.info(f"Generating manifest for sequence in {sequence_dir}")
    sequence_path = Path(sequence_dir)
    manifest_path = sequence_path / "index-md5.txt"
    
    with open(manifest_path, "w") as manifest:
        manifest.write(f"# eCTD Sequence Manifest {datetime.now().isoformat()}\n")
        manifest.write("# Filename | MD5 Checksum\n")
        
        # Walk the directory and calculate MD5 for each file
        for root, _, files in os.walk(sequence_path):
            for file in sorted(files):
                # Skip the manifest itself
                if file == "index-md5.txt":
                    continue
                
                file_path = Path(root) / file
                relative_path = file_path.relative_to(sequence_path)
                
                # Calculate MD5
                md5_hash = hashlib.md5()
                with open(file_path, "rb") as f:
                    for chunk in iter(lambda: f.read(4096), b""):
                        md5_hash.update(chunk)
                
                # Write to manifest
                manifest.write(f"{relative_path} | {md5_hash.hexdigest()}\n")
    
    logger.info(f"Manifest generated at {manifest_path}")
    return str(manifest_path)


def zip_sequence(sequence_dir: str) -> str:
    """
    Archives the entire sequence directory into a single zip file
    suitable for FDA ESG submission.
    
    Args:
        sequence_dir: Path to the sequence directory (e.g., /mnt/data/ectd/0001)
        
    Returns:
        Path to the generated zip file
    """
    logger.info(f"Creating submission archive for {sequence_dir}")
    sequence_path = Path(sequence_dir)
    sequence_id = sequence_path.name
    zip_path = sequence_path.parent / f"{sequence_id}.zip"
    
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        # First add the manifest
        manifest_path = generate_manifest(sequence_dir)
        zipf.write(
            manifest_path, 
            arcname=Path(manifest_path).relative_to(sequence_path.parent)
        )
        
        # Add all remaining files
        for root, _, files in os.walk(sequence_path):
            for file in files:
                file_path = Path(root) / file
                arcname = file_path.relative_to(sequence_path.parent)
                zipf.write(file_path, arcname=arcname)
    
    logger.info(f"Submission archive created at {zip_path}")
    return str(zip_path)


def submit_to_esg(sequence_dir: str) -> Dict:
    """
    Submits the sequence to FDA ESG via SFTP.
    Requires ESG credentials to be set in environment variables.
    
    Args:
        sequence_dir: Path to the sequence directory (e.g., /mnt/data/ectd/0001)
        
    Returns:
        Dictionary with submission details including status, timestamp, and tracking info
    """
    sequence_path = Path(sequence_dir)
    sequence_id = sequence_path.name
    
    # Validate environment settings
    if not all([ESG_HOST, ESG_USER, ESG_KEY_PATH]):
        error_msg = "Missing ESG connection settings. Please set ESG_HOST, ESG_USER, and ESG_KEY environment variables."
        logger.error(error_msg)
        return {
            "success": False,
            "error": error_msg,
            "timestamp": datetime.now().isoformat(),
            "sequence_id": sequence_id
        }
    
    try:
        # Create the zip file if it doesn't exist
        zip_path = sequence_path.parent / f"{sequence_id}.zip"
        if not zip_path.exists():
            zip_path = Path(zip_sequence(sequence_dir))
        
        # Connect to ESG via SFTP
        logger.info(f"Connecting to FDA ESG at {ESG_HOST}")
        transport = paramiko.Transport((ESG_HOST, ESG_PORT))
        key = paramiko.RSAKey.from_private_key_file(ESG_KEY_PATH)
        transport.connect(username=ESG_USER, pkey=key)
        sftp = paramiko.SFTPClient.from_transport(transport)
        
        # Create remote directory if it doesn't exist
        remote_dir = f"{ESG_OUTGOING_DIR}/{datetime.now().strftime('%Y%m%d')}_{sequence_id}"
        try:
            sftp.mkdir(remote_dir)
        except IOError:
            logger.info(f"Remote directory {remote_dir} already exists")
        
        # Upload zip file
        remote_zip_path = f"{remote_dir}/{sequence_id}.zip"
        logger.info(f"Uploading {zip_path} to {remote_zip_path}")
        sftp.put(str(zip_path), remote_zip_path)
        
        # Upload manifest
        manifest_path = sequence_path / "index-md5.txt"
        remote_manifest_path = f"{remote_dir}/index-md5.txt"
        sftp.put(str(manifest_path), remote_manifest_path)
        
        # Close connection
        sftp.close()
        transport.close()
        
        logger.info(f"Submission complete for sequence {sequence_id}")
        return {
            "success": True,
            "timestamp": datetime.now().isoformat(),
            "sequence_id": sequence_id,
            "remote_dir": remote_dir,
            "files_uploaded": [f"{sequence_id}.zip", "index-md5.txt"]
        }
        
    except Exception as e:
        error_msg = f"Error during ESG submission: {str(e)}"
        logger.error(error_msg)
        return {
            "success": False,
            "error": error_msg,
            "timestamp": datetime.now().isoformat(),
            "sequence_id": sequence_id
        }


def check_acknowledgments(sequence_id: str, max_attempts: int = 24, interval: int = 3600) -> Optional[Dict]:
    """
    Polls the FDA ESG incoming directory for acknowledgment files related to a submission.
    Typically checks every hour for up to 24 hours by default.
    
    Args:
        sequence_id: Four-digit sequence ID (e.g., "0001")
        max_attempts: Maximum number of polling attempts
        interval: Seconds to wait between attempts
        
    Returns:
        Dictionary with acknowledgment details or None if no acknowledgment found
    """
    logger.info(f"Beginning acknowledgment polling for sequence {sequence_id}")
    
    # Validate environment settings
    if not all([ESG_HOST, ESG_USER, ESG_KEY_PATH]):
        error_msg = "Missing ESG connection settings. Please set ESG_HOST, ESG_USER, and ESG_KEY environment variables."
        logger.error(error_msg)
        return None
    
    for attempt in range(1, max_attempts + 1):
        logger.info(f"Polling attempt {attempt}/{max_attempts} for sequence {sequence_id}")
        
        try:
            # Connect to ESG via SFTP
            transport = paramiko.Transport((ESG_HOST, ESG_PORT))
            key = paramiko.RSAKey.from_private_key_file(ESG_KEY_PATH)
            transport.connect(username=ESG_USER, pkey=key)
            sftp = paramiko.SFTPClient.from_transport(transport)
            
            # Check incoming directory for acknowledgments
            incoming_files = sftp.listdir(ESG_INCOMING_DIR)
            ack_files = [f for f in incoming_files if f.startswith(f"ACK_{sequence_id}") and f.endswith(".xml")]
            
            if ack_files:
                logger.info(f"Found acknowledgment files: {ack_files}")
                ack_data = {}
                
                # Download all acknowledgment files
                temp_dir = Path(f"/tmp/ack_{sequence_id}_{int(time.time())}")
                temp_dir.mkdir(parents=True, exist_ok=True)
                
                for ack_file in ack_files:
                    remote_path = f"{ESG_INCOMING_DIR}/{ack_file}"
                    local_path = temp_dir / ack_file
                    sftp.get(remote_path, str(local_path))
                    
                    # Process each acknowledgment
                    ack_info = process_acknowledgment(str(local_path))
                    if ack_info:
                        ack_data[ack_file] = ack_info
                
                # Close connection
                sftp.close()
                transport.close()
                
                if ack_data:
                    return {
                        "sequence_id": sequence_id,
                        "timestamp": datetime.now().isoformat(),
                        "acknowledgments": ack_data
                    }
            
            # Close connection
            sftp.close()
            transport.close()
            
            # Wait before next attempt if no acknowledgments found
            if attempt < max_attempts:
                logger.info(f"No acknowledgments found for sequence {sequence_id}, waiting {interval} seconds")
                time.sleep(interval)
                
        except Exception as e:
            logger.error(f"Error checking acknowledgments: {str(e)}")
            if attempt < max_attempts:
                time.sleep(interval)
    
    logger.warning(f"No acknowledgments found for sequence {sequence_id} after {max_attempts} attempts")
    return None


def process_acknowledgment(file_path: str) -> Optional[Dict]:
    """
    Parses an FDA ESG acknowledgment XML file and extracts status and metadata.
    
    Args:
        file_path: Path to the acknowledgment XML file
        
    Returns:
        Dictionary with parsed acknowledgment details or None if parsing failed
    """
    try:
        tree = ET.parse(file_path)
        root = tree.getroot()
        
        # Extract common fields (simplified - actual FDA ACK has more complex structure)
        ack_data = {
            "status": "unknown",
            "receipt_id": "",
            "timestamp": "",
            "details": {}
        }
        
        # Attempt to extract key fields (simplified - would need to be adapted to actual FDA ACK format)
        status_elem = root.find(".//status")
        if status_elem is not None:
            ack_data["status"] = status_elem.text
            
        receipt_id_elem = root.find(".//receipt_id")
        if receipt_id_elem is not None:
            ack_data["receipt_id"] = receipt_id_elem.text
            
        timestamp_elem = root.find(".//timestamp")
        if timestamp_elem is not None:
            ack_data["timestamp"] = timestamp_elem.text
        
        # Extract any warnings or errors
        warnings = root.findall(".//warning")
        if warnings:
            ack_data["details"]["warnings"] = [w.text for w in warnings if w.text]
            
        errors = root.findall(".//error")
        if errors:
            ack_data["details"]["errors"] = [e.text for e in errors if e.text]
        
        return ack_data
    
    except Exception as e:
        logger.error(f"Error processing acknowledgment file {file_path}: {str(e)}")
        return None
