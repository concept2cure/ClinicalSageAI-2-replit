from server.db import SessionLocal
from server.models.csr import Benchmark, InsightModel, TrendPoint
from datetime import datetime
import json

# Initialize the DB session
db = SessionLocal()

# Generate trend data for benchmarks
def generate_trend_data(start_value, volatility=0.15, periods=8):
    """Generate synthetic trend data with realistic patterns"""
    value = start_value
    trend = []
    
    # Create quarterly data points for the last 2 years
    years = [2023, 2024]
    quarters = ["Q1", "Q2", "Q3", "Q4"]
    
    for year in years:
        for quarter in quarters:
            # Add some random variation but keep a general trend
            change = (value * volatility * (0.5 - 0.5 * (year == 2023)))  # Earlier data higher
            value = max(0.1, value + change)
            
            trend.append({
                "date": f"{year}-{quarter}",
                "value": round(value, 2)
            })
    
    return trend

# Add benchmarks data with trends
benchmarks = [
    Benchmark(
        metric="Median Enrollment Time", 
        value=8.7, 
        unit="months",
        trend=generate_trend_data(9.4)  # Starting higher and improving
    ),
    Benchmark(
        metric="Screen-Fail Rate (median)", 
        value=19.2, 
        unit="%",
        trend=generate_trend_data(22.1)
    ),
    Benchmark(
        metric="Protocol Amendments per Study", 
        value=2.3, 
        unit="amendments",
        trend=generate_trend_data(2.7)
    ),
    Benchmark(
        metric="Average Study Duration", 
        value=22.8, 
        unit="months",
        trend=generate_trend_data(24.2)
    ),
    Benchmark(
        metric="Site Activation Time", 
        value=4.2, 
        unit="months",
        trend=generate_trend_data(4.8)
    ),
    Benchmark(
        metric="Patient Retention Rate", 
        value=82.7, 
        unit="%",
        trend=generate_trend_data(79.2, volatility=0.05)
    ),
    Benchmark(
        metric="Protocol Complexity Score", 
        value=3.8, 
        unit="points",
        trend=generate_trend_data(4.2)
    ),
    Benchmark(
        metric="Eligibility Criteria Count", 
        value=24.6, 
        unit="criteria",
        trend=generate_trend_data(27.3)
    ),
    Benchmark(
        metric="Protocol Page Count", 
        value=87.2, 
        unit="pages",
        trend=generate_trend_data(92.1)
    ),
    Benchmark(
        metric="Average Visit Count", 
        value=12.8, 
        unit="visits",
        trend=generate_trend_data(13.2)
    ),
    Benchmark(
        metric="Data Query Rate", 
        value=0.47, 
        unit="per subject",
        trend=generate_trend_data(0.62)
    ),
    Benchmark(
        metric="Protocol Deviation Rate", 
        value=3.2, 
        unit="per site",
        trend=generate_trend_data(3.8)
    ),
    Benchmark(
        metric="Days to Database Lock", 
        value=42, 
        unit="days",
        trend=generate_trend_data(48)
    ),
    Benchmark(
        metric="Subject Discontinuation Rate", 
        value=14.3, 
        unit="%",
        trend=generate_trend_data(16.2)
    ),
    Benchmark(
        metric="Time to First Patient First Visit", 
        value=6.2, 
        unit="months",
        trend=generate_trend_data(6.5)
    ),
    Benchmark(
        metric="Laboratory Test Count", 
        value=34.2, 
        unit="tests",
        trend=generate_trend_data(32.1, volatility=0.08)
    ),
    Benchmark(
        metric="ICF Page Count", 
        value=18.5, 
        unit="pages",
        trend=generate_trend_data(16.7, volatility=0.07)
    ),
    Benchmark(
        metric="CRF Page Count", 
        value=42.3, 
        unit="pages",
        trend=generate_trend_data(45.1)
    ),
    Benchmark(
        metric="Average Query Resolution Time", 
        value=8.4, 
        unit="days",
        trend=generate_trend_data(9.1)
    ),
    Benchmark(
        metric="Site Monitoring Frequency", 
        value=6.8, 
        unit="weeks",
        trend=generate_trend_data(7.2)
    )
]

# Add AI models data with tags and doc URLs
ai_models = [
    InsightModel(
        name="Outcome Success Predictor",
        description="Gradient-boosted model predicting Ph-II→III success for protocols based on 17 key design parameters",
        version="1.2",
        created_at=datetime(2024, 11, 15),
        tags=["efficacy", "ml", "predictive"],
        doc_url="https://docs.trialsage.ai/models/outcome-predictor"
    ),
    InsightModel(
        name="Protocol Complexity Analyzer",
        description="Measures complexity of clinical protocols against therapeutic area benchmarks",
        version="2.1",
        created_at=datetime(2024, 12, 10),
        tags=["protocol", "complexity", "benchmarks"],
        doc_url="https://docs.trialsage.ai/models/complexity-analyzer"
    ),
    InsightModel(
        name="Enrollment Rate Predictor",
        description="Forecasts patient enrollment based on historical rates and protocol parameters",
        version="1.5",
        created_at=datetime(2024, 10, 22),
        tags=["enrollment", "predictive", "ml"],
        doc_url="https://docs.trialsage.ai/models/enrollment-predictor"
    ),
    InsightModel(
        name="Patient Dropout Estimator",
        description="Predicts discontinuation rates based on visit schedule and procedure burden",
        version="1.0",
        created_at=datetime(2025, 1, 5),
        tags=["retention", "predictive", "ml"],
        doc_url="https://docs.trialsage.ai/models/dropout-estimator"
    ),
    InsightModel(
        name="Endpoint Selection Optimizer",
        description="Recommends optimal primary/secondary endpoints based on therapeutic area success patterns",
        version="2.3",
        created_at=datetime(2025, 2, 17),
        tags=["endpoints", "optimization", "ml"],
        doc_url="https://docs.trialsage.ai/models/endpoint-optimizer"
    ),
    InsightModel(
        name="Inclusion/Exclusion Refinement",
        description="AI-enhanced tool for optimizing eligibility criteria to maximize enrollment while maintaining data quality",
        version="1.8",
        created_at=datetime(2025, 1, 30),
        tags=["eligibility", "enrollment", "optimization"],
        doc_url="https://docs.trialsage.ai/models/criteria-refinement"
    ),
    InsightModel(
        name="Statistical Power Calculator",
        description="Advanced power calculations incorporating historical variability from similar trials",
        version="3.0",
        created_at=datetime(2025, 3, 1),
        tags=["statistics", "power", "sample-size"],
        doc_url="https://docs.trialsage.ai/models/power-calculator"
    ),
    InsightModel(
        name="Regulatory Success Rate Model",
        description="Predicts likelihood of regulatory approval based on protocol design and previous submissions",
        version="1.1",
        created_at=datetime(2024, 9, 15),
        tags=["regulatory", "approval", "predictive"],
        doc_url="https://docs.trialsage.ai/models/regulatory-predictor"
    ),
    InsightModel(
        name="Site Selection Optimizer",
        description="ML model for optimal site selection based on historical performance metrics",
        version="2.0",
        created_at=datetime(2025, 2, 5),
        tags=["sites", "optimization", "geography"],
        doc_url="https://docs.trialsage.ai/models/site-optimizer"
    ),
    InsightModel(
        name="Patient Population Analyzer",
        description="Identifies optimal patient subgroups for enhanced treatment effect based on biomarkers",
        version="1.4",
        created_at=datetime(2024, 11, 27),
        tags=["population", "biomarkers", "ml"],
        doc_url="https://docs.trialsage.ai/models/population-analyzer"
    ),
    InsightModel(
        name="Protocol Amendment Predictor",
        description="Identifies protocol elements with high likelihood of requiring amendments during the study",
        version="1.0",
        created_at=datetime(2025, 1, 10),
        tags=["protocol", "amendments", "risk"],
        doc_url="https://docs.trialsage.ai/models/amendment-predictor"
    ),
    InsightModel(
        name="Dosing Regimen Optimizer",
        description="Recommends optimal dosing strategies based on PK/PD modeling and historical data",
        version="1.2",
        created_at=datetime(2024, 12, 22),
        tags=["dosing", "pk-pd", "optimization"],
        doc_url="https://docs.trialsage.ai/models/dosing-optimizer"
    ),
    InsightModel(
        name="Safety Signal Detector",
        description="Early detection of potential safety signals from similar compounds in development",
        version="2.1",
        created_at=datetime(2025, 2, 10),
        tags=["safety", "pharmacovigilance", "risk"],
        doc_url="https://docs.trialsage.ai/models/safety-detector"
    ),
    InsightModel(
        name="Study Budget Estimator",
        description="Predicts study costs based on design parameters and benchmark data",
        version="1.7",
        created_at=datetime(2025, 1, 20),
        tags=["budget", "finance", "planning"],
        doc_url="https://docs.trialsage.ai/models/budget-estimator"
    )
]

# Add data to database
db.add_all(benchmarks)
db.add_all(ai_models)

# Commit the changes
db.commit()
db.close()

print(f"✅ Seeded {len(benchmarks)} benchmarks and {len(ai_models)} AI insight models")