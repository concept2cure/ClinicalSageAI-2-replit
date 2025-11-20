"""
JP eValidator Integration Module

This module provides integration with the Japanese PMDA eValidator system
for validating eCTD submissions according to Japanese regulatory requirements.

Key features:
1. Profile configuration for JP-specific validation rules
2. Execution of validation against submission packages
3. Processing and parsing of validation results
4. Integration with the application's broader validation framework
"""

import os
import json
import subprocess
import logging
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple

# Configure logging
logger = logging.getLogger(__name__)

# JP eValidator profile configuration
JP_VALIDATOR_PROFILE = {
    "version": "1.0.0",
    "name": "JP-PMDA-eCTD-Validator",
    "description": "Validation profile for PMDA eCTD submissions",
    "authority": "PMDA",
    "rules": {
        "jp_annex_required": {
            "enabled": True, 
            "severity": "ERROR"
        },
        "jp_backbone_attributes": {
            "enabled": True,
            "severity": "ERROR"
        },
        "jp_regional_metadata": {
            "enabled": True,
            "severity": "ERROR"
        },
        "jp_xml_encoding": {
            "enabled": True,
            "severity": "ERROR"
        },
        "jp_file_checksum": {
            "enabled": True,
            "severity": "ERROR"
        },
        "jp_file_formats": {
            "enabled": True,
            "severity": "ERROR"
        },
        "jp_folder_structure": {
            "enabled": True,
            "severity": "ERROR"
        },
        "jp_hyperlinking": {
            "enabled": True,
            "severity": "WARNING"
        },
        "jp_lifecycle_operations": {
            "enabled": True,
            "severity": "ERROR"
        }
    }
}

class JpEValidator:
    """
    Handles validation of eCTD submissions against PMDA requirements
    """
    
    def __init__(self, validator_path: Optional[str] = None, profile: Dict = None):
        """
        Initialize the JP eValidator
        
        Args:
            validator_path: Path to the validator executable (uses system default if None)
            profile: Validator profile configuration (uses default if None)
        """
        self.validator_path = validator_path or os.environ.get('JP_VALIDATOR_PATH', '/opt/pmda/evalidator')
        self.profile = profile or JP_VALIDATOR_PROFILE
        self.results_dir = Path(tempfile.gettempdir()) / "jp_validator_results"
        os.makedirs(self.results_dir, exist_ok=True)
    
    def save_profile(self) -> Path:
        """
        Save the validator profile to a temporary file
        
        Returns:
            Path to the saved profile file
        """
        profile_path = self.results_dir / f"jp_profile_{datetime.now().strftime('%Y%m%d%H%M%S')}.json"
        with open(profile_path, 'w') as f:
            json.dump(self.profile, f, indent=2)
        return profile_path
    
    def validate_submission(self, submission_path: str) -> Tuple[bool, Dict[str, Any]]:
        """
        Validate an eCTD submission against JP requirements
        
        Args:
            submission_path: Path to the submission directory
        
        Returns:
            Tuple of (success, results_dict)
        """
        if not os.path.exists(submission_path):
            logger.error(f"Submission path does not exist: {submission_path}")
            return False, {"error": f"Submission path not found: {submission_path}"}
        
        # Save profile to temporary file
        profile_path = self.save_profile()
        
        # Build output path
        output_path = self.results_dir / f"results_{os.path.basename(submission_path)}_{datetime.now().strftime('%Y%m%d%H%M%S')}.json"
        
        # Build command for validator
        cmd = [
            self.validator_path,
            "--profile", str(profile_path),
            "--submission", submission_path,
            "--output", str(output_path),
            "--format", "json"
        ]
        
        try:
            # Run validator
            logger.info(f"Running JP eValidator: {' '.join(cmd)}")
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=False  # Don't raise exception on non-zero exit
            )
            
            # Check if the validator ran successfully
            if result.returncode != 0:
                logger.error(f"JP eValidator failed with code {result.returncode}: {result.stderr}")
                return False, {
                    "success": False,
                    "timestamp": datetime.now().isoformat(),
                    "error": result.stderr,
                    "command": ' '.join(cmd)
                }
            
            # Parse results
            if os.path.exists(output_path):
                with open(output_path, 'r') as f:
                    validation_results = json.load(f)
                
                # Check for validation success
                validation_success = self._check_validation_success(validation_results)
                
                return validation_success, {
                    "success": validation_success,
                    "timestamp": datetime.now().isoformat(),
                    "results": validation_results,
                    "profile": self.profile["name"]
                }
            else:
                logger.error(f"JP eValidator did not produce output file: {output_path}")
                return False, {
                    "success": False,
                    "timestamp": datetime.now().isoformat(),
                    "error": "Validator did not produce output file",
                    "command": ' '.join(cmd)
                }
                
        except Exception as e:
            logger.exception(f"Error running JP eValidator: {e}")
            return False, {
                "success": False,
                "timestamp": datetime.now().isoformat(),
                "error": str(e),
                "command": ' '.join(cmd)
            }
    
    def _check_validation_success(self, validation_results: Dict[str, Any]) -> bool:
        """
        Determine if validation was successful based on results
        
        A validation is successful if there are no errors, only warnings
        
        Args:
            validation_results: Parsed validation results
            
        Returns:
            True if validation passed, False if it failed
        """
        # If no issues field or empty, consider successful
        if "issues" not in validation_results or not validation_results["issues"]:
            return True
        
        # Check for any ERROR severity issues
        for issue in validation_results.get("issues", []):
            if issue.get("severity", "").upper() == "ERROR":
                return False
        
        # Only warnings or lower severity issues found
        return True


# Command-line interface for testing
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="JP eValidator CLI")
    parser.add_argument("--submission", required=True, help="Path to submission directory")
    parser.add_argument("--validator", help="Path to validator executable")
    
    args = parser.parse_args()
    
    validator = JpEValidator(validator_path=args.validator)
    success, results = validator.validate_submission(args.submission)
    
    print(f"Validation {'successful' if success else 'failed'}")
    print(json.dumps(results, indent=2))