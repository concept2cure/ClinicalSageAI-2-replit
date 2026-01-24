"""
Semantic Trace Log Module for LumenTrialGuide.AI

This module records how AI made alignment decisions between protocols and CSRs.
It provides transparency and auditability in the semantic intelligence pipeline.

The log format captures:
1. Which protocol was compared to which CSR(s)
2. The reasoning behind field-level similarity calculations
3. Risk identification logic
4. Recommendation generation process
"""

import os
import json
import datetime
from typing import Dict, List, Any, Optional

def create_trace_entry(
    protocol_id: str,
    csr_id: str,
    alignment_data: Dict[str, Any],
    user_id: Optional[str] = None,
    session_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create a structured trace log entry
    
    Args:
        protocol_id: Identifier for the protocol
        csr_id: Identifier for the CSR
        alignment_data: Alignment results from semantic_aligner
        user_id: Optional user identifier
        session_id: Optional session identifier
    
    Returns:
        Structured trace log entry
    """
    return {
        "timestamp": datetime.datetime.now().isoformat(),
        "protocol_id": protocol_id,
        "csr_id": csr_id,
        "user_id": user_id,
        "session_id": session_id,
        "alignment_score": alignment_data.get("alignment_score"),
        "matched_fields": alignment_data.get("matched_fields", []),
        "risk_flags": alignment_data.get("risk_flags", []),
        "recommendations": alignment_data.get("recommended_adjustments", []),
        "reasoning_trace": alignment_data.get("reasoning_trace", [])
    }

def save_trace_log(trace_entry: Dict[str, Any], log_dir: str = "logs/semantic_traces") -> str:
    """
    Save trace log to JSON file
    
    Args:
        trace_entry: Trace log entry to save
        log_dir: Directory to save log files
    
    Returns:
        Path to saved log file
    """
    # Create log directory if it doesn't exist
    os.makedirs(log_dir, exist_ok=True)
    
    # Generate filename based on protocol ID and timestamp
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    protocol_id = trace_entry.get("protocol_id", "unknown")
    filename = f"{protocol_id}_{timestamp}.json"
    filepath = os.path.join(log_dir, filename)
    
    # Write trace to file
    with open(filepath, "w") as f:
        json.dump(trace_entry, f, indent=2)
    
    return filepath

def append_to_trace_history(trace_entry: Dict[str, Any], 
                           history_file: str = "logs/trace_history.json") -> None:
    """
    Append trace entry to history file
    
    Args:
        trace_entry: Trace log entry to append
        history_file: Path to history file
    """
    # Create directory if needed
    os.makedirs(os.path.dirname(history_file), exist_ok=True)
    
    # Load existing history
    if os.path.exists(history_file):
        try:
            with open(history_file, "r") as f:
                history = json.load(f)
        except json.JSONDecodeError:
            history = []
    else:
        history = []
    
    # Create condensed trace for history
    condensed_trace = {
        "timestamp": trace_entry.get("timestamp"),
        "protocol_id": trace_entry.get("protocol_id"),
        "csr_id": trace_entry.get("csr_id"),
        "user_id": trace_entry.get("user_id"),
        "session_id": trace_entry.get("session_id"),
        "alignment_score": trace_entry.get("alignment_score"),
        "risk_count": len(trace_entry.get("risk_flags", [])),
        "recommendation_count": len(trace_entry.get("recommendations", []))
    }
    
    # Append to history
    history.append(condensed_trace)
    
    # Save updated history
    with open(history_file, "w") as f:
        json.dump(history, f, indent=2)

def get_protocol_trace_history(protocol_id: str, 
                             history_file: str = "logs/trace_history.json") -> List[Dict[str, Any]]:
    """
    Get all trace entries for a specific protocol
    
    Args:
        protocol_id: Protocol identifier
        history_file: Path to history file
    
    Returns:
        List of trace entries for the protocol
    """
    if not os.path.exists(history_file):
        return []
    
    try:
        with open(history_file, "r") as f:
            history = json.load(f)
        
        return [entry for entry in history if entry.get("protocol_id") == protocol_id]
    
    except json.JSONDecodeError:
        return []

def get_recent_traces(limit: int = 10, 
                     history_file: str = "logs/trace_history.json") -> List[Dict[str, Any]]:
    """
    Get the most recent trace entries
    
    Args:
        limit: Maximum number of entries to return
        history_file: Path to history file
    
    Returns:
        List of recent trace entries
    """
    if not os.path.exists(history_file):
        return []
    
    try:
        with open(history_file, "r") as f:
            history = json.load(f)
        
        # Sort by timestamp (descending)
        sorted_history = sorted(history, 
                               key=lambda x: x.get("timestamp", ""), 
                               reverse=True)
        
        return sorted_history[:limit]
    
    except json.JSONDecodeError:
        return []

def load_full_trace(protocol_id: str, timestamp: str, 
                   log_dir: str = "logs/semantic_traces") -> Optional[Dict[str, Any]]:
    """
    Load full trace data from file
    
    Args:
        protocol_id: Protocol identifier
        timestamp: Timestamp from history entry
        log_dir: Directory containing log files
    
    Returns:
        Full trace entry if found, None otherwise
    """
    # Extract date part from timestamp for filename
    try:
        dt = datetime.datetime.fromisoformat(timestamp)
        date_part = dt.strftime("%Y%m%d_%H%M%S")
        filename = f"{protocol_id}_{date_part}.json"
        filepath = os.path.join(log_dir, filename)
        
        if os.path.exists(filepath):
            with open(filepath, "r") as f:
                return json.load(f)
    
    except (ValueError, OSError):
        pass
    
    # If exact match not found, try to find file by protocol_id prefix
    try:
        for filename in os.listdir(log_dir):
            if filename.startswith(f"{protocol_id}_"):
                filepath = os.path.join(log_dir, filename)
                with open(filepath, "r") as f:
                    return json.load(f)
    
    except (OSError, json.JSONDecodeError):
        pass
    
    return None

def analyze_traces(protocol_id: str, 
                  history_file: str = "logs/trace_history.json") -> Dict[str, Any]:
    """
    Analyze trace history for a protocol to show improvements over time
    
    Args:
        protocol_id: Protocol identifier
        history_file: Path to history file
    
    Returns:
        Analysis of protocol iterations over time
    """
    traces = get_protocol_trace_history(protocol_id, history_file)
    
    if not traces:
        return {"message": f"No trace history found for protocol {protocol_id}"}
    
    # Sort by timestamp (ascending)
    sorted_traces = sorted(traces, key=lambda x: x.get("timestamp", ""))
    
    # Extract key metrics over time
    timeline = []
    for trace in sorted_traces:
        timeline.append({
            "timestamp": trace.get("timestamp"),
            "alignment_score": trace.get("alignment_score"),
            "risk_count": trace.get("risk_count", 0),
            "recommendation_count": trace.get("recommendation_count", 0)
        })
    
    # Calculate improvement
    if len(timeline) > 1:
        first = timeline[0]
        last = timeline[-1]
        
        score_improvement = last.get("alignment_score", 0) - first.get("alignment_score", 0)
        risk_reduction = first.get("risk_count", 0) - last.get("risk_count", 0)
        
        improvement = {
            "score_change": round(score_improvement, 2),
            "risk_reduction": risk_reduction,
            "iterations": len(timeline)
        }
    else:
        improvement = {
            "score_change": 0,
            "risk_reduction": 0,
            "iterations": 1
        }
    
    return {
        "protocol_id": protocol_id,
        "timeline": timeline,
        "improvement": improvement,
        "latest_score": timeline[-1].get("alignment_score") if timeline else None
    }

# Example usage
if __name__ == "__main__":
    # Sample alignment data
    alignment_data = {
        "alignment_score": 0.84,
        "matched_fields": [
            {
                "field": "primary_endpoint",
                "protocol": "ALT",
                "csr": "ALT reduction",
                "similarity": 0.94
            },
            {
                "field": "duration_weeks",
                "protocol": 12,
                "csr": 24,
                "similarity": 0.45
            }
        ],
        "risk_flags": ["Duration mismatch"],
        "recommended_adjustments": ["Consider extending to 24 weeks based on similar CSR patterns."],
        "reasoning_trace": [
            {
                "field": "primary_endpoint",
                "reasoning": "Semantic comparison between normalized terms",
                "similarity": 0.94
            },
            {
                "field": "duration_weeks",
                "reasoning": "Numeric comparison: 12 vs 24",
                "similarity": 0.45
            }
        ]
    }
    
    # Create and save trace
    trace_entry = create_trace_entry(
        protocol_id="PROT-2023-001",
        csr_id="CSR-456",
        alignment_data=alignment_data,
        user_id="user123",
        session_id="session456"
    )
    
    filepath = save_trace_log(trace_entry)
    append_to_trace_history(trace_entry)
    
    print(f"Trace log saved to {filepath}")
    
    # Retrieve trace history
    history = get_protocol_trace_history("PROT-2023-001")
    print(f"Found {len(history)} trace entries for protocol PROT-2023-001")
    
    # Analyze traces
    analysis = analyze_traces("PROT-2023-001")
    print(json.dumps(analysis, indent=2))