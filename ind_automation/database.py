"""
Database Utilities for IND Automation

This module provides functions for interacting with the database,
particularly for audit history tracking.
"""

import logging
import json
from datetime import datetime
from pathlib import Path

# Configure logging
logger = logging.getLogger(__name__)

# Path to project data storage
PROJECTS_DIR = Path("data/projects")

def append_history(project_id, entry):
    """
    Append an entry to a project's history
    
    Args:
        project_id: Project identifier
        entry: Dictionary with history data
    
    Returns:
        Boolean indicating success
    """
    if not project_id:
        raise ValueError("Project ID is required")
    
    if not isinstance(entry, dict):
        raise ValueError("History entry must be a dictionary")
    
    # Ensure required fields
    if "type" not in entry:
        raise ValueError("History entry must have a 'type'")
    
    # Add timestamp if not provided
    if "timestamp" not in entry or entry["timestamp"] is None:
        entry["timestamp"] = datetime.utcnow().isoformat()
    
    try:
        # Create project directory if it doesn't exist
        project_dir = PROJECTS_DIR / project_id
        project_dir.mkdir(parents=True, exist_ok=True)
        
        # Path to history file
        history_file = project_dir / "history.json"
        
        # Load existing history
        history = []
        if history_file.exists():
            with open(history_file, "r") as f:
                history = json.load(f)
        
        # Append new entry
        history.append(entry)
        
        # Write back to file
        with open(history_file, "w") as f:
            json.dump(history, f, indent=2)
        
        logger.info(f"Added history entry to project {project_id}: {entry['type']}")
        return True
    except Exception as e:
        logger.error(f"Failed to append history for project {project_id}: {e}")
        return False

def get_history(project_id):
    """
    Get the history for a project
    
    Args:
        project_id: Project identifier
    
    Returns:
        List of history entries
    """
    if not project_id:
        raise ValueError("Project ID is required")
    
    try:
        # Path to history file
        history_file = PROJECTS_DIR / project_id / "history.json"
        
        # Check if file exists
        if not history_file.exists():
            return []
        
        # Load and return history
        with open(history_file, "r") as f:
            return json.load(f)
    except Exception as e:
        logger.error(f"Failed to get history for project {project_id}: {e}")
        return []