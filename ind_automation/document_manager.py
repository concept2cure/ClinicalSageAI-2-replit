"""
Document Management System for IND Wizard

This module provides document management functionality for IND applications,
including document organization, version tracking, and AI-powered content analysis.
"""

import os
import json
import uuid
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional, BinaryIO, Tuple
import openai
from io import BytesIO

# Initialize OpenAI API
openai.api_key = os.environ.get("OPENAI_API_KEY")

# Define document categories and types
DOCUMENT_CATEGORIES = {
    "administrative": ["cover_letter", "form_1571", "form_1572", "form_3674", "form_3454"],
    "clinical": ["protocol", "investigators_brochure", "patient_materials", "case_report_forms"],
    "preclinical": ["pharmacology", "toxicology", "pharmacokinetics", "genotoxicity"],
    "cmc": ["drug_substance", "drug_product", "manufacturing", "controls", "stability"],
    "regulatory": ["meeting_requests", "meeting_minutes", "correspondence", "amendments"]
}

# Base directory for document storage
DOC_STORAGE_BASE = Path("ind_automation/documents")
DOC_STORAGE_BASE.mkdir(parents=True, exist_ok=True)

# Document metadata JSON file
METADATA_FILE = DOC_STORAGE_BASE / "document_metadata.json"

# Load document metadata
def load_document_metadata() -> Dict[str, Any]:
    """
    Load document metadata from JSON file.
    
    Returns:
        Dictionary containing document metadata
    """
    if METADATA_FILE.exists():
        try:
            with open(METADATA_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading document metadata: {e}")
    
    # Initialize with empty structure if file doesn't exist
    return {
        "documents": {},
        "project_documents": {},
        "version_history": {}
    }

# Save document metadata
def save_document_metadata(metadata: Dict[str, Any]) -> bool:
    """
    Save document metadata to JSON file.
    
    Args:
        metadata: Dictionary containing document metadata
        
    Returns:
        True if successful, False otherwise
    """
    try:
        with open(METADATA_FILE, "w") as f:
            json.dump(metadata, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving document metadata: {e}")
        return False

# Get document storage path for a project
def get_project_doc_path(project_id: str) -> Path:
    """
    Get the document storage path for a project.
    
    Args:
        project_id: Project ID
        
    Returns:
        Path object for the project's document directory
    """
    project_path = DOC_STORAGE_BASE / project_id
    project_path.mkdir(parents=True, exist_ok=True)
    return project_path

def store_document(
    project_id: str,
    category: str,
    doc_type: str,
    filename: str,
    file_content: BinaryIO,
    description: str = "",
    author: str = "",
    version: str = "1.0"
) -> Dict[str, Any]:
    """
    Store a document for a project.
    
    Args:
        project_id: Project ID
        category: Document category (e.g., 'administrative', 'clinical')
        doc_type: Document type (e.g., 'protocol', 'form_1571')
        filename: Original filename
        file_content: File content as BinaryIO
        description: Optional document description
        author: Optional document author
        version: Optional document version
        
    Returns:
        Dictionary containing document metadata
    """
    # Generate unique document ID
    doc_id = f"doc-{uuid.uuid4()}"
    
    # Get file extension
    _, ext = os.path.splitext(filename)
    
    # Create storage path
    project_path = get_project_doc_path(project_id)
    category_path = project_path / category
    category_path.mkdir(exist_ok=True)
    
    # Sanitize filename
    safe_filename = f"{doc_type}_{version.replace('.', '_')}{ext}"
    file_path = category_path / safe_filename
    
    # Save file
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file_content, f)
    
    # Create document metadata
    doc_metadata = {
        "document_id": doc_id,
        "project_id": project_id,
        "category": category,
        "type": doc_type,
        "filename": safe_filename,
        "original_filename": filename,
        "path": str(file_path.relative_to(DOC_STORAGE_BASE)),
        "description": description,
        "author": author,
        "version": version,
        "create_date": datetime.now().isoformat(),
        "update_date": datetime.now().isoformat(),
        "file_size": file_path.stat().st_size,
        "extension": ext.lstrip('.').lower()
    }
    
    # Add metadata to storage
    metadata = load_document_metadata()
    metadata["documents"][doc_id] = doc_metadata
    
    # Add to project documents
    if project_id not in metadata["project_documents"]:
        metadata["project_documents"][project_id] = {}
    
    if category not in metadata["project_documents"][project_id]:
        metadata["project_documents"][project_id][category] = {}
    
    if doc_type not in metadata["project_documents"][project_id][category]:
        metadata["project_documents"][project_id][category][doc_type] = []
    
    metadata["project_documents"][project_id][category][doc_type].append(doc_id)
    
    # Add to version history
    version_key = f"{project_id}_{category}_{doc_type}"
    if version_key not in metadata["version_history"]:
        metadata["version_history"][version_key] = []
    
    metadata["version_history"][version_key].append({
        "document_id": doc_id,
        "version": version,
        "date": datetime.now().isoformat()
    })
    
    # Save metadata
    save_document_metadata(metadata)
    
    return doc_metadata

def get_document(doc_id: str) -> Tuple[Dict[str, Any], Optional[bytes]]:
    """
    Get a document by ID.
    
    Args:
        doc_id: Document ID
        
    Returns:
        Tuple of (document metadata, file content)
    """
    metadata = load_document_metadata()
    
    if doc_id not in metadata["documents"]:
        return {}, None
    
    doc_metadata = metadata["documents"][doc_id]
    file_path = DOC_STORAGE_BASE / doc_metadata["path"]
    
    if not file_path.exists():
        return doc_metadata, None
    
    try:
        with open(file_path, "rb") as f:
            file_content = f.read()
        return doc_metadata, file_content
    except Exception as e:
        print(f"Error reading document: {e}")
        return doc_metadata, None

def get_document_by_type(
    project_id: str,
    category: str,
    doc_type: str,
    version: Optional[str] = None
) -> Tuple[Dict[str, Any], Optional[bytes]]:
    """
    Get the latest version of a document by type.
    
    Args:
        project_id: Project ID
        category: Document category
        doc_type: Document type
        version: Optional specific version
        
    Returns:
        Tuple of (document metadata, file content)
    """
    metadata = load_document_metadata()
    
    if (project_id not in metadata["project_documents"] or
        category not in metadata["project_documents"][project_id] or
        doc_type not in metadata["project_documents"][project_id][category]):
        return {}, None
    
    version_key = f"{project_id}_{category}_{doc_type}"
    if version_key not in metadata["version_history"]:
        return {}, None
    
    versions = metadata["version_history"][version_key]
    if not versions:
        return {}, None
    
    if version:
        # Find specific version
        for ver in versions:
            if ver["version"] == version:
                return get_document(ver["document_id"])
        return {}, None
    else:
        # Get latest version (assuming versions are in chronological order)
        latest_version = versions[-1]
        return get_document(latest_version["document_id"])

def get_project_documents(project_id: str) -> Dict[str, List[Dict[str, Any]]]:
    """
    Get all documents for a project organized by category and type.
    
    Args:
        project_id: Project ID
        
    Returns:
        Dictionary of documents organized by category and type
    """
    metadata = load_document_metadata()
    result = {}
    
    if project_id not in metadata["project_documents"]:
        return result
    
    project_docs = metadata["project_documents"][project_id]
    
    for category, types in project_docs.items():
        if category not in result:
            result[category] = {}
        
        for doc_type, doc_ids in types.items():
            if doc_type not in result[category]:
                result[category][doc_type] = []
            
            for doc_id in doc_ids:
                if doc_id in metadata["documents"]:
                    result[category][doc_type].append(metadata["documents"][doc_id])
    
    return result

def delete_document(doc_id: str) -> bool:
    """
    Delete a document by ID.
    
    Args:
        doc_id: Document ID
        
    Returns:
        True if successful, False otherwise
    """
    metadata = load_document_metadata()
    
    if doc_id not in metadata["documents"]:
        return False
    
    doc_metadata = metadata["documents"][doc_id]
    file_path = DOC_STORAGE_BASE / doc_metadata["path"]
    
    try:
        # Delete file if it exists
        if file_path.exists():
            file_path.unlink()
        
        # Remove from metadata
        project_id = doc_metadata["project_id"]
        category = doc_metadata["category"]
        doc_type = doc_metadata["type"]
        
        # Remove from documents
        del metadata["documents"][doc_id]
        
        # Remove from project documents
        if (project_id in metadata["project_documents"] and
            category in metadata["project_documents"][project_id] and
            doc_type in metadata["project_documents"][project_id][category]):
            if doc_id in metadata["project_documents"][project_id][category][doc_type]:
                metadata["project_documents"][project_id][category][doc_type].remove(doc_id)
        
        # Remove from version history if it's the only version
        version_key = f"{project_id}_{category}_{doc_type}"
        if version_key in metadata["version_history"]:
            versions = metadata["version_history"][version_key]
            for i, ver in enumerate(versions):
                if ver["document_id"] == doc_id:
                    del versions[i]
                    break
            
            # If no versions left, remove the key
            if not versions:
                del metadata["version_history"][version_key]
        
        # Save metadata
        save_document_metadata(metadata)
        
        return True
    except Exception as e:
        print(f"Error deleting document: {e}")
        return False

async def analyze_document_content(doc_id: str) -> Dict[str, Any]:
    """
    Analyze document content using AI and extract key information.
    
    Args:
        doc_id: Document ID
        
    Returns:
        Dictionary containing analysis results
    """
    # Default response structure
    default_response = {
        "document_id": doc_id,
        "analysis_date": datetime.now().isoformat(),
        "content_summary": "Document content analysis not available.",
        "key_points": [],
        "regulatory_compliance": {
            "score": 0,
            "issues": [],
            "recommendations": []
        },
        "status": "error"
    }
    
    # Get document metadata and content
    doc_metadata, file_content = get_document(doc_id)
    
    if not doc_metadata or not file_content:
        default_response["content_summary"] = "Document not found or could not be read."
        return default_response
    
    # Currently only supports text-based analysis
    text_extensions = ["txt", "csv", "md", "json", "xml", "html"]
    
    if doc_metadata["extension"] not in text_extensions:
        default_response["content_summary"] = f"Content analysis not supported for {doc_metadata['extension']} files."
        return default_response
    
    try:
        # Decode text content
        text_content = file_content.decode("utf-8")
        
        # Basic content analysis if OpenAI API is not available
        if not openai.api_key:
            summary = f"Document contains {len(text_content)} characters."
            paragraphs = text_content.split("\n\n")
            key_points = [p[:100] + "..." for p in paragraphs[:3] if len(p) > 20]
            
            return {
                "document_id": doc_id,
                "analysis_date": datetime.now().isoformat(),
                "content_summary": summary,
                "key_points": key_points,
                "regulatory_compliance": {
                    "score": 50,
                    "issues": ["OpenAI API key not configured for detailed analysis."],
                    "recommendations": ["Configure OpenAI API key for enhanced content analysis."]
                },
                "status": "partial"
            }
        
        # Prepare document context
        doc_context = f"""
Document Type: {doc_metadata['type']}
Category: {doc_metadata['category']}
Version: {doc_metadata['version']}
Date: {doc_metadata['create_date']}
Content Sample: {text_content[:3000]}...
"""

        # Generate content analysis using OpenAI
        prompt = f"""
As an FDA regulatory expert, analyze this {doc_metadata['type']} document for an IND application:

{doc_context}

Provide a thorough regulatory analysis with:
1. A concise summary of the document's content and purpose
2. Key points and important information extracted from the document
3. Regulatory compliance assessment, identifying any issues or gaps
4. Specific recommendations to improve regulatory compliance

Format your response as JSON with keys: "content_summary", "key_points" (array), 
"regulatory_compliance" (object with "score", "issues", "recommendations" fields).
"""

        response = await openai.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are an expert FDA regulatory affairs consultant specializing in document analysis for IND applications."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=1000,
            response_format={"type": "json_object"}
        )
        
        # Extract and parse response
        ai_response = json.loads(response.choices[0].message.content)
        
        # Construct final response
        return {
            "document_id": doc_id,
            "analysis_date": datetime.now().isoformat(),
            "content_summary": ai_response.get("content_summary", "Analysis complete."),
            "key_points": ai_response.get("key_points", []),
            "regulatory_compliance": ai_response.get("regulatory_compliance", {
                "score": 50,
                "issues": [],
                "recommendations": []
            }),
            "status": "complete"
        }
        
    except Exception as e:
        default_response["content_summary"] = f"Error analyzing document: {str(e)}"
        return default_response

def create_document_index(project_id: str) -> Dict[str, Any]:
    """
    Create an index of all documents for a project.
    
    Args:
        project_id: Project ID
        
    Returns:
        Dictionary containing document index and statistics
    """
    project_docs = get_project_documents(project_id)
    
    # Initialize statistics
    total_docs = 0
    docs_by_category = {}
    docs_by_type = {}
    latest_updates = []
    
    # Process documents
    for category, types in project_docs.items():
        category_count = 0
        
        for doc_type, documents in types.items():
            type_count = len(documents)
            category_count += type_count
            total_docs += type_count
            
            # Add to type statistics
            if doc_type not in docs_by_type:
                docs_by_type[doc_type] = 0
            docs_by_type[doc_type] += type_count
            
            # Add to latest updates (most recent first)
            for doc in documents:
                latest_updates.append({
                    "document_id": doc["document_id"],
                    "category": category,
                    "type": doc_type,
                    "filename": doc["original_filename"],
                    "update_date": doc["update_date"],
                    "version": doc["version"]
                })
        
        # Add to category statistics
        docs_by_category[category] = category_count
    
    # Sort latest updates by date (most recent first)
    latest_updates.sort(key=lambda x: x["update_date"], reverse=True)
    
    return {
        "project_id": project_id,
        "total_documents": total_docs,
        "categories": docs_by_category,
        "document_types": docs_by_type,
        "latest_updates": latest_updates[:10],  # Only include 10 most recent updates
        "document_structure": project_docs,
        "generated": datetime.now().isoformat()
    }

async def generate_ind_table_of_contents(project_id: str) -> Dict[str, Any]:
    """
    Generate an IND Table of Contents based on project documents.
    
    Args:
        project_id: Project ID
        
    Returns:
        Dictionary containing Table of Contents
    """
    project_docs = get_project_documents(project_id)
    
    # Standard IND structure (empty)
    toc_structure = {
        "1. Form FDA 1571": {
            "status": "missing",
            "document_id": None
        },
        "2. Table of Contents": {
            "status": "generated",
            "document_id": None
        },
        "3. Introductory Statement and General Investigational Plan": {
            "status": "missing",
            "document_id": None
        },
        "4. Investigator's Brochure": {
            "status": "missing",
            "document_id": None
        },
        "5. Clinical Protocol(s)": {
            "status": "missing",
            "document_id": None,
            "subsections": {}
        },
        "6. Chemistry, Manufacturing, and Control Information": {
            "status": "missing",
            "document_id": None,
            "subsections": {
                "6.1. Drug Substance": {"status": "missing", "document_id": None},
                "6.2. Drug Product": {"status": "missing", "document_id": None},
                "6.3. Manufacturing Process": {"status": "missing", "document_id": None},
                "6.4. Controls": {"status": "missing", "document_id": None},
                "6.5. Stability": {"status": "missing", "document_id": None}
            }
        },
        "7. Pharmacology and Toxicology Information": {
            "status": "missing",
            "document_id": None,
            "subsections": {
                "7.1. Pharmacology": {"status": "missing", "document_id": None},
                "7.2. Toxicology": {"status": "missing", "document_id": None},
                "7.3. Pharmacokinetics": {"status": "missing", "document_id": None}
            }
        },
        "8. Previous Human Experience": {
            "status": "missing",
            "document_id": None
        },
        "9. Additional Information": {
            "status": "missing",
            "document_id": None
        },
        "10. Form FDA 1572": {
            "status": "missing",
            "document_id": None
        },
        "11. Form FDA 3674": {
            "status": "missing",
            "document_id": None
        },
        "12. Form FDA 3454": {
            "status": "missing",
            "document_id": None
        },
        "13. Environmental Assessment": {
            "status": "missing",
            "document_id": None
        }
    }
    
    # Map document types to TOC sections
    doc_type_to_toc = {
        "form_1571": "1. Form FDA 1571",
        "form_1572": "10. Form FDA 1572",
        "form_3674": "11. Form FDA 3674",
        "form_3454": "12. Form FDA 3454",
        "protocol": "5. Clinical Protocol(s)",
        "investigators_brochure": "4. Investigator's Brochure",
        "drug_substance": "6.1. Drug Substance",
        "drug_product": "6.2. Drug Product",
        "manufacturing": "6.3. Manufacturing Process",
        "controls": "6.4. Controls",
        "stability": "6.5. Stability",
        "pharmacology": "7.1. Pharmacology",
        "toxicology": "7.2. Toxicology",
        "pharmacokinetics": "7.3. Pharmacokinetics",
        "human_experience": "8. Previous Human Experience"
    }
    
    # Update TOC structure with available documents
    for category, types in project_docs.items():
        for doc_type, documents in types.items():
            if doc_type in doc_type_to_toc and documents:
                # Use the latest version of each document type
                latest_doc = documents[-1]
                toc_section = doc_type_to_toc[doc_type]
                
                # Handle nested sections
                if "." in toc_section:
                    parent_section, sub_section = toc_section.split(".", 1)
                    parent_key = [k for k in toc_structure.keys() if k.startswith(parent_section)][0]
                    
                    if "subsections" in toc_structure[parent_key]:
                        for sub_key in toc_structure[parent_key]["subsections"]:
                            if sub_key.startswith(toc_section):
                                toc_structure[parent_key]["subsections"][sub_key] = {
                                    "status": "available",
                                    "document_id": latest_doc["document_id"],
                                    "filename": latest_doc["original_filename"],
                                    "version": latest_doc["version"],
                                    "update_date": latest_doc["update_date"]
                                }
                                
                                # Update parent section status
                                toc_structure[parent_key]["status"] = "partial"
                                break
                else:
                    # Update top-level section
                    for key in toc_structure:
                        if key.startswith(toc_section):
                            toc_structure[key] = {
                                "status": "available",
                                "document_id": latest_doc["document_id"],
                                "filename": latest_doc["original_filename"],
                                "version": latest_doc["version"],
                                "update_date": latest_doc["update_date"]
                            }
                            break
    
    # Scan nested sections to update parent status
    for key, section in toc_structure.items():
        if "subsections" in section:
            available_subsections = 0
            total_subsections = len(section["subsections"])
            
            for sub_key, sub_section in section["subsections"].items():
                if sub_section["status"] in ["available", "partial"]:
                    available_subsections += 1
            
            if available_subsections == total_subsections:
                section["status"] = "available"
            elif available_subsections > 0:
                section["status"] = "partial"
    
    # Calculate completeness
    total_sections = 0
    available_sections = 0
    
    for key, section in toc_structure.items():
        if "subsections" in section:
            for sub_key, sub_section in section["subsections"].items():
                total_sections += 1
                if sub_section["status"] == "available":
                    available_sections += 1
        else:
            total_sections += 1
            if section["status"] == "available":
                available_sections += 1
    
    completeness_percentage = int((available_sections / total_sections) * 100) if total_sections > 0 else 0
    
    # Generate recommendations based on missing sections
    recommendations = []
    critical_missing = []
    
    for key, section in toc_structure.items():
        if section["status"] == "missing":
            if key in ["1. Form FDA 1571", "4. Investigator's Brochure", "5. Clinical Protocol(s)"]:
                critical_missing.append(key)
            else:
                recommendations.append(f"Add {key}")
    
    # Add AI recommendations if OpenAI API is available
    if openai.api_key:
        try:
            # Convert TOC to string representation for the prompt
            toc_representation = "\n".join([
                f"{key}: {section['status'].upper()}" for key, section in toc_structure.items()
            ])
            
            prompt = f"""
As an FDA regulatory expert, review this IND Table of Contents status:

{toc_representation}

The IND application is {completeness_percentage}% complete.
Critical missing sections: {', '.join(critical_missing) if critical_missing else 'None'}

Provide 3-5 strategic recommendations to improve this IND application, focusing on:
1. Critical missing sections that need immediate attention
2. Quality improvements for existing sections
3. Strategic filing considerations based on the current state

Format your response as a JSON array of recommendation strings.
"""

            response = await openai.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are an expert FDA regulatory affairs consultant specializing in IND submissions."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                max_tokens=600,
                response_format={"type": "json_object"}
            )
            
            # Extract and parse AI recommendations
            ai_response = json.loads(response.choices[0].message.content)
            if isinstance(ai_response, list):
                ai_recommendations = ai_response
            else:
                ai_recommendations = ai_response.get("recommendations", [])
            
            # Add AI recommendations
            recommendations = ai_recommendations + recommendations
            
        except Exception as e:
            recommendations.append(f"Error generating AI recommendations: {str(e)}")
    
    return {
        "project_id": project_id,
        "toc_structure": toc_structure,
        "completeness": {
            "percentage": completeness_percentage,
            "available_sections": available_sections,
            "total_sections": total_sections,
            "critical_missing": critical_missing
        },
        "recommendations": recommendations,
        "generated": datetime.now().isoformat()
    }

# Initialize document storage
if not os.path.exists(METADATA_FILE):
    initial_metadata = {
        "documents": {},
        "project_documents": {},
        "version_history": {}
    }
    with open(METADATA_FILE, "w") as f:
        json.dump(initial_metadata, f, indent=2)