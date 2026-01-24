-- Dashboard table for Analytics Module
CREATE TABLE IF NOT EXISTS dashboards (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  vega_spec JSONB NOT NULL,
  organization_id INTEGER NOT NULL,
  created_by INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups by organization
CREATE INDEX IF NOT EXISTS idx_dashboards_org 
ON dashboards(organization_id);

-- Add dummy data for development
INSERT INTO dashboards (title, vega_spec, organization_id, created_by)
VALUES 
  ('Clinical Trial Phases Overview', 
   '{
      "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
      "description": "A simple bar chart showing clinical trial phases",
      "data": {
        "values": [
          {"phase": "Phase I", "count": 15},
          {"phase": "Phase II", "count": 24},
          {"phase": "Phase III", "count": 18},
          {"phase": "Phase IV", "count": 7}
        ]
      },
      "mark": "bar",
      "encoding": {
        "x": {"field": "phase", "type": "nominal", "title": "Clinical Trial Phase"},
        "y": {"field": "count", "type": "quantitative", "title": "Number of Studies"},
        "color": {"field": "phase", "type": "nominal", "scale": {"scheme": "category10"}}
      }
    }',
   1, 1),
  ('Subject Enrollment by Study', 
   '{
      "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
      "description": "Study enrollment metrics",
      "data": {
        "values": [
          {"study": "CLIN-001", "enrolled": 42, "target": 50},
          {"study": "CLIN-002", "enrolled": 28, "target": 30},
          {"study": "CLIN-003", "enrolled": 15, "target": 45},
          {"study": "CLIN-004", "enrolled": 38, "target": 40}
        ]
      },
      "mark": "bar",
      "encoding": {
        "x": {"field": "study", "type": "nominal", "title": "Study ID"},
        "y": {"field": "enrolled", "type": "quantitative", "title": "Subjects Enrolled"},
        "color": {"value": "#4C78A8"}
      }
    }',
   1, 2),
  ('Adverse Events by Severity', 
   '{
      "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
      "description": "Adverse events by severity level",
      "data": {
        "values": [
          {"severity": "Grade 1 (Mild)", "count": 52},
          {"severity": "Grade 2 (Moderate)", "count": 31},
          {"severity": "Grade 3 (Severe)", "count": 12},
          {"severity": "Grade 4 (Life-threatening)", "count": 3},
          {"severity": "Grade 5 (Death)", "count": 0}
        ]
      },
      "mark": "bar",
      "encoding": {
        "x": {"field": "severity", "type": "nominal", "title": "Severity Grade"},
        "y": {"field": "count", "type": "quantitative", "title": "Number of Events"},
        "color": {
          "field": "severity", 
          "type": "nominal",
          "scale": {
            "domain": ["Grade 1 (Mild)", "Grade 2 (Moderate)", "Grade 3 (Severe)", "Grade 4 (Life-threatening)", "Grade 5 (Death)"],
            "range": ["#74c476", "#fdae6b", "#fd8d3c", "#e6550d", "#a63603"]
          }
        }
      }
    }',
   1, 1)
ON CONFLICT DO NOTHING;