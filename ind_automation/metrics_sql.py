import sqlite3, pandas as pd, datetime, json, os
from pathlib import Path
from ind_automation import db
DB=Path('data/metrics.db'); conn=sqlite3.connect(DB)
c=conn.cursor(); c.execute('''CREATE TABLE IF NOT EXISTS metrics(
  org TEXT, timestamp TEXT, type TEXT, msg TEXT, extra TEXT)''');
c.execute('CREATE INDEX IF NOT EXISTS idx_metrics_org_ts ON metrics(org,timestamp)'); conn.commit()


def refresh(org):
    hist=db.get_history(org); if not hist: return
    with conn:
        conn.execute('DELETE FROM metrics WHERE org=?',(org,))
        conn.executemany('INSERT INTO metrics VALUES(?,?,?,?,?)',
          [(org,h['timestamp'],h.get('type',''),h.get('msg',''),json.dumps(h)) for h in hist])


def query(org, rule=None, limit=100, offset=0, from_=None, to=None):
    q='SELECT timestamp,msg,extra FROM metrics WHERE org=?'; params=[org]
    if from_: 
        q+=" AND timestamp>=?"
        params.append(from_)
    if to: 
        q+=" AND timestamp<=?"
        params.append(to)
    if rule:
        q+=' AND msg LIKE ?'; params.append(f'%{rule}%')
    q+=' ORDER BY timestamp DESC LIMIT ? OFFSET ?'; params+= [limit,offset]
    rows=conn.execute(q,params).fetchall()
    return [json.loads(r[2])|{'timestamp':r[0],'msg':r[1]} for r in rows]
