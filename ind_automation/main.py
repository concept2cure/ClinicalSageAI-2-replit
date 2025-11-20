"""
IND Wizard FastAPI Application

This module provides the API endpoints for the IND Wizard functionality,
including project management, form generation, and submission tracking.
"""

import os
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
from pathlib import Path

# Initialize FastAPI application
app = FastAPI(
    title="IND Wizard API",
    description="API for IND Wizard functionality",
    version="1.0.0"
)

# Add CORS middleware to allow cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define data models
class Project(BaseModel):
    """Model for an IND project."""
    project_id: Optional[str] = None
    sponsor: str
    drug_name: str
    protocol: str
    pi_name: str
    pi_address: str
    nct_number: Optional[str] = None
    created: Optional[str] = None
    serial_number: Optional[int] = None

class ProjectResponse(Project):
    """Response model for an IND project."""
    pass

class GenerateSequenceResponse(BaseModel):
    """Response model for sequence generation."""
    serial_number: str

class HistoryItem(BaseModel):
    """Model for a history item."""
    serial: str
    timestamp: str
    type: str

# In-memory storage
# In a real implementation, this would be replaced with a database
projects: Dict[str, Dict[str, Any]] = {}
history: Dict[str, List[Dict[str, Any]]] = {}

# Data file paths
DATA_DIR = Path("ind_automation/data")
PROJECTS_FILE = DATA_DIR / "projects.json"
HISTORY_FILE = DATA_DIR / "history.json"

# Create data directory if it doesn't exist
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Load data from files if they exist
def load_data():
    """Load projects and history data from files."""
    global projects, history
    
    if PROJECTS_FILE.exists():
        try:
            with open(PROJECTS_FILE, "r") as f:
                projects = json.load(f)
        except Exception as e:
            print(f"Error loading projects: {e}")
    
    if HISTORY_FILE.exists():
        try:
            with open(HISTORY_FILE, "r") as f:
                history = json.load(f)
        except Exception as e:
            print(f"Error loading history: {e}")

# Save data to files
def save_data():
    """Save projects and history data to files."""
    try:
        with open(PROJECTS_FILE, "w") as f:
            json.dump(projects, f, indent=2)
    except Exception as e:
        print(f"Error saving projects: {e}")
    
    try:
        with open(HISTORY_FILE, "w") as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        print(f"Error saving history: {e}")

# Load data on startup
@app.on_event("startup")
async def startup_event():
    """Load data on application startup."""
    load_data()
    print("IND Wizard API server started")

# API Endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

@app.post("/api/projects", response_model=ProjectResponse)
async def create_project(project: Project, background_tasks: BackgroundTasks):
    """Create a new IND project."""
    # Generate a unique project ID
    project_id = f"IND-{datetime.now().strftime('%Y%m')}-{str(uuid.uuid4())[:8].upper()}"
    
    # Set created date and initial serial number
    project_dict = project.dict()
    project_dict["project_id"] = project_id
    project_dict["created"] = datetime.now().strftime("%Y-%m-%d")
    project_dict["serial_number"] = 0
    
    # Store the project
    projects[project_id] = project_dict
    
    # Initialize history for this project
    history[project_id] = [{
        "serial": "0001",
        "timestamp": datetime.now().isoformat(),
        "type": "creation"
    }]
    
    # Save data in the background
    background_tasks.add_task(save_data)
    
    return project_dict

@app.get("/api/projects", response_model=List[ProjectResponse])
async def get_projects():
    """Get all IND projects."""
    return list(projects.values())

@app.get("/api/projects/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str):
    """Get an IND project by ID."""
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return projects[project_id]

@app.put("/api/projects/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, project: Project, background_tasks: BackgroundTasks):
    """Update an IND project."""
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Update project data
    project_dict = project.dict(exclude_unset=True)
    for key, value in project_dict.items():
        if value is not None:
            projects[project_id][key] = value
    
    # Add history entry
    if project_id in history:
        history[project_id].append({
            "serial": f"{projects[project_id]['serial_number'] + 1:04d}",
            "timestamp": datetime.now().isoformat(),
            "type": "update"
        })
    
    # Save data in the background
    background_tasks.add_task(save_data)
    
    return projects[project_id]

@app.post("/api/ind/{project_id}/sequence", response_model=GenerateSequenceResponse)
async def generate_sequence(project_id: str, background_tasks: BackgroundTasks):
    """Generate a new sequence number for an IND project."""
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Increment the serial number
    projects[project_id]["serial_number"] += 1
    serial_number = f"{projects[project_id]['serial_number']:04d}"
    
    # Add history entry
    if project_id in history:
        history[project_id].append({
            "serial": serial_number,
            "timestamp": datetime.now().isoformat(),
            "type": "submission"
        })
    
    # Save data in the background
    background_tasks.add_task(save_data)
    
    return {"serial_number": serial_number}

@app.get("/api/ind/{project_id}/history", response_model=List[HistoryItem])
async def get_history(project_id: str):
    """Get the submission history for an IND project."""
    if project_id not in history:
        return []
    
    return history[project_id]

from fastapi.responses import StreamingResponse
from .form_generator import generate_form as generate_form_document

@app.get("/api/ind/{project_id}/forms/{form_type}")
async def generate_form(project_id: str, form_type: str, background_tasks: BackgroundTasks):
    """Generate an FDA form for an IND project."""
    if project_id not in projects:
        raise HTTPException(status_code=404, detail="Project not found")
    
    try:
        # Generate the form document
        form_data = generate_form_document(form_type, projects[project_id])
        
        # Add history entry for form generation
        if project_id in history:
            history[project_id].append({
                "serial": f"{projects[project_id]['serial_number'] + 1:04d}",
                "timestamp": datetime.now().isoformat(),
                "type": "form_generation"
            })
        
        # Save data in the background
        background_tasks.add_task(save_data)
        
        # Set the appropriate content type based on the form type
        # In a real implementation, this would be application/vnd.openxmlformats-officedocument.wordprocessingml.document
        # For now, we'll use text/plain
        media_type = "text/plain"
        
        # Return the form as a streaming response
        return StreamingResponse(
            form_data, 
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="Form{form_type}_{project_id}.txt"'
            }
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating form: {str(e)}")

# Add a demo endpoint for the ENZYMAX FORTE sample project
@app.get("/api/demo/enzymax")
async def create_demo_project(background_tasks: BackgroundTasks):
    """Create a demo project for ENZYMAX FORTE."""
    # Check if demo project already exists
    demo_project_id = None
    for pid, project in projects.items():
        if project["drug_name"] == "ENZYMAX FORTE":
            demo_project_id = pid
            break
    
    if demo_project_id:
        return {"message": "Demo project already exists", "project_id": demo_project_id}
    
    # Create demo project
    project = Project(
        sponsor="TrialSage Pharma",
        drug_name="ENZYMAX FORTE",
        protocol="TS-ENZ-2025",
        pi_name="Dr. Jane Smith",
        pi_address="123 Medical Center, San Francisco, CA 94158",
        nct_number="NCT03456789"
    )
    
    # Use the create_project endpoint
    result = await create_project(project, background_tasks)
    
    # Generate some history for the demo project
    project_id = result["project_id"]
    
    # Generate a sequence
    await generate_sequence(project_id, background_tasks)
    
    # Add some additional history
    if project_id in history:
        # Add form generation entries
        for form_type in ["1571", "1572", "3674"]:
            history[project_id].append({
                "serial": f"{len(history[project_id]) + 1:04d}",
                "timestamp": (datetime.now()).isoformat(),
                "type": "form_generation"
            })
    
    # Save data in the background
    background_tasks.add_task(save_data)
    
    return {"message": "Demo project created", "project_id": project_id}