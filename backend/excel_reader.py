#!/usr/bin/env python3
import sys
import pandas as pd
import os

def extract_excel_content(file_path):
    """Extract and print content from Excel file."""
    try:
        # List all sheets
        xl = pd.ExcelFile(file_path)
        print(f"\nFile: {os.path.basename(file_path)}")
        print(f"Sheets: {xl.sheet_names}")
        
        # Process each sheet
        for sheet_name in xl.sheet_names:
            print(f"\n==== SHEET: {sheet_name} ====")
            
            # Read with pandas
            df = pd.read_excel(file_path, sheet_name=sheet_name)
            
            # Print sheet info
            print(f"Rows: {len(df)}, Columns: {len(df.columns)}")
            print("\nColumn names:")
            for col in df.columns:
                print(f"  - {col}")
                
            # Print first few rows
            if not df.empty:
                print("\nFirst 10 rows:")
                print(df.head(10).to_string())
            else:
                print("Sheet is empty")
            
            print("=" * 80)
    
    except Exception as e:
        print(f"Error processing Excel file: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    file_path = "attached_assets/dream eCTD machine 2.xlsx"
    extract_excel_content(file_path)