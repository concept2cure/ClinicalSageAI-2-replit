import pandas as pd, datetime, json, os
from pathlib import Path
from ind_automation import db
CACHE_DIR=Path('data/metrics'); CACHE_DIR.mkdir(parents=True,exist_ok=True)

def _cache(org, df):
    df.to_json(CACHE_DIR/f"{org}.json",orient='records')

def compute(org):
    hist=db.get_history(org)
    if not hist: return pd.DataFrame()
    df=pd.DataFrame(hist)
    df['date']=pd.to_datetime(df['timestamp']).dt.date
    _cache(org,df)
    return df

def load(org):
    f=CACHE_DIR/f"{org}.json"; return pd.read_json(f) if f.exists() else compute(org)