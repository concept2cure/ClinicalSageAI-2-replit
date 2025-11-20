#!/usr/bin/env python3
"""
Protocol Analysis Script
This script analyzes protocol data against CSR benchmarks and generates risk assessments
"""

import sys
import os
import json
import argparse
import pickle
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Tuple
import sqlite3
import re
from datetime import datetime

# Constants
CSR_DATABASE_PATH = os.path.join(os.getcwd(), "data", "csr_database.sqlite")
ML_MODEL_PATH = os.path.join(os.getcwd(), "models", "trial_success_rf.pkl")

def connect_to_database() -> sqlite3.Connection:
    """Connect to the CSR database"""
    if not os.path.exists(CSR_DATABASE_PATH):
        raise FileNotFoundError(f"CSR database not found at {CSR_DATABASE_PATH}")
    
    return sqlite3.connect(CSR_DATABASE_PATH)

def load_ml_model():
    """Load the machine learning model for success prediction"""
    if not os.path.exists(ML_MODEL_PATH):
        raise FileNotFoundError(f"ML model not found at {ML_MODEL_PATH}")
    
    with open(ML_MODEL_PATH, 'rb') as f:
        model = pickle.load(f)
    
    return model

def get_csr_benchmarks(conn: sqlite3.Connection, indication: str, phase: str) -> Dict[str, Any]:
    """Get benchmark data from CSR database based on indication and phase"""
    # Normalize indication and phase for better matching
    indication_pattern = f"%{indication}%"
    phase_pattern = f"%{phase}%"
    
    # Query for similar trials
    cursor = conn.cursor()
    cursor.execute("""
        SELECT 
            AVG(sample_size) as avg_sample_size,
            MIN(sample_size) as min_sample_size,
            MAX(sample_size) as max_sample_size,
            AVG(duration_weeks) as avg_duration,
            MIN(duration_weeks) as min_duration,
            MAX(duration_weeks) as max_duration,
            AVG(dropout_rate) as avg_dropout,
            COUNT(*) as trial_count
        FROM reports
        WHERE 
            indication LIKE ? AND
            phase LIKE ? AND
            sample_size IS NOT NULL
    """, (indication_pattern, phase_pattern))
    
    benchmark_stats = cursor.fetchone()
    
    if not benchmark_stats or benchmark_stats[7] == 0:
        # If no direct match, try broader search on indication only
        cursor.execute("""
            SELECT 
                AVG(sample_size) as avg_sample_size,
                MIN(sample_size) as min_sample_size,
                MAX(sample_size) as max_sample_size,
                AVG(duration_weeks) as avg_duration,
                MIN(duration_weeks) as min_duration,
                MAX(duration_weeks) as max_duration,
                AVG(dropout_rate) as avg_dropout,
                COUNT(*) as trial_count
            FROM reports
            WHERE 
                indication LIKE ? AND
                sample_size IS NOT NULL
        """, (indication_pattern,))
        
        benchmark_stats = cursor.fetchone()
    
    # Get common endpoints for this indication and phase
    cursor.execute("""
        SELECT primary_endpoint, COUNT(*) as count
        FROM reports
        WHERE 
            indication LIKE ? AND
            phase LIKE ? AND
            primary_endpoint IS NOT NULL
        GROUP BY primary_endpoint
        ORDER BY count DESC
        LIMIT 5
    """, (indication_pattern, phase_pattern))
    
    common_endpoints = [{"endpoint": row[0], "count": row[1]} for row in cursor.fetchall()]
    
    # Get success rates
    cursor.execute("""
        SELECT 
            outcome,
            COUNT(*) as count
        FROM reports
        WHERE 
            indication LIKE ? AND
            phase LIKE ?
        GROUP BY outcome
    """, (indication_pattern, phase_pattern))
    
    outcome_counts = {row[0]: row[1] for row in cursor.fetchall()}
    
    success_count = outcome_counts.get('Success', 0) + outcome_counts.get('success', 0)
    total_count = sum(outcome_counts.values()) if outcome_counts else 0
    success_rate = success_count / total_count if total_count > 0 else None
    
    return {
        "avg_sample_size": benchmark_stats[0],
        "min_sample_size": benchmark_stats[1],
        "max_sample_size": benchmark_stats[2],
        "avg_duration": benchmark_stats[3],
        "min_duration": benchmark_stats[4],
        "max_duration": benchmark_stats[5],
        "avg_dropout": benchmark_stats[6],
        "trial_count": benchmark_stats[7],
        "common_endpoints": common_endpoints,
        "success_rate": success_rate,
        "total_trials": total_count
    }

def find_similar_csrs(conn: sqlite3.Connection, protocol_data: Dict[str, Any], limit: int = 10) -> List[Dict[str, Any]]:
    """Find similar CSRs based on indication, phase, and other criteria"""
    # Normalize indication and phase for better matching
    indication_pattern = f"%{protocol_data['indication']}%" if protocol_data['indication'] else "%"
    phase_pattern = f"%{protocol_data['phase']}%" if protocol_data['phase'] else "%"
    
    # Define sample size range (±30%)
    sample_size = protocol_data.get('sample_size', 0)
    min_sample_size = int(sample_size * 0.7) if sample_size > 0 else 0
    max_sample_size = int(sample_size * 1.3) if sample_size > 0 else 9999
    
    # Define duration range (±50%)
    duration = protocol_data.get('duration_weeks', 0)
    min_duration = int(duration * 0.5) if duration > 0 else 0
    max_duration = int(duration * 1.5) if duration > 0 else 9999
    
    # Query for similar trials
    cursor = conn.cursor()
    cursor.execute("""
        SELECT 
            id, title, sponsor, indication, phase, outcome, sample_size, 
            duration_weeks, dropout_rate, primary_endpoint
        FROM reports
        WHERE 
            indication LIKE ? AND
            phase LIKE ? AND
            (sample_size BETWEEN ? AND ? OR sample_size IS NULL) AND
            (duration_weeks BETWEEN ? AND ? OR duration_weeks IS NULL)
        ORDER BY 
            CASE 
                WHEN indication = ? THEN 0 
                ELSE 1 
            END,
            CASE 
                WHEN phase = ? THEN 0 
                ELSE 1 
            END
        LIMIT ?
    """, (
        indication_pattern, phase_pattern, 
        min_sample_size, max_sample_size, 
        min_duration, max_duration,
        protocol_data['indication'], protocol_data['phase'],
        limit
    ))
    
    similar_trials = []
    for row in cursor.fetchall():
        # Calculate similarity score (0-100)
        similarity_score = 0
        if row[3] and protocol_data['indication'] and protocol_data['indication'].lower() in row[3].lower():
            similarity_score += 40  # Indication match
        
        if row[4] and protocol_data['phase'] and protocol_data['phase'].lower() in row[4].lower():
            similarity_score += 30  # Phase match
        
        # Sample size proximity (up to 15 points)
        if row[6] and sample_size > 0:
            size_diff_pct = abs(row[6] - sample_size) / sample_size
            if size_diff_pct <= 0.1:  # Within 10%
                similarity_score += 15
            elif size_diff_pct <= 0.2:  # Within 20%
                similarity_score += 10
            elif size_diff_pct <= 0.3:  # Within 30%
                similarity_score += 5
        
        # Duration proximity (up to 15 points)
        if row[7] and duration > 0:
            duration_diff_pct = abs(row[7] - duration) / duration
            if duration_diff_pct <= 0.2:  # Within 20%
                similarity_score += 15
            elif duration_diff_pct <= 0.4:  # Within 40%
                similarity_score += 10
            elif duration_diff_pct <= 0.6:  # Within 60%
                similarity_score += 5
        
        similar_trials.append({
            "match_id": row[0],
            "title": row[1],
            "sponsor": row[2],
            "indication": row[3],
            "phase": row[4],
            "outcome": row[5] or "Unknown",
            "similarity_score": similarity_score / 100  # Convert to 0-1 scale
        })
    
    # Sort by similarity score
    similar_trials.sort(key=lambda x: x["similarity_score"], reverse=True)
    
    return similar_trials

def predict_success(protocol_data: Dict[str, Any], model) -> Dict[str, float]:
    """Predict success probability using ML model"""
    # Prepare data for prediction
    try:
        input_data = pd.DataFrame([{
            "sample_size": protocol_data["sample_size"],
            "duration_weeks": protocol_data["duration_weeks"],
            "dropout_rate": protocol_data["dropout_rate"]
        }])
        
        # Predict probability of success
        success_prob = model.predict_proba(input_data)[0][1]
        
        # Get feature importance
        importance = dict(zip(["sample_size", "duration_weeks", "dropout_rate"], model.feature_importances_))
        
        return {
            "success_probability": float(success_prob),
            "confidence": 0.8,  # Estimated confidence
            "feature_importance": importance
        }
    except Exception as e:
        print(f"Error predicting success: {e}", file=sys.stderr)
        # Return fallback predictions
        return {
            "success_probability": 0.5,  # Neutral prediction
            "confidence": 0.5,
            "feature_importance": {
                "sample_size": 0.33,
                "duration_weeks": 0.33,
                "dropout_rate": 0.34
            }
        }

def analyze_risk_flags(protocol_data: Dict[str, Any], benchmarks: Dict[str, Any]) -> Dict[str, bool]:
    """Analyze protocol for risk flags"""
    risk_flags = {
        "underpowered": False,
        "endpoint_risk": False,
        "duration_mismatch": False,
        "high_dropout": False,
        "design_issues": False,
        "innovative_approach": False
    }
    
    # Check for underpowered study
    if benchmarks["avg_sample_size"] and protocol_data["sample_size"] < benchmarks["avg_sample_size"] * 0.8:
        risk_flags["underpowered"] = True
    
    # Check for endpoint risk
    if benchmarks["common_endpoints"]:
        has_common_endpoint = False
        for endpoint_info in benchmarks["common_endpoints"]:
            common_endpoint = endpoint_info["endpoint"]
            for protocol_endpoint in protocol_data["primary_endpoints"]:
                if common_endpoint and protocol_endpoint and (
                    common_endpoint.lower() in protocol_endpoint.lower() or
                    protocol_endpoint.lower() in common_endpoint.lower()
                ):
                    has_common_endpoint = True
                    break
        
        if not has_common_endpoint:
            risk_flags["endpoint_risk"] = True
    
    # Check for duration mismatch
    if benchmarks["avg_duration"] and protocol_data["duration_weeks"]:
        if protocol_data["duration_weeks"] < benchmarks["avg_duration"] * 0.5:
            risk_flags["duration_mismatch"] = True
        elif protocol_data["duration_weeks"] > benchmarks["avg_duration"] * 1.5:
            risk_flags["duration_mismatch"] = True
    
    # Check for high dropout assumption
    if benchmarks["avg_dropout"] and protocol_data["dropout_rate"]:
        if protocol_data["dropout_rate"] < benchmarks["avg_dropout"] * 0.7:
            risk_flags["high_dropout"] = True
    
    # Check for design issues
    if not protocol_data["arms"] or len(protocol_data["arms"]) < 2:
        risk_flags["design_issues"] = True
    
    # Check for innovative approach
    if risk_flags["endpoint_risk"] and not risk_flags["design_issues"]:
        risk_flags["innovative_approach"] = True
    
    return risk_flags

def generate_strategic_insights(
    protocol_data: Dict[str, Any], 
    benchmarks: Dict[str, Any], 
    risk_flags: Dict[str, bool],
    prediction: Dict[str, float],
    similar_trials: List[Dict[str, Any]]
) -> List[str]:
    """Generate strategic insights based on analysis"""
    insights = []
    
    # Sample size insights
    if protocol_data["sample_size"] > 0 and benchmarks["avg_sample_size"]:
        if risk_flags["underpowered"]:
            success_rate = int(benchmarks["success_rate"] * 100) if benchmarks["success_rate"] else "unknown"
            insights.append(
                f"Your trial may be underpowered. CSR data shows trials with <{int(benchmarks['avg_sample_size'])} patients "
                f"for this indication and phase have a {success_rate}% success rate."
            )
        elif protocol_data["sample_size"] > benchmarks["avg_sample_size"] * 1.2:
            insights.append(
                f"Your sample size ({protocol_data['sample_size']}) is larger than the average ({int(benchmarks['avg_sample_size'])}) "
                f"for similar trials. Consider if this additional statistical power is necessary."
            )
    
    # Duration insights
    if protocol_data["duration_weeks"] > 0 and benchmarks["avg_duration"]:
        if protocol_data["duration_weeks"] < benchmarks["avg_duration"] * 0.7:
            insights.append(
                f"Your trial duration ({protocol_data['duration_weeks']} weeks) is shorter than typical trials "
                f"({int(benchmarks['avg_duration'])} weeks) for this indication and phase. Consider if this provides "
                f"sufficient time to observe meaningful clinical outcomes."
            )
        elif protocol_data["duration_weeks"] > benchmarks["avg_duration"] * 1.3:
            insights.append(
                f"Duration longer than average ({int(benchmarks['avg_duration'])} weeks). Consider patient retention "
                f"mitigation strategies as longer trials typically see increased dropout rates."
            )
    
    # Dropout insights
    if protocol_data["dropout_rate"] is not None and benchmarks["avg_dropout"]:
        benchmark_dropout_pct = int(benchmarks["avg_dropout"] * 100)
        if protocol_data["dropout_rate"] < benchmarks["avg_dropout"] * 0.8:
            insights.append(
                f"Your estimated dropout rate ({int(protocol_data['dropout_rate'] * 100)}%) appears optimistic compared to "
                f"the average ({benchmark_dropout_pct}%) for similar trials. Consider planning for higher attrition."
            )
    
    # Endpoint insights
    if benchmarks["common_endpoints"] and protocol_data["primary_endpoints"]:
        has_common_endpoint = False
        for endpoint_info in benchmarks["common_endpoints"]:
            common_endpoint = endpoint_info["endpoint"]
            for protocol_endpoint in protocol_data["primary_endpoints"]:
                if common_endpoint and protocol_endpoint and (
                    common_endpoint.lower() in protocol_endpoint.lower() or
                    protocol_endpoint.lower() in common_endpoint.lower()
                ):
                    has_common_endpoint = True
                    insights.append(
                        f"Your use of '{protocol_endpoint}' endpoint aligns with regulatory precedent "
                        f"for this indication and phase."
                    )
                    break
        
        if not has_common_endpoint:
            top_endpoint = benchmarks["common_endpoints"][0]["endpoint"] if benchmarks["common_endpoints"] else None
            protocol_endpoint = protocol_data["primary_endpoints"][0] if protocol_data["primary_endpoints"] else None
            
            if top_endpoint and protocol_endpoint:
                insights.append(
                    f"Your chosen primary endpoint '{protocol_endpoint}' differs from the most commonly used endpoint "
                    f"'{top_endpoint}' for this indication and phase. Consider the regulatory implications."
                )
    
    # Success probability insights
    if prediction["success_probability"] < 0.5:
        insights.append(
            f"Based on our ML model, your protocol has a lower predicted success probability "
            f"({int(prediction['success_probability'] * 100)}%). Consider modifications to improve chances of success."
        )
    elif prediction["success_probability"] > 0.75:
        insights.append(
            f"Your protocol design shows promising success indicators with a {int(prediction['success_probability'] * 100)}% "
            f"predicted success probability based on our ML analysis."
        )
    
    # Similar trials insights
    successful_similar = [t for t in similar_trials if t["outcome"].lower() == "success"]
    failed_similar = [t for t in similar_trials if t["outcome"].lower() == "failure"]
    
    if successful_similar and failed_similar:
        success_count = len(successful_similar)
        failure_count = len(failed_similar)
        total = success_count + failure_count
        success_rate = (success_count / total) * 100 if total > 0 else 0
        
        insights.append(
            f"Your protocol is similar to {total} previous trials, with a {int(success_rate)}% historical success rate "
            f"({success_count} successes, {failure_count} failures)."
        )
    
    # Add innovative approach insight if flagged
    if risk_flags["innovative_approach"]:
        insights.append(
            "Your protocol shows innovative elements that diverge from typical trials in this indication. "
            "While innovation can lead to breakthroughs, consider including traditional metrics as secondary endpoints."
        )
    
    return insights

def generate_recommendation_summary(insights: List[str], risk_flags: Dict[str, bool]) -> str:
    """Generate a concise recommendation summary"""
    high_risk_count = sum(1 for flag, is_flagged in risk_flags.items() if is_flagged and flag != "innovative_approach")
    
    if high_risk_count >= 3:
        return (
            "This protocol has multiple high-risk elements that significantly diverge from successful precedent. "
            "Consider addressing the identified issues before proceeding, particularly regarding sample size, "
            "endpoint selection, and trial duration."
        )
    elif high_risk_count >= 1:
        return (
            "This protocol has some potential risk factors that may impact success probability. "
            "Review the specific insights provided to optimize your design and align with successful precedent "
            "where appropriate."
        )
    elif risk_flags["innovative_approach"]:
        return (
            "This protocol includes innovative approaches while maintaining reasonable risk parameters. "
            "The design appears generally sound, though consider the strategic insights provided to "
            "enhance probability of success."
        )
    else:
        return (
            "This protocol design aligns well with successful precedent for this indication and phase. "
            "Consider minor optimizations noted in the strategic insights, but the overall design "
            "appears well-positioned for success."
        )

def generate_risk_scores(
    protocol_data: Dict[str, Any],
    benchmarks: Dict[str, Any],
    risk_flags: Dict[str, bool],
    prediction: Dict[str, float],
    similar_trials: List[Dict[str, Any]]
) -> Dict[str, float]:
    """Generate risk scores for various factors"""
    risk_scores = {
        "success_probability": prediction["success_probability"],
        "dropout_risk": 0.0,
        "regulatory_alignment": 0.0,
        "innovation_index": 0.0,
        "competitive_edge": 0.0
    }
    
    # Calculate dropout risk (higher score = higher risk)
    if benchmarks["avg_dropout"] and protocol_data["dropout_rate"] is not None:
        if protocol_data["dropout_rate"] < benchmarks["avg_dropout"] * 0.6:
            # Optimistic dropout estimate
            risk_scores["dropout_risk"] = 0.8
        elif protocol_data["dropout_rate"] < benchmarks["avg_dropout"] * 0.8:
            risk_scores["dropout_risk"] = 0.6
        elif protocol_data["dropout_rate"] < benchmarks["avg_dropout"] * 1.2:
            risk_scores["dropout_risk"] = 0.3
        else:
            risk_scores["dropout_risk"] = 0.1
    else:
        risk_scores["dropout_risk"] = 0.5
    
    # Calculate regulatory alignment (higher score = better alignment)
    alignment_score = 0.0
    alignment_factors = 0
    
    # Endpoint alignment
    if benchmarks["common_endpoints"] and protocol_data["primary_endpoints"]:
        has_common_endpoint = False
        for endpoint_info in benchmarks["common_endpoints"]:
            common_endpoint = endpoint_info["endpoint"]
            for protocol_endpoint in protocol_data["primary_endpoints"]:
                if common_endpoint and protocol_endpoint and (
                    common_endpoint.lower() in protocol_endpoint.lower() or
                    protocol_endpoint.lower() in common_endpoint.lower()
                ):
                    has_common_endpoint = True
                    break
        
        if has_common_endpoint:
            alignment_score += 1.0
        else:
            alignment_score += 0.2
        
        alignment_factors += 1
    
    # Design alignment
    if protocol_data["arms"] and len(protocol_data["arms"]) >= 2:
        alignment_score += 1.0
    else:
        alignment_score += 0.4
    
    alignment_factors += 1
    
    # Sample size and duration alignment
    if benchmarks["avg_sample_size"] and protocol_data["sample_size"]:
        diff_ratio = abs(protocol_data["sample_size"] - benchmarks["avg_sample_size"]) / benchmarks["avg_sample_size"]
        if diff_ratio <= 0.2:
            alignment_score += 1.0
        elif diff_ratio <= 0.4:
            alignment_score += 0.7
        elif diff_ratio <= 0.6:
            alignment_score += 0.5
        else:
            alignment_score += 0.3
        
        alignment_factors += 1
    
    if benchmarks["avg_duration"] and protocol_data["duration_weeks"]:
        diff_ratio = abs(protocol_data["duration_weeks"] - benchmarks["avg_duration"]) / benchmarks["avg_duration"]
        if diff_ratio <= 0.2:
            alignment_score += 1.0
        elif diff_ratio <= 0.4:
            alignment_score += 0.7
        elif diff_ratio <= 0.6:
            alignment_score += 0.5
        else:
            alignment_score += 0.3
        
        alignment_factors += 1
    
    if alignment_factors > 0:
        risk_scores["regulatory_alignment"] = alignment_score / alignment_factors
    else:
        risk_scores["regulatory_alignment"] = 0.5
    
    # Calculate innovation index
    innovation_score = 0.0
    
    # Endpoint innovation
    if risk_flags["endpoint_risk"]:
        innovation_score += 0.8
    else:
        innovation_score += 0.1
    
    # Design innovation
    if protocol_data["study_design"] and "novel" in protocol_data["study_design"].lower():
        innovation_score += 0.7
    
    # Duration innovation
    if benchmarks["avg_duration"] and protocol_data["duration_weeks"]:
        if protocol_data["duration_weeks"] < benchmarks["avg_duration"] * 0.7:
            innovation_score += 0.6
        elif protocol_data["duration_weeks"] > benchmarks["avg_duration"] * 1.3:
            innovation_score += 0.4
    
    risk_scores["innovation_index"] = min(1.0, innovation_score / 2.0)
    
    # Calculate competitive edge
    competitive_edge = 0.0
    
    # Success probability contribution
    competitive_edge += prediction["success_probability"] * 0.4
    
    # Innovation contribution
    competitive_edge += risk_scores["innovation_index"] * 0.3
    
    # Duration efficiency contribution
    if benchmarks["avg_duration"] and protocol_data["duration_weeks"]:
        if protocol_data["duration_weeks"] < benchmarks["avg_duration"]:
            duration_advantage = 1.0 - (protocol_data["duration_weeks"] / benchmarks["avg_duration"])
            competitive_edge += duration_advantage * 0.3
        else:
            competitive_edge += 0.05
    
    risk_scores["competitive_edge"] = min(1.0, competitive_edge)
    
    return risk_scores

def analyze_protocol(protocol_data: Dict[str, Any], protocol_id: int) -> Dict[str, Any]:
    """Perform full analysis of protocol data"""
    # Connect to database
    conn = connect_to_database()
    
    # Load ML model
    model = load_ml_model()
    
    # Get CSR benchmarks
    benchmarks = get_csr_benchmarks(conn, protocol_data["indication"], protocol_data["phase"])
    
    # Find similar CSRs
    similar_trials = find_similar_csrs(conn, protocol_data)
    
    # Predict success
    prediction = predict_success(protocol_data, model)
    
    # Analyze risk flags
    risk_flags = analyze_risk_flags(protocol_data, benchmarks)
    
    # Generate strategic insights
    strategic_insights = generate_strategic_insights(
        protocol_data, benchmarks, risk_flags, prediction, similar_trials
    )
    
    # Generate recommendation summary
    recommendation_summary = generate_recommendation_summary(strategic_insights, risk_flags)
    
    # Generate risk scores
    risk_scores = generate_risk_scores(
        protocol_data, benchmarks, risk_flags, prediction, similar_trials
    )
    
    # Close database connection
    conn.close()
    
    # Return complete analysis
    return {
        "protocol_id": protocol_id,
        "extracted_data": protocol_data,
        "risk_flags": risk_flags,
        "csr_matches": similar_trials,
        "risk_scores": risk_scores,
        "strategic_insights": strategic_insights,
        "recommendation_summary": recommendation_summary
    }

def main():
    parser = argparse.ArgumentParser(description="Analyze protocol data against CSR benchmarks")
    parser.add_argument("input_file", help="Path to protocol data JSON file")
    parser.add_argument("output_file", help="Path to output analysis JSON file")
    parser.add_argument("protocol_id", help="Protocol ID")
    
    args = parser.parse_args()
    
    try:
        protocol_id = int(args.protocol_id)
    except ValueError:
        print("Error: Protocol ID must be an integer")
        sys.exit(1)
    
    # Load protocol data
    with open(args.input_file, 'r', encoding='utf-8') as f:
        protocol_data = json.load(f)
    
    # Analyze protocol
    analysis_result = analyze_protocol(protocol_data, protocol_id)
    
    # Write output to JSON file
    with open(args.output_file, 'w', encoding='utf-8') as f:
        json.dump(analysis_result, f, indent=2)
    
    print(f"Protocol analysis completed successfully. Results saved to {args.output_file}")

if __name__ == "__main__":
    main()