#!/usr/bin/env python
"""
MAUDE Client for LumenTrialGuide.AI

This module provides functions to query the FDA's Manufacturer and User Facility 
Device Experience (MAUDE) database for medical device complaints and adverse events.
MAUDE contains reports of adverse events involving medical devices.

Reference: https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfmaude/search.cfm
"""
import requests
import json
import os
import time
import logging
from datetime import datetime, timedelta
from urllib.parse import urlencode
from bs4 import BeautifulSoup

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("maude_client.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("maude_client")

# Base URLs for FDA MAUDE system
MAUDE_SEARCH_URL = "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfMAUDE/results.cfm"
MAUDE_DETAIL_URL = "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfMAUDE/detail.cfm"
MAUDE_EXPORT_URL = "https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfMAUDE/export_results.cfm"

# Rate limit management
REQUEST_DELAY = 2.0  # seconds between requests
REQUEST_TIMEOUT = 30  # seconds before request timeout

class MaudeClient:
    """Client for accessing FDA MAUDE data"""
    
    def __init__(self):
        """Initialize the MAUDE client"""
        self.session = requests.Session()
        # Set realistic headers to avoid blocks
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        })
    
    def _handle_request_errors(self, func):
        """Decorator to handle request errors"""
        def wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except requests.exceptions.RequestException as e:
                logger.error(f"Request error in {func.__name__}: {str(e)}")
                return None
            except Exception as e:
                logger.error(f"Unexpected error in {func.__name__}: {str(e)}")
                return None
        return wrapper
    
    @_handle_request_errors
    def search_by_product_code(self, product_code, limit=100, date_range=365):
        """
        Search MAUDE by product code
        
        Args:
            product_code (str): FDA product code (3-letter code)
            limit (int): Maximum number of results to return
            date_range (int): Number of days to look back
            
        Returns:
            list: List of adverse event report summaries
        """
        logger.info(f"Searching MAUDE for product code: {product_code}")
        
        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=date_range)
        
        # Format dates for MAUDE query
        start_date_str = start_date.strftime("%m/%d/%Y")
        end_date_str = end_date.strftime("%m/%d/%Y")
        
        # Construct query parameters
        search_params = {
            'productcode': product_code,
            'eventtype': 'ALL',  # ALL, DEATH, INJURY, MALFUNCTION, OTHER
            'reportdatefrom': start_date_str,
            'reportdateto': end_date_str,
            'pagenum': 1,
            'sortcolumn': 'RDate',  # Report Date
            'sortorder': 'DESC',
            'resultsperpage': min(limit, 100)  # MAUDE limits to 100 per page
        }
        
        # Send the search request
        response = self.session.get(
            MAUDE_SEARCH_URL,
            params=search_params,
            timeout=REQUEST_TIMEOUT
        )
        
        if response.status_code != 200:
            logger.error(f"Search failed with status code: {response.status_code}")
            return []
        
        # Parse the HTML response
        reports = self._parse_search_results(response.text)
        
        # Limit the number of reports
        reports = reports[:limit]
        
        logger.info(f"Found {len(reports)} MAUDE reports for product code {product_code}")
        return reports
    
    @_handle_request_errors
    def search_by_device_name(self, device_name, limit=100, date_range=365):
        """
        Search MAUDE by device name
        
        Args:
            device_name (str): Name of the medical device
            limit (int): Maximum number of results to return
            date_range (int): Number of days to look back
            
        Returns:
            list: List of adverse event report summaries
        """
        logger.info(f"Searching MAUDE for device name: {device_name}")
        
        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=date_range)
        
        # Format dates for MAUDE query
        start_date_str = start_date.strftime("%m/%d/%Y")
        end_date_str = end_date.strftime("%m/%d/%Y")
        
        # Construct query parameters
        search_params = {
            'devicename': device_name,
            'eventtype': 'ALL',
            'reportdatefrom': start_date_str,
            'reportdateto': end_date_str,
            'pagenum': 1,
            'sortcolumn': 'RDate',
            'sortorder': 'DESC',
            'resultsperpage': min(limit, 100)
        }
        
        # Send the search request
        response = self.session.get(
            MAUDE_SEARCH_URL,
            params=search_params,
            timeout=REQUEST_TIMEOUT
        )
        
        if response.status_code != 200:
            logger.error(f"Search failed with status code: {response.status_code}")
            return []
        
        # Parse the HTML response
        reports = self._parse_search_results(response.text)
        
        # Limit the number of reports
        reports = reports[:limit]
        
        logger.info(f"Found {len(reports)} MAUDE reports for device name {device_name}")
        return reports
    
    @_handle_request_errors
    def search_by_manufacturer(self, manufacturer, limit=100, date_range=365):
        """
        Search MAUDE by manufacturer name
        
        Args:
            manufacturer (str): Name of the device manufacturer
            limit (int): Maximum number of results to return
            date_range (int): Number of days to look back
            
        Returns:
            list: List of adverse event report summaries
        """
        logger.info(f"Searching MAUDE for manufacturer: {manufacturer}")
        
        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=date_range)
        
        # Format dates for MAUDE query
        start_date_str = start_date.strftime("%m/%d/%Y")
        end_date_str = end_date.strftime("%m/%d/%Y")
        
        # Construct query parameters
        search_params = {
            'mfrname': manufacturer,
            'eventtype': 'ALL',
            'reportdatefrom': start_date_str,
            'reportdateto': end_date_str,
            'pagenum': 1,
            'sortcolumn': 'RDate',
            'sortorder': 'DESC',
            'resultsperpage': min(limit, 100)
        }
        
        # Send the search request
        response = self.session.get(
            MAUDE_SEARCH_URL,
            params=search_params,
            timeout=REQUEST_TIMEOUT
        )
        
        if response.status_code != 200:
            logger.error(f"Search failed with status code: {response.status_code}")
            return []
        
        # Parse the HTML response
        reports = self._parse_search_results(response.text)
        
        # Limit the number of reports
        reports = reports[:limit]
        
        logger.info(f"Found {len(reports)} MAUDE reports for manufacturer {manufacturer}")
        return reports
    
    @_handle_request_errors
    def get_report_detail(self, report_id):
        """
        Get detailed information for a specific report
        
        Args:
            report_id (str): MAUDE report identifier
            
        Returns:
            dict: Detailed report information
        """
        logger.info(f"Fetching details for MAUDE report: {report_id}")
        
        # Construct query parameters
        params = {
            'mdrfoi__id': report_id
        }
        
        # Rate limiting
        time.sleep(REQUEST_DELAY)
        
        # Send the detail request
        response = self.session.get(
            MAUDE_DETAIL_URL,
            params=params,
            timeout=REQUEST_TIMEOUT
        )
        
        if response.status_code != 200:
            logger.error(f"Detail request failed with status code: {response.status_code}")
            return {}
        
        # Parse the HTML response
        detail = self._parse_report_detail(response.text)
        return detail
    
    def _parse_search_results(self, html_content):
        """
        Parse HTML from search results page
        
        Args:
            html_content (str): HTML content from search results page
            
        Returns:
            list: List of report dictionaries
        """
        soup = BeautifulSoup(html_content, 'html.parser')
        reports = []
        
        # Find the results table
        table = soup.find('table', {'summary': 'summary of MAUDE reports'})
        
        if not table:
            logger.warning("No results table found in the response")
            return reports
        
        # Extract table rows (skip header)
        rows = table.find_all('tr')[1:]
        
        for row in rows:
            try:
                cols = row.find_all('td')
                
                # Extract the report ID from the detail link
                detail_link = cols[0].find('a')
                if not detail_link:
                    continue
                    
                report_id = detail_link.get('href').split('mdrfoi__id=')[1].split('&')[0]
                
                # Extract other information
                report = {
                    'report_id': report_id,
                    'report_number': cols[0].text.strip(),
                    'event_type': cols[1].text.strip(),
                    'manufacturer': cols[2].text.strip(),
                    'brand_name': cols[3].text.strip(),
                    'event_date': cols[4].text.strip(),
                    'report_date': cols[5].text.strip()
                }
                
                reports.append(report)
                
            except Exception as e:
                logger.error(f"Error parsing row: {str(e)}")
                continue
        
        return reports
    
    def _parse_report_detail(self, html_content):
        """
        Parse HTML from report detail page
        
        Args:
            html_content (str): HTML content from detail page
            
        Returns:
            dict: Detailed report information
        """
        soup = BeautifulSoup(html_content, 'html.parser')
        detail = {}
        
        # Extract report sections
        sections = soup.find_all('div', {'class': 'box'})
        
        for section in sections:
            try:
                # Get section title
                title_elem = section.find('h2')
                if not title_elem:
                    continue
                    
                section_title = title_elem.text.strip()
                
                # Process each section based on its title
                if "Report Information" in section_title:
                    detail['report_info'] = self._extract_key_value_data(section)
                elif "Device Information" in section_title:
                    detail['device_info'] = self._extract_key_value_data(section)
                elif "Manufacturer Information" in section_title:
                    detail['manufacturer_info'] = self._extract_key_value_data(section)
                elif "Event Description" in section_title:
                    # Extract event narrative
                    narrative = section.find('div', {'class': 'highlight'})
                    if narrative:
                        detail['event_description'] = narrative.text.strip()
                elif "Patient Information" in section_title:
                    detail['patient_info'] = self._extract_key_value_data(section)
                
            except Exception as e:
                logger.error(f"Error parsing section: {str(e)}")
                continue
        
        return detail
    
    def _extract_key_value_data(self, section):
        """
        Extract key-value pairs from a section
        
        Args:
            section (BeautifulSoup): BeautifulSoup object for a section
            
        Returns:
            dict: Key-value data from the section
        """
        data = {}
        
        # Look for data rows
        rows = section.find_all('tr')
        
        for row in rows:
            try:
                # Extract label and value
                label_elem = row.find('th')
                value_elem = row.find('td')
                
                if not label_elem or not value_elem:
                    continue
                
                label = label_elem.text.strip().replace(':', '')
                value = value_elem.text.strip()
                
                # Add to data dictionary
                data[label] = value
                
            except Exception as e:
                logger.error(f"Error extracting key-value: {str(e)}")
                continue
        
        return data
    
    def export_search_results(self, search_params, format='csv'):
        """
        Export search results to CSV
        
        Args:
            search_params (dict): Search parameters
            format (str): Export format ('csv' or 'xml')
            
        Returns:
            str: Path to the exported file
        """
        # Add export parameters
        export_params = search_params.copy()
        export_params['format'] = format
        
        # Send export request
        response = self.session.get(
            MAUDE_EXPORT_URL,
            params=export_params,
            timeout=REQUEST_TIMEOUT
        )
        
        if response.status_code != 200:
            logger.error(f"Export failed with status code: {response.status_code}")
            return None
        
        # Create export directory if needed
        export_dir = os.path.join(os.getcwd(), 'data', 'exports')
        os.makedirs(export_dir, exist_ok=True)
        
        # Save the exported data
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        export_file = os.path.join(export_dir, f"maude_export_{timestamp}.{format}")
        
        with open(export_file, 'wb') as f:
            f.write(response.content)
        
        logger.info(f"Exported MAUDE data to {export_file}")
        return export_file

def search_maude_by_product_code(product_code, limit=100, date_range=365):
    """
    Convenience function to search MAUDE by product code
    
    Args:
        product_code (str): FDA product code
        limit (int): Maximum number of results
        date_range (int): Number of days to look back
        
    Returns:
        list: List of report summaries
    """
    client = MaudeClient()
    return client.search_by_product_code(product_code, limit, date_range)

def search_maude_by_device_name(device_name, limit=100, date_range=365):
    """
    Convenience function to search MAUDE by device name
    
    Args:
        device_name (str): Medical device name
        limit (int): Maximum number of results
        date_range (int): Number of days to look back
        
    Returns:
        list: List of report summaries
    """
    client = MaudeClient()
    return client.search_by_device_name(device_name, limit, date_range)

def search_maude_by_manufacturer(manufacturer, limit=100, date_range=365):
    """
    Convenience function to search MAUDE by manufacturer
    
    Args:
        manufacturer (str): Manufacturer name
        limit (int): Maximum number of results
        date_range (int): Number of days to look back
        
    Returns:
        list: List of report summaries
    """
    client = MaudeClient()
    return client.search_by_manufacturer(manufacturer, limit, date_range)

def get_maude_report_detail(report_id):
    """
    Convenience function to get detailed report information
    
    Args:
        report_id (str): MAUDE report ID
        
    Returns:
        dict: Detailed report information
    """
    client = MaudeClient()
    return client.get_report_detail(report_id)

def main():
    """Command line interface for testing"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Query FDA MAUDE for medical device reports")
    parser.add_argument("--product", help="Product code to search")
    parser.add_argument("--device", help="Device name to search")
    parser.add_argument("--manufacturer", help="Manufacturer name to search")
    parser.add_argument("--report", help="Get details for specific report ID")
    parser.add_argument("--limit", type=int, default=10, help="Maximum results to return")
    parser.add_argument("--days", type=int, default=365, help="Number of days to search back")
    parser.add_argument("--out", help="Output file for results (JSON)")
    
    args = parser.parse_args()
    
    # Create client
    client = MaudeClient()
    
    if args.report:
        # Get report details
        result = client.get_report_detail(args.report)
        print(f"Retrieved details for report {args.report}")
    elif args.product:
        # Search by product code
        result = client.search_by_product_code(args.product, limit=args.limit, date_range=args.days)
        print(f"Found {len(result)} results for product code {args.product}")
    elif args.device:
        # Search by device name
        result = client.search_by_device_name(args.device, limit=args.limit, date_range=args.days)
        print(f"Found {len(result)} results for device name {args.device}")
    elif args.manufacturer:
        # Search by manufacturer
        result = client.search_by_manufacturer(args.manufacturer, limit=args.limit, date_range=args.days)
        print(f"Found {len(result)} results for manufacturer {args.manufacturer}")
    else:
        parser.print_help()
        return
    
    # Save to file if requested
    if args.out and result:
        with open(args.out, 'w') as f:
            json.dump(result, f, indent=2)
        print(f"Results saved to {args.out}")
    else:
        # Print a sample of the results
        print("\nSample result:")
        print(json.dumps(result[0] if isinstance(result, list) and result else result, indent=2))

if __name__ == "__main__":
    main()