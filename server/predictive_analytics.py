# predictive_analytics.py
import pandas as pd
from statsmodels.tsa.arima.model import ARIMA

def aggregate_time_series(records: list, date_field="event_date", count_field="count", interval="M"):
    """
    Aggregate records into a time series for trend analysis
    
    Args:
        records: list of normalized dicts with date_field and count_field
        date_field: field containing date
        count_field: field to aggregate 
        interval: pandas offset alias (e.g. 'M' for month)
        
    Returns:
        pd.Series with time index and aggregated counts
    """
    if not records:
        # Return empty series if no records
        return pd.Series(dtype=float)
        
    df = pd.DataFrame(records)
    
    # Skip if date field is missing
    if date_field not in df.columns:
        print(f"Warning: {date_field} not found in records")
        return pd.Series(dtype=float)
    
    # Convert date field to datetime
    df[date_field] = pd.to_datetime(df[date_field], errors='coerce')
    
    # Filter out records with invalid dates
    df = df.dropna(subset=[date_field])
    
    # If no valid dates remain, return empty series
    if len(df) == 0:
        return pd.Series(dtype=float)
    
    # Set date as index and resample
    df.set_index(date_field, inplace=True)
    
    # Handle case where count_field doesn't exist
    if count_field not in df.columns:
        print(f"Warning: {count_field} not found in records, using count=1 for each record")
        df[count_field] = 1
    
    # Resample and aggregate
    series = df[count_field].resample(interval).sum().fillna(0)
    return series

def forecast_adverse_events(series: pd.Series, periods: int = 3):
    """
    Fits ARIMA(1,1,1) and forecasts `periods` intervals ahead.
    
    Args:
        series: Time series of event counts
        periods: Number of periods to forecast
        
    Returns:
        Dictionary {period_end: forecast_value}
    """
    # Return empty dict if series is empty or has fewer than 4 points
    if len(series) < 4:
        print("Warning: Not enough data points for forecasting (need at least 4)")
        return {}
    
    try:
        # Fit ARIMA model
        model = ARIMA(series, order=(1, 1, 1))
        fit = model.fit()
        
        # Generate forecast
        fc = fit.forecast(steps=periods)
        
        # Convert to dict with date string keys
        return {str(idx.date()): float(val) for idx, val in fc.items()}
    except Exception as e:
        print(f"Forecasting error: {e}")
        return {}

def detect_anomalies(series: pd.Series, threshold: float = 1.5):
    """
    Flags any point where value > rolling_mean * threshold.
    
    Args:
        series: Time series of event counts
        threshold: Multiplier for rolling mean to define anomaly
        
    Returns:
        Dictionary {date: value} of anomalies
    """
    # Return empty dict if series is empty
    if len(series) == 0:
        return {}
    
    try:
        # Calculate rolling mean with window of 3 (or as many as available)
        rolling = series.rolling(window=3, min_periods=1).mean()
        
        # Identify anomalies where value exceeds threshold * rolling mean
        mask = series > (rolling * threshold)
        
        # Convert to dict with date string keys
        return {str(idx.date()): float(series[idx]) for idx in series.index[mask]}
    except Exception as e:
        print(f"Anomaly detection error: {e}")
        return {}