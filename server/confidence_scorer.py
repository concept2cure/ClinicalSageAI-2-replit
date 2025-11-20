from typing import Dict
import re

# Simple heuristic-based scoring system (placeholder for ML-powered version)

def score_protocol(protocol_text: str) -> Dict:
    text = protocol_text.lower()
    score = 100
    penalties = []

    # Endpoint presence check
    if "primary endpoint" not in text:
        score -= 15
        penalties.append("Missing clearly stated primary endpoint")

    # Sample size adequacy
    match = re.search(r"sample size of (\d+)", text)
    if match:
        sample_size = int(match.group(1))
        if sample_size < 100:
            score -= 10
            penalties.append(f"Sample size too small ({sample_size})")
    else:
        score -= 10
        penalties.append("No sample size detected")

    # Duration check
    if "weeks" in text:
        try:
            dur_match = re.search(r"(\d+)\s+weeks", text)
            duration = int(dur_match.group(1))
            if duration < 8:
                score -= 10
                penalties.append(f"Trial duration short ({duration} weeks)")
        except:
            score -= 5
            penalties.append("Duration unclear")
    else:
        score -= 5
        penalties.append("No duration found")

    # Control group presence
    if not re.search(r"control (arm|group|cohort)", text):
        score -= 10
        penalties.append("Control arm not described")

    # Randomization keyword
    if "randomized" not in text:
        score -= 5
        penalties.append("Randomization not mentioned")

    score = max(score, 0)

    return {
        "confidence_score": score,
        "issues": penalties,
        "verdict": (
            "Strong protocol design" if score >= 85 else
            "Moderate design — consider revisions" if score >= 65 else
            "High risk of design flaws"
        )
    }