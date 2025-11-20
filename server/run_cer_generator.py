#!/usr/bin/env python
"""
CER Generator Runner

This script provides a command-line interface to the CER generator.
It accepts input parameters and runs the generator.
"""

import os
import sys
import argparse
import logging
import asyncio
from datetime import datetime, timedelta
import traceback

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("cer_generator")

# Try to import from the enhanced generator, if it fails fall back to simple generator
try:
    from enhanced_cer_generator import generate_cer
    logger.info("Using enhanced CER generator")
except ImportError:
    try:
        from simple_cer_generator import generate_cer
        logger.info("Using simple CER generator (enhanced generator not available)")
    except ImportError:
        logger.error("Failed to import any CER generator")
        sys.exit(1)

async def main():
    """Main entry point for the CER generator script"""
    parser = argparse.ArgumentParser(description='Generate a Clinical Evaluation Report')
    
    # Required arguments
    parser.add_argument('--id', required=True, help='Product identifier (NDC code or device code)')
    parser.add_argument('--name', required=True, help='Product name')
    
    # Optional arguments
    parser.add_argument('--manufacturer', help='Manufacturer name')
    parser.add_argument('--description', help='Device description')
    parser.add_argument('--purpose', help='Intended purpose')
    parser.add_argument('--class', dest='classification', help='Device classification (e.g., Class I, II, III)')
    parser.add_argument('--days', type=int, default=730, help='Date range in days to look back for reports')
    parser.add_argument('--format', choices=['pdf', 'json'], default='pdf', help='Output format')
    
    args = parser.parse_args()
    
    # Ensure output directory exists
    output_dir = os.path.join(os.getcwd(), 'data', 'exports')
    os.makedirs(output_dir, exist_ok=True)
    
    try:
        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=args.days)
        
        logger.info(f"Generating CER for {args.name} ({args.id})")
        
        # Generate the CER
        result = await generate_cer(
            product_id=args.id,
            product_name=args.name,
            manufacturer=args.manufacturer,
            device_description=args.description,
            intended_purpose=args.purpose,
            classification=args.classification,
            date_range=args.days,
            output_format=args.format
        )
        
        # Print the result
        output_path = result.get('path', 'Unknown')
        print(f"CER generated successfully")
        print(f"Output file: {output_path}")
        
        # Return success
        return 0
    except Exception as e:
        logger.error(f"Error generating CER: {str(e)}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return 1

if __name__ == "__main__":
    sys.exit(asyncio.run(main()))