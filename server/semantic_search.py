#!/usr/bin/env python3
# trialsage/semantic_search.py
# Bridge script to perform semantic search against the CSR knowledge base

import os
import sys
import json
import re
from typing import List, Dict, Any, Optional
import logging
import random  # For fallback simulated results

# Configure logging
logging.basicConfig(level=logging.INFO, 
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Add the parent directory to the path so we can import our modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from trialsage.services.deep_csr_analyzer import semantic_search, search_csr_sections
except ImportError:
    logger.error("Failed to import deep_csr_analyzer. Make sure it's in the correct path.")
    # Fallback function in case the import fails
    def semantic_search(query: str, top_k: int = 5, filter_by_csr: Optional[str] = None) -> List[Dict[str, Any]]:
        """Emergency fallback function for semantic search"""
        logger.warning("Using fallback semantic search - returning simulated results")
        
        # Simulated CSR IDs (would normally come from vector database)
        csr_ids = [
            "CSR-12345", "CSR-23456", "CSR-34567", "CSR-45678", "CSR-56789",
            "CSR-67890", "CSR-78901", "CSR-89012", "CSR-90123", "CSR-01234",
            "CSR_2022_NASH_01", "CSR_2021_NASH_02", "CSR_2020_OBESITY_03"
        ]
        
        # If filter is provided, use only matching IDs or return empty if none match
        if filter_by_csr:
            matching_ids = [csr_id for csr_id in csr_ids if filter_by_csr.lower() in csr_id.lower()]
            if not matching_ids:
                return []
            csr_ids = matching_ids
        
        # Select random subset (simulating relevance-based retrieval)
        result_count = min(top_k, len(csr_ids))
        selected_csrs = random.sample(csr_ids, result_count)
        
        # Generate simulated results
        results = []
        for i, csr_id in enumerate(selected_csrs):
            # Simulate decreasing relevance scores
            similarity = 0.95 - (i * 0.07)
            
            # Create a result object with expected fields
            results.append({
                "csr_id": csr_id,
                "title": f"Clinical Study Report for Trial {csr_id}",
                "similarity": similarity,
                "phase": random.choice(["Phase 1", "Phase 2", "Phase 3", "Phase 4"]),
                "indication": random.choice(["NASH", "Obesity", "Diabetes", "Hypertension", "Asthma"]),
                "excerpt": f"This is a simulated excerpt from {csr_id} that would normally contain text relevant to the query: '{query}'",
                "sample_size": random.randint(50, 1000),
                "fallback": True  # Flag indicating this is fallback data
            })
        
        return results

    def search_csr_sections(query: str, section_type: str, top_k: int = 5) -> List[Dict[str, Any]]:
        """Emergency fallback function for section search"""
        logger.warning(f"Using fallback section search for {section_type} - returning simulated results")
        
        # Create simulated section results
        section_texts = {
            "methods": [
                "Patients were randomized in a 1:1 ratio to receive either the study drug or placebo.",
                "The study utilized a double-blind, placebo-controlled design with stratification by baseline severity.",
                "Study drug was administered orally once daily for 12 weeks.",
                "Efficacy was assessed using validated questionnaires at weeks 0, 4, 8, and 12.",
                "Safety was monitored throughout the study via adverse event reporting and laboratory assessments."
            ],
            "results": [
                "The primary endpoint was met with statistical significance (p<0.001) in the treatment group vs. placebo.",
                "Mean reduction in disease score was 42% in the treatment group compared to 15% in the placebo group.",
                "Adverse events were reported in 24% of treatment participants vs. 22% in the placebo group.",
                "No serious adverse events were considered related to the study drug.",
                "Dropout rates were similar between groups (7% treatment, 8% placebo)."
            ],
            "discussion": [
                "Results demonstrated clinically meaningful improvements across all primary and secondary endpoints.",
                "The safety profile was consistent with previous phase 2 studies and raised no new concerns.",
                "A limitation of this study was the relatively homogeneous patient population.",
                "These results support further development of the compound for this indication.",
                "Future studies should consider longer treatment duration to assess durability of response."
            ]
        }
        
        # Default to methods if section type isn't recognized
        section_options = section_texts.get(section_type.lower(), section_texts["methods"])
        
        # Select random subset (simulating relevance-based retrieval)
        result_count = min(top_k, len(section_options))
        selected_sections = random.sample(section_options, result_count)
        
        # Generate simulated results
        results = []
        for i, section_text in enumerate(selected_sections):
            # Simulate decreasing relevance scores
            similarity = 0.92 - (i * 0.08)
            
            csr_id = f"CSR-{random.randint(10000, 99999)}"
            
            # Create a result object with expected fields
            results.append({
                "csr_id": csr_id,
                "section_type": section_type,
                "similarity": similarity,
                "text": section_text,
                "phase": random.choice(["Phase 1", "Phase 2", "Phase 3", "Phase 4"]),
                "indication": random.choice(["NASH", "Obesity", "Diabetes", "Hypertension", "Asthma"]),
                "fallback": True
            })
        
        return results

def search_similar_csrs(query: str, top_k: int = 5, filter_by_csr: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Public function to search for CSRs semantically similar to the query
    
    Args:
        query: The search query text
        top_k: Maximum number of results to return
        filter_by_csr: Optional CSR ID to filter results by
        
    Returns:
        List of matching CSR records with similarity scores
    """
    try:
        logger.info(f"Performing semantic search for: {query}")
        return semantic_search(query=query, top_k=top_k, filter_by_csr=filter_by_csr)
    except Exception as e:
        logger.error(f"Error in semantic search: {str(e)}")
        # Return empty list on error
        return []

def search_csr_by_section(query: str, section_type: str = "methods", top_k: int = 5) -> List[Dict[str, Any]]:
    """
    Public function to search for specific sections within CSRs
    
    Args:
        query: The search query text
        section_type: The type of section to search (methods, results, discussion)
        top_k: Maximum number of results to return
        
    Returns:
        List of matching CSR section texts with similarity scores
    """
    try:
        logger.info(f"Performing section search for '{section_type}' with query: {query}")
        return search_csr_sections(query=query, section_type=section_type, top_k=top_k)
    except Exception as e:
        logger.error(f"Error in section search: {str(e)}")
        # Return empty list on error
        return []

def main():
    """
    Main function to perform semantic search against the CSR knowledge base
    
    Takes a filepath as a command-line argument, reads the query parameters,
    performs the search, and prints the result as JSON to stdout.
    """
    if len(sys.argv) != 2:
        logger.error("Usage: python3 semantic_search.py <filepath>")
        print(json.dumps({"error": "Invalid arguments", "results": []}))
        sys.exit(1)
    
    filepath = sys.argv[1]
    
    try:
        # Read the query parameters from the file
        with open(filepath, 'r', encoding='utf-8') as f:
            params = json.load(f)
        
        query = params.get("query", "")
        top_k = params.get("top_k", 5)
        filter_by_csr = params.get("filter_by_csr")
        search_type = params.get("search_type", "csr")  # 'csr' or 'section'
        section_type = params.get("section_type", "methods")  # 'methods', 'results', 'discussion'
        
        if not query:
            logger.error("Query parameter is required")
            print(json.dumps({"error": "Query parameter is required", "results": []}))
            sys.exit(1)
        
        # Perform the appropriate type of search
        try:
            if search_type.lower() == 'section':
                results = search_csr_by_section(query, section_type, top_k)
                logger.info(f"Found {len(results)} matching sections")
            else:
                results = search_similar_csrs(query, top_k, filter_by_csr)
                logger.info(f"Found {len(results)} matching CSRs")
            
            # Print the result as JSON
            print(json.dumps({
                "query": query,
                "resultCount": len(results),
                "results": results
            }))
            
        except Exception as e:
            logger.error(f"Error performing search: {str(e)}")
            print(json.dumps({
                "error": f"Failed to perform search: {str(e)}",
                "query": query,
                "results": []
            }))
            sys.exit(1)
        
    except Exception as e:
        logger.error(f"Error reading file {filepath}: {str(e)}")
        print(json.dumps({"error": f"Failed to read file: {str(e)}", "results": []}))
        sys.exit(1)

if __name__ == "__main__":
    main()