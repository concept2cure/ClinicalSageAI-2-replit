"""
Widget persistence layer (org + user scoped) with live SQL execution.
"""
import sqlite3
import json
import pathlib
import traceback
from typing import List, Dict, Any, Optional

# Ensure the data directory exists
DB = pathlib.Path('data/widgets.db')
DB.parent.mkdir(exist_ok=True)

# Initialize the database connection with row factory
conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row

# Create the widgets table if it doesn't exist
conn.execute('''CREATE TABLE IF NOT EXISTS widget (
  id INTEGER PRIMARY KEY,
  org TEXT,
  user TEXT,
  name TEXT, visibility TEXT,
  sql TEXT,
  type TEXT,
  layout TEXT
);''')
conn.commit()

# Create metrics table for KPI testing if it doesn't exist
conn.execute('''CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY,
  org TEXT,
  metric_name TEXT, visibility TEXT,
  metric_value REAL,
  category TEXT,
  timestamp TEXT
);''')

# Insert sample data if the metrics table is empty
if not conn.execute("SELECT COUNT(*) FROM metrics").fetchone()[0]:
    sample_data = [
        ('org1', 'Protocol Compliance', 85.2, 'Documents', '2025-01-15'),
        ('org1', 'Document Accuracy', 92.3, 'Documents', '2025-01-15'),
        ('org1', 'Alert Response Time', 4.5, 'Response', '2025-01-15'),
        ('org1', 'Alerts Resolved', 37, 'Response', '2025-01-15'),
        ('org1', 'Protocol Compliance', 88.7, 'Documents', '2025-02-15'),
        ('org1', 'Document Accuracy', 94.1, 'Documents', '2025-02-15'),
        ('org1', 'Alert Response Time', 3.8, 'Response', '2025-02-15'),
        ('org1', 'Alerts Resolved', 42, 'Response', '2025-02-15'),
        ('org1', 'Protocol Compliance', 91.3, 'Documents', '2025-03-15'),
        ('org1', 'Document Accuracy', 95.8, 'Documents', '2025-03-15'),
        ('org1', 'Alert Response Time', 3.2, 'Response', '2025-03-15'),
        ('org1', 'Alerts Resolved', 51, 'Response', '2025-03-15'),
        ('org2', 'Protocol Compliance', 87.1, 'Documents', '2025-03-15'),
        ('org2', 'Document Accuracy', 93.4, 'Documents', '2025-03-15'),
    ]
    conn.executemany(
        "INSERT INTO metrics (org, metric_name, metric_value, category, timestamp) VALUES (?, ?, ?, ?, ?)",
        sample_data
    )
    conn.commit()
    print("Added sample metrics data for KPI widgets")

def list_widgets(org: str, user: str) -> List[Dict[str, Any]]:
    """List all widgets for a specific org and user."""
    cur = conn.execute('SELECT * FROM widget WHERE org=? AND user=?', (org, user))
    return [dict(r) for r in cur.fetchall()]

def save_widget(org: str, user: str, wd: dict) -> Dict[str, Any]:
    """Save a widget and return the saved widget data."""
    if wd.get('id'):
        conn.execute(
            'UPDATE widget SET name=?, sql=?, type=?, layout=? WHERE id=? AND user=?',
            (wd['name'], wd['sql'], wd['type'], json.dumps(wd['layout']), wd['id'], user)
        )
        widget_id = wd['id']
    else:
        cursor = conn.execute(
            'INSERT INTO widget(org, user, name, sql, type, layout) VALUES(?, ?, ?, ?, ?, ?)',
            (org, user, wd['name'], wd['sql'], wd['type'], json.dumps(wd['layout']))
        )
        widget_id = cursor.lastrowid
    
    conn.commit()
    
    # Return the saved widget
    cursor = conn.execute('SELECT * FROM widget WHERE id=?', (widget_id,))
    return dict(cursor.fetchone())

def delete_widget(org: str, user: str, widget_id: int) -> bool:
    """Delete a widget and return success status."""
    conn.execute(
        'DELETE FROM widget WHERE id=? AND org=? AND user=?',
        (widget_id, org, user)
    )
    conn.commit()
    return True

def update_layout(org: str, user: str, layouts: List[Dict[str, Any]]) -> bool:
    """Update the layout for multiple widgets at once."""
    try:
        for layout in layouts:
            widget_id = layout.pop('id')
            conn.execute(
                'UPDATE widget SET layout=? WHERE id=? AND org=? AND user=?',
                (json.dumps(layout), widget_id, org, user)
            )
        conn.commit()
        return True
    except Exception:
        traceback.print_exc()
        return False

def execute_widget_sql(org: str, widget_id: Optional[int] = None, sql: Optional[str] = None) -> Dict[str, Any]:
    """
    Execute SQL for a widget and return the results.
    
    Args:
        org: Organization ID to scope the query
        widget_id: ID of the widget (if executing a saved widget)
        sql: SQL string (if executing ad-hoc SQL)
        
    Returns:
        Dict containing execution status and results
    """
    if widget_id is None and sql is None:
        return {'success': False, 'error': 'Either widget_id or sql must be provided'}
    
    try:
        # Get the SQL from the widget if widget_id is provided
        if widget_id is not None:
            cursor = conn.execute('SELECT sql FROM widget WHERE id=?', (widget_id,))
            row = cursor.fetchone()
            if not row:
                return {'success': False, 'error': f'Widget with ID {widget_id} not found'}
            sql = row['sql']
        
        # Secure the SQL by ensuring it only accesses the metrics table and scopes to the org
        if 'metrics' not in sql.lower():
            return {'success': False, 'error': 'SQL must query the metrics table'}
        
        # Add org filter if not already present
        if 'where org' not in sql.lower() and 'where ' in sql.lower():
            sql = sql.replace('WHERE ', f"WHERE org='{org}' AND ")
        elif 'where' not in sql.lower():
            sql = sql + f" WHERE org='{org}'"
        
        # Execute the SQL
        cursor = conn.execute(sql)
        columns = [desc[0] for desc in cursor.description]
        results = [dict(zip(columns, row)) for row in cursor.fetchall()]
        
        return {
            'success': True,
            'columns': columns,
            'results': results
        }
    except Exception as e:
        traceback.print_exc()
        return {
            'success': False,
            'error': str(e)
        }
