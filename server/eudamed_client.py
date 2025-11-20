#!/usr/bin/env python
"""
EUDAMED Client for LumenTrialGuide.AI

This module provides functions to query the European Database on Medical Devices (EUDAMED)
for medical device information, vigilance data, and clinical evaluations.

Reference: https://ec.europa.eu/tools/eudamed/eudamed
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
        logging.FileHandler("eudamed_client.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("eudamed_client")

# EUDAMED URLs - public access points
EUDAMED_BASE_URL = "https://ec.europa.eu/tools/eudamed"
EUDAMED_SEARCH_URL = f"{EUDAMED_BASE_URL}/api/search"
EUDAMED_DEVICE_URL = f"{EUDAMED_BASE_URL}/api/devices"
EUDAMED_UDI_URL = f"{EUDAMED_BASE_URL}/api/udi"
EUDAMED_VIGILANCE_URL = f"{EUDAMED_BASE_URL}/api/vigilance"

# Rate limit management
REQUEST_DELAY = 2.0  # seconds between requests
REQUEST_TIMEOUT = 30  # seconds before request timeout

class EudamedClient:
    """Client for accessing EUDAMED data"""
    
    def __init__(self):
        """Initialize the EUDAMED client"""
        self.session = requests.Session()
        # Set realistic headers to avoid blocks
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
            'Referer': EUDAMED_BASE_URL,
            'Origin': 'https://ec.europa.eu',
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
    def search_devices(self, query, limit=50):
        """
        Search for medical devices in EUDAMED
        
        Args:
            query (str): Search query (device name, manufacturer, etc.)
            limit (int): Maximum number of results to return
            
        Returns:
            list: List of device records
        """
        logger.info(f"Searching EUDAMED for devices: {query}")
        
        # Construct search parameters
        params = {
            'q': query,
            'limit': min(limit, 100),  # Cap at 100 per request
            'entity': 'device',
            'lang': 'en'
        }
        
        # Send the search request
        response = self.session.get(
            EUDAMED_SEARCH_URL,
            params=params,
            timeout=REQUEST_TIMEOUT
        )
        
        if response.status_code != 200:
            logger.error(f"Search failed with status code: {response.status_code}")
            return []
        
        try:
            data = response.json()
            results = data.get('results', [])
            
            logger.info(f"Found {len(results)} device results for query: {query}")
            return results[:limit]
            
        except json.JSONDecodeError:
            logger.error("Failed to decode JSON response")
            # If API doesn't return JSON, try parsing the HTML
            return self._parse_html_search_results(response.text, limit)
    
    @_handle_request_errors
    def search_by_manufacturer(self, manufacturer, limit=50):
        """
        Search for devices by manufacturer name
        
        Args:
            manufacturer (str): Manufacturer name
            limit (int): Maximum number of results to return
            
        Returns:
            list: List of device records
        """
        logger.info(f"Searching EUDAMED for manufacturer: {manufacturer}")
        
        # Construct search parameters
        params = {
            'manufacturer': manufacturer,
            'limit': min(limit, 100),
            'lang': 'en'
        }
        
        # Send the search request
        response = self.session.get(
            EUDAMED_SEARCH_URL,
            params=params,
            timeout=REQUEST_TIMEOUT
        )
        
        if response.status_code != 200:
            logger.error(f"Search failed with status code: {response.status_code}")
            return []
        
        try:
            data = response.json()
            results = data.get('results', [])
            
            logger.info(f"Found {len(results)} results for manufacturer: {manufacturer}")
            return results[:limit]
            
        except json.JSONDecodeError:
            logger.error("Failed to decode JSON response")
            return self._parse_html_search_results(response.text, limit)
    
    @_handle_request_errors
    def get_device_details(self, device_id):
        """
        Get detailed information for a specific device
        
        Args:
            device_id (str): EUDAMED device identifier
            
        Returns:
            dict: Detailed device information
        """
        logger.info(f"Fetching details for device: {device_id}")
        
        # Send the detail request
        response = self.session.get(
            f"{EUDAMED_DEVICE_URL}/{device_id}",
            timeout=REQUEST_TIMEOUT
        )
        
        if response.status_code != 200:
            logger.error(f"Detail request failed with status code: {response.status_code}")
            return {}
        
        try:
            data = response.json()
            return data
            
        except json.JSONDecodeError:
            logger.error("Failed to decode JSON response")
            return self._parse_html_device_details(response.text)
    
    @_handle_request_errors
    def search_vigilance_data(self, device_id=None, manufacturer=None, date_range=365, limit=50):
        """
        Search for vigilance (safety) data
        
        Args:
            device_id (str): Device ID (optional)
            manufacturer (str): Manufacturer name (optional)
            date_range (int): Number of days to look back
            limit (int): Maximum number of results to return
            
        Returns:
            list: List of vigilance reports
        """
        if not device_id and not manufacturer:
            logger.error("Either device_id or manufacturer must be provided")
            return []
            
        logger.info(f"Searching EUDAMED vigilance data for {'device ' + device_id if device_id else 'manufacturer ' + manufacturer}")
        
        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=date_range)
        
        # Format dates
        start_date_str = start_date.strftime("%Y-%m-%d")
        end_date_str = end_date.strftime("%Y-%m-%d")
        
        # Construct search parameters
        params = {
            'startDate': start_date_str,
            'endDate': end_date_str,
            'limit': min(limit, 100),
            'lang': 'en'
        }
        
        if device_id:
            params['deviceId'] = device_id
        
        if manufacturer:
            params['manufacturer'] = manufacturer
        
        # Send the search request
        response = self.session.get(
            EUDAMED_VIGILANCE_URL,
            params=params,
            timeout=REQUEST_TIMEOUT
        )
        
        if response.status_code != 200:
            logger.error(f"Vigilance search failed with status code: {response.status_code}")
            return []
        
        try:
            data = response.json()
            results = data.get('reports', [])
            
            logger.info(f"Found {len(results)} vigilance reports")
            return results[:limit]
            
        except json.JSONDecodeError:
            logger.error("Failed to decode JSON response")
            # If API doesn't return JSON, try parsing the HTML
            return self._extract_vigilance_data_html(response.text, limit)
    
    @_handle_request_errors
    def get_vigilance_report(self, report_id):
        """
        Get a specific vigilance report
        
        Args:
            report_id (str): Report identifier
            
        Returns:
            dict: Vigilance report details
        """
        logger.info(f"Fetching vigilance report: {report_id}")
        
        # Send the detail request
        response = self.session.get(
            f"{EUDAMED_VIGILANCE_URL}/{report_id}",
            timeout=REQUEST_TIMEOUT
        )
        
        if response.status_code != 200:
            logger.error(f"Report request failed with status code: {response.status_code}")
            return {}
        
        try:
            data = response.json()
            return data
            
        except json.JSONDecodeError:
            logger.error("Failed to decode JSON response")
            return self._parse_html_vigilance_report(response.text)
    
    def _parse_html_search_results(self, html_content, limit):
        """
        Extract device information from HTML when API fails
        
        Args:
            html_content (str): HTML content
            limit (int): Maximum number of results
            
        Returns:
            list: List of device dictionaries
        """
        results = []
        soup = BeautifulSoup(html_content, 'html.parser')
        
        try:
            # Look for device listings
            device_elements = soup.select('.device-listing .device-item')
            
            for device in device_elements[:limit]:
                try:
                    # Extract basic info
                    name_elem = device.select_one('.device-name')
                    manufacturer_elem = device.select_one('.manufacturer')
                    id_elem = device.select_one('[data-device-id]')
                    
                    device_info = {
                        'id': id_elem['data-device-id'] if id_elem else None,
                        'name': name_elem.text.strip() if name_elem else 'Unknown Device',
                        'manufacturer': manufacturer_elem.text.strip() if manufacturer_elem else 'Unknown Manufacturer',
                    }
                    
                    results.append(device_info)
                    
                except Exception as e:
                    logger.error(f"Error parsing device element: {str(e)}")
            
            return results
            
        except Exception as e:
            logger.error(f"Error parsing HTML search results: {str(e)}")
            return []
    
    def _parse_html_device_details(self, html_content):
        """
        Extract device details from HTML when API fails
        
        Args:
            html_content (str): HTML content
            
        Returns:
            dict: Device details
        """
        device_details = {}
        soup = BeautifulSoup(html_content, 'html.parser')
        
        try:
            # Extract device name
            name_elem = soup.select_one('.device-header h1')
            if name_elem:
                device_details['name'] = name_elem.text.strip()
            
            # Extract manufacturer
            manufacturer_elem = soup.select_one('.manufacturer-info .name')
            if manufacturer_elem:
                device_details['manufacturer'] = manufacturer_elem.text.strip()
            
            # Extract basic details
            detail_rows = soup.select('.device-details .detail-row')
            for row in detail_rows:
                label_elem = row.select_one('.label')
                value_elem = row.select_one('.value')
                
                if label_elem and value_elem:
                    key = label_elem.text.strip().lower().replace(' ', '_')
                    value = value_elem.text.strip()
                    device_details[key] = value
            
            return device_details
            
        except Exception as e:
            logger.error(f"Error parsing HTML device details: {str(e)}")
            return {}
    
    def _extract_vigilance_data_html(self, html_content, limit):
        """
        Extract vigilance data from HTML when API fails
        
        Args:
            html_content (str): HTML content
            limit (int): Maximum number of results
            
        Returns:
            list: List of vigilance report dictionaries
        """
        reports = []
        soup = BeautifulSoup(html_content, 'html.parser')
        
        try:
            # Look for report listings
            report_elements = soup.select('.vigilance-reports .report-item')
            
            for report in report_elements[:limit]:
                try:
                    # Extract basic info
                    title_elem = report.select_one('.report-title')
                    date_elem = report.select_one('.report-date')
                    id_elem = report.select_one('[data-report-id]')
                    type_elem = report.select_one('.report-type')
                    
                    report_info = {
                        'id': id_elem['data-report-id'] if id_elem else None,
                        'title': title_elem.text.strip() if title_elem else 'Unknown Report',
                        'date': date_elem.text.strip() if date_elem else None,
                        'type': type_elem.text.strip() if type_elem else None,
                    }
                    
                    reports.append(report_info)
                    
                except Exception as e:
                    logger.error(f"Error parsing report element: {str(e)}")
            
            return reports
            
        except Exception as e:
            logger.error(f"Error parsing HTML vigilance reports: {str(e)}")
            return []
    
    def _parse_html_vigilance_report(self, html_content):
        """
        Extract vigilance report details from HTML when API fails
        
        Args:
            html_content (str): HTML content
            
        Returns:
            dict: Vigilance report details
        """
        report_details = {}
        soup = BeautifulSoup(html_content, 'html.parser')
        
        try:
            # Extract report title
            title_elem = soup.select_one('.report-header h1')
            if title_elem:
                report_details['title'] = title_elem.text.strip()
            
            # Extract manufacturer
            manufacturer_elem = soup.select_one('.manufacturer-info .name')
            if manufacturer_elem:
                report_details['manufacturer'] = manufacturer_elem.text.strip()
            
            # Extract incident details
            incident_elem = soup.select_one('.incident-description')
            if incident_elem:
                report_details['incident_description'] = incident_elem.text.strip()
            
            # Extract basic details
            detail_rows = soup.select('.report-details .detail-row')
            for row in detail_rows:
                label_elem = row.select_one('.label')
                value_elem = row.select_one('.value')
                
                if label_elem and value_elem:
                    key = label_elem.text.strip().lower().replace(' ', '_')
                    value = value_elem.text.strip()
                    report_details[key] = value
            
            return report_details
            
        except Exception as e:
            logger.error(f"Error parsing HTML vigilance report: {str(e)}")
            return {}

def search_eudamed_devices(query, limit=50):
    """
    Convenience function to search for devices in EUDAMED
    
    Args:
        query (str): Search query
        limit (int): Maximum number of results
        
    Returns:
        list: List of device records
    """
    client = EudamedClient()
    return client.search_devices(query, limit)

def search_eudamed_by_manufacturer(manufacturer, limit=50):
    """
    Convenience function to search for devices by manufacturer
    
    Args:
        manufacturer (str): Manufacturer name
        limit (int): Maximum number of results
        
    Returns:
        list: List of device records
    """
    client = EudamedClient()
    return client.search_by_manufacturer(manufacturer, limit)

def get_eudamed_device_details(device_id):
    """
    Convenience function to get device details
    
    Args:
        device_id (str): Device ID
        
    Returns:
        dict: Device details
    """
    client = EudamedClient()
    return client.get_device_details(device_id)

def search_eudamed_vigilance(device_id=None, manufacturer=None, date_range=365, limit=50):
    """
    Convenience function to search for vigilance data
    
    Args:
        device_id (str): Device ID (optional)
        manufacturer (str): Manufacturer name (optional)
        date_range (int): Number of days to look back
        limit (int): Maximum number of results
        
    Returns:
        list: List of vigilance reports
    """
    client = EudamedClient()
    return client.search_vigilance_data(device_id, manufacturer, date_range, limit)

def main():
    """Command line interface for testing"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Query EUDAMED for medical device data")
    parser.add_argument("--search", help="Search query for devices")
    parser.add_argument("--manufacturer", help="Search for devices by manufacturer")
    parser.add_argument("--device", help="Device ID to get details")
    parser.add_argument("--vigilance", help="Device ID or manufacturer to search vigilance data")
    parser.add_argument("--limit", type=int, default=10, help="Maximum results to return")
    parser.add_argument("--days", type=int, default=365, help="Number of days to search back (for vigilance)")
    parser.add_argument("--out", help="Output file for results (JSON)")
    
    args = parser.parse_args()
    
    # Create client
    client = EudamedClient()
    
    if args.search:
        # Search devices
        result = client.search_devices(args.search, args.limit)
        print(f"Found {len(result)} devices matching '{args.search}'")
    elif args.manufacturer:
        # Search by manufacturer
        result = client.search_by_manufacturer(args.manufacturer, args.limit)
        print(f"Found {len(result)} devices for manufacturer '{args.manufacturer}'")
    elif args.device:
        # Get device details
        result = client.get_device_details(args.device)
        print(f"Retrieved details for device {args.device}")
    elif args.vigilance:
        # Search vigilance data
        if len(args.vigilance) > 10:  # Assume it's a device ID if longer
            result = client.search_vigilance_data(device_id=args.vigilance, date_range=args.days, limit=args.limit)
        else:
            result = client.search_vigilance_data(manufacturer=args.vigilance, date_range=args.days, limit=args.limit)
        print(f"Found {len(result)} vigilance reports")
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