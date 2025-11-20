#!/usr/bin/env python
"""
Data Integration Module for LumenTrialGuide.AI

This module provides the ETL (Extract, Transform, Load) pipeline for integrating data 
from multiple regulatory sources into a unified database format for CER generation.

Data Sources:
- FDA FAERS (Adverse Event Reporting System)
- FDA MAUDE (Medical Device Reports)
- EU EUDAMED (European Database on Medical Devices)

The module handles data extraction, normalization, deduplication, and integration
to provide a comprehensive dataset for clinical evaluation reports.
"""

import os
import json
import logging
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Union, Tuple
import asyncio
import httpx
from bs4 import BeautifulSoup

# Import client modules
from server.faers_client import get_faers_data, search_faers_by_drug_name
from server.maude_client import search_maude_by_device_name, search_maude_by_product_code
from server.eudamed_client import search_eudamed_devices, search_eudamed_vigilance

# Import caching module
from redis_cache import cache

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("data_integration.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("data_integration")

# Constants
DEFAULT_CACHE_TTL = 86400 * 7  # 7 days in seconds
DEFAULT_DATE_RANGE = 365 * 2   # 2 years in days

class DataIntegrator:
    """
    Main class for integrating data from multiple regulatory sources
    """
    
    def __init__(self, use_cache=True, cache_ttl=DEFAULT_CACHE_TTL):
        """
        Initialize the data integrator
        
        Args:
            use_cache: Whether to use Redis caching
            cache_ttl: Cache time-to-live in seconds
        """
        self.use_cache = use_cache
        self.cache_ttl = cache_ttl
        logger.info("DataIntegrator initialized")
    
    async def fetch_all_sources(self, 
                         product_id: str, 
                         product_name: str = None,
                         manufacturer: str = None,
                         date_range: int = DEFAULT_DATE_RANGE) -> Dict[str, Any]:
        """
        Fetch data from all available sources
        
        Args:
            product_id: Product identifier (NDC or device code)
            product_name: Product name (optional)
            manufacturer: Manufacturer name (optional)
            date_range: Date range in days to look back
            
        Returns:
            Dictionary containing integrated data from all sources
        """
        # Create cache key
        cache_key = f"integrated_data:{product_id}:{product_name}:{manufacturer}:{date_range}"
        
        # Try to get from cache
        if self.use_cache:
            cached_data = cache.get(cache_key)
            if cached_data:
                logger.info(f"Cache HIT for integrated data: {cache_key}")
                return cached_data
        
        logger.info(f"Fetching integrated data for product {product_id}/{product_name}")
        
        # Initialize result dictionary
        result = {
            "product_id": product_id,
            "product_name": product_name,
            "manufacturer": manufacturer,
            "retrieval_date": datetime.now().isoformat(),
            "date_range": date_range,
            "sources": {},
            "integrated_data": {
                "adverse_events": [],
                "safety_reports": [],
                "clinical_evaluations": [],
                "summary": {}
            }
        }
        
        # Determine if this is a drug or device based on ID format
        is_drug = self._is_drug_id(product_id)
        
        # Fetch data concurrently from all sources
        tasks = []
        
        # FAERS is primarily for drugs, but can contain medical device combo products
        tasks.append(self._fetch_faers_data(product_id, product_name, date_range))
        
        # MAUDE is for medical devices
        if not is_drug or product_name:
            tasks.append(self._fetch_maude_data(product_id, product_name, manufacturer, date_range))
        
        # EUDAMED is for medical devices
        if not is_drug or product_name:
            tasks.append(self._fetch_eudamed_data(product_id, product_name, manufacturer, date_range))
        
        # Wait for all tasks to complete
        source_results = await asyncio.gather(*tasks)
        
        # Process results from each source
        for source_data in source_results:
            if source_data and source_data.get("source_name"):
                result["sources"][source_data["source_name"]] = source_data
        
        # Integrate data from all sources
        integrated_data = self._integrate_data(result["sources"])
        result["integrated_data"] = integrated_data
        
        # Generate summary statistics
        result["integrated_data"]["summary"] = self._generate_summary(integrated_data)
        
        # Cache the result
        if self.use_cache:
            cache.set(cache_key, result, ttl=self.cache_ttl)
            logger.info(f"Cached integrated data: {cache_key}, TTL: {self.cache_ttl}s")
        
        return result
    
    async def _fetch_faers_data(self, 
                         product_id: str, 
                         product_name: str = None,
                         date_range: int = DEFAULT_DATE_RANGE) -> Dict[str, Any]:
        """
        Fetch data from FAERS
        
        Args:
            product_id: NDC product code
            product_name: Product name (optional)
            date_range: Date range in days to look back
            
        Returns:
            Dictionary containing FAERS data
        """
        try:
            # Create cache key
            cache_key = f"faers_data:{product_id}:{product_name}:{date_range}"
            
            # Try to get from cache
            if self.use_cache:
                cached_data = cache.get(cache_key)
                if cached_data:
                    logger.info(f"Cache HIT for FAERS data: {cache_key}")
                    return cached_data
            
            logger.info(f"Fetching FAERS data for {product_id}/{product_name}")
            
            # Initialize result
            result = {
                "source_name": "FDA_FAERS",
                "product_id": product_id,
                "retrieval_date": datetime.now().isoformat(),
                "data": None,
                "error": None
            }
            
            # Fetch data by NDC code
            if product_id:
                faers_data = get_faers_data(product_id)
                if faers_data and faers_data.get("results"):
                    result["data"] = faers_data
            
            # If no results by NDC or no NDC provided, try by product name
            if (not result["data"] or not result["data"].get("results")) and product_name:
                faers_data = search_faers_by_drug_name(product_name)
                if faers_data and faers_data.get("results"):
                    result["data"] = faers_data
            
            # Extract and process events
            if result["data"] and result["data"].get("results"):
                result["processed_data"] = self._process_faers_data(result["data"])
            else:
                result["error"] = "No data found in FAERS"
            
            # Cache the result
            if self.use_cache:
                cache.set(cache_key, result, ttl=self.cache_ttl)
                logger.info(f"Cached FAERS data: {cache_key}, TTL: {self.cache_ttl}s")
            
            return result
            
        except Exception as e:
            logger.error(f"Error fetching FAERS data: {str(e)}")
            return {
                "source_name": "FDA_FAERS",
                "error": str(e)
            }
    
    async def _fetch_maude_data(self, 
                         product_id: str, 
                         product_name: str = None,
                         manufacturer: str = None,
                         date_range: int = DEFAULT_DATE_RANGE) -> Dict[str, Any]:
        """
        Fetch data from FDA MAUDE
        
        Args:
            product_id: Device identifier
            product_name: Device name (optional)
            manufacturer: Manufacturer name (optional)
            date_range: Date range in days to look back
            
        Returns:
            Dictionary containing MAUDE data
        """
        try:
            # Create cache key
            cache_key = f"maude_data:{product_id}:{product_name}:{manufacturer}:{date_range}"
            
            # Try to get from cache
            if self.use_cache:
                cached_data = cache.get(cache_key)
                if cached_data:
                    logger.info(f"Cache HIT for MAUDE data: {cache_key}")
                    return cached_data
            
            logger.info(f"Fetching MAUDE data for {product_id}/{product_name}")
            
            # Initialize result
            result = {
                "source_name": "FDA_MAUDE",
                "product_id": product_id,
                "retrieval_date": datetime.now().isoformat(),
                "data": None,
                "error": None
            }
            
            # Fetch data by product code
            if product_id:
                maude_data = search_maude_by_product_code(product_id, date_range=date_range)
                if maude_data and len(maude_data) > 0:
                    result["data"] = {"results": maude_data}
            
            # If no results by product code or no code provided, try by device name
            if (not result["data"] or not result["data"].get("results")) and product_name:
                maude_data = search_maude_by_device_name(product_name, date_range=date_range)
                if maude_data and len(maude_data) > 0:
                    result["data"] = {"results": maude_data}
            
            # Extract and process events
            if result["data"] and result["data"].get("results"):
                result["processed_data"] = self._process_maude_data(result["data"])
            else:
                result["error"] = "No data found in MAUDE"
            
            # Cache the result
            if self.use_cache:
                cache.set(cache_key, result, ttl=self.cache_ttl)
                logger.info(f"Cached MAUDE data: {cache_key}, TTL: {self.cache_ttl}s")
            
            return result
            
        except Exception as e:
            logger.error(f"Error fetching MAUDE data: {str(e)}")
            return {
                "source_name": "FDA_MAUDE",
                "error": str(e)
            }
    
    async def _fetch_eudamed_data(self, 
                           product_id: str, 
                           product_name: str = None,
                           manufacturer: str = None,
                           date_range: int = DEFAULT_DATE_RANGE) -> Dict[str, Any]:
        """
        Fetch data from EU EUDAMED
        
        Args:
            product_id: Device identifier
            product_name: Device name (optional)
            manufacturer: Manufacturer name (optional)
            date_range: Date range in days to look back
            
        Returns:
            Dictionary containing EUDAMED data
        """
        try:
            # Create cache key
            cache_key = f"eudamed_data:{product_id}:{product_name}:{manufacturer}:{date_range}"
            
            # Try to get from cache
            if self.use_cache:
                cached_data = cache.get(cache_key)
                if cached_data:
                    logger.info(f"Cache HIT for EUDAMED data: {cache_key}")
                    return cached_data
            
            logger.info(f"Fetching EUDAMED data for {product_id}/{product_name}")
            
            # Initialize result
            result = {
                "source_name": "EU_EUDAMED",
                "product_id": product_id,
                "retrieval_date": datetime.now().isoformat(),
                "data": None,
                "error": None
            }
            
            # Fetch device data
            eudamed_devices = []
            if product_name:
                devices = search_eudamed_devices(product_name)
                if devices and len(devices) > 0:
                    eudamed_devices.extend(devices)
            
            if manufacturer and not eudamed_devices:
                devices = search_eudamed_devices(manufacturer)
                if devices and len(devices) > 0:
                    eudamed_devices.extend(devices)
            
            # Fetch vigilance data
            vigilance_data = []
            if eudamed_devices:
                # Use the first device ID found
                device_id = eudamed_devices[0].get("id")
                if device_id:
                    vigilance = search_eudamed_vigilance(device_id=device_id, date_range=date_range)
                    if vigilance and len(vigilance) > 0:
                        vigilance_data.extend(vigilance)
            
            if manufacturer and not vigilance_data:
                vigilance = search_eudamed_vigilance(manufacturer=manufacturer, date_range=date_range)
                if vigilance and len(vigilance) > 0:
                    vigilance_data.extend(vigilance)
            
            # Combine device and vigilance data
            if eudamed_devices or vigilance_data:
                result["data"] = {
                    "devices": eudamed_devices,
                    "vigilance": vigilance_data
                }
                result["processed_data"] = self._process_eudamed_data(result["data"])
            else:
                result["error"] = "No data found in EUDAMED"
            
            # Cache the result
            if self.use_cache:
                cache.set(cache_key, result, ttl=self.cache_ttl)
                logger.info(f"Cached EUDAMED data: {cache_key}, TTL: {self.cache_ttl}s")
            
            return result
            
        except Exception as e:
            logger.error(f"Error fetching EUDAMED data: {str(e)}")
            return {
                "source_name": "EU_EUDAMED",
                "error": str(e)
            }
    
    def _process_faers_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process and normalize FAERS data
        
        Args:
            data: Raw FAERS data
            
        Returns:
            Processed and normalized FAERS data
        """
        processed = {
            "adverse_events": [],
            "metadata": {
                "total_reports": len(data.get("results", [])),
                "data_period": self._extract_data_period(data)
            }
        }
        
        # Extract product details
        if data.get("results") and len(data["results"]) > 0:
            first_result = data["results"][0]
            if "openfda" in first_result:
                openfda = first_result["openfda"]
                processed["product_details"] = {
                    "brand_name": openfda.get("brand_name", ["Unknown"])[0] if openfda.get("brand_name") else "Unknown",
                    "generic_name": openfda.get("generic_name", ["Unknown"])[0] if openfda.get("generic_name") else "Unknown",
                    "manufacturer": openfda.get("manufacturer_name", ["Unknown"])[0] if openfda.get("manufacturer_name") else "Unknown",
                    "product_ndc": openfda.get("product_ndc", ["Unknown"])[0] if openfda.get("product_ndc") else "Unknown"
                }
        
        # Extract and normalize adverse events
        event_counts = {}
        serious_events = []
        
        for result in data.get("results", []):
            if "patient" in result and "reaction" in result["patient"]:
                for reaction in result["patient"]["reaction"]:
                    if "reactionmeddrapt" in reaction:
                        event_name = reaction["reactionmeddrapt"]
                        event_counts[event_name] = event_counts.get(event_name, 0) + 1
                        
                        # Check if serious (based on terminology)
                        is_serious = self._is_serious_event(event_name)
                        
                        # Create standardized event object
                        event = {
                            "event_name": event_name,
                            "source": "FDA_FAERS",
                            "date": result.get("receivedate", "Unknown"),
                            "is_serious": is_serious,
                            "source_id": result.get("safetyreportid", "Unknown")
                        }
                        
                        processed["adverse_events"].append(event)
                        
                        if is_serious and event_name not in serious_events:
                            serious_events.append(event_name)
        
        # Add summary metrics
        processed["metadata"]["unique_events"] = len(event_counts)
        processed["metadata"]["serious_events"] = len(serious_events)
        processed["metadata"]["event_counts"] = dict(sorted(
            event_counts.items(), 
            key=lambda x: x[1], 
            reverse=True
        ))
        
        return processed
    
    def _process_maude_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process and normalize MAUDE data
        
        Args:
            data: Raw MAUDE data
            
        Returns:
            Processed and normalized MAUDE data
        """
        processed = {
            "adverse_events": [],
            "metadata": {
                "total_reports": len(data.get("results", [])),
                "data_period": "Unknown"  # MAUDE doesn't provide a consistent data period
            }
        }
        
        # Extract device details
        if data.get("results") and len(data["results"]) > 0:
            first_result = data["results"][0]
            processed["device_details"] = {
                "brand_name": first_result.get("brand_name", "Unknown"),
                "manufacturer": first_result.get("manufacturer", "Unknown")
            }
        
        # Extract and normalize adverse events
        event_counts = {}
        event_types = {}
        
        for result in data.get("results", []):
            event_type = result.get("event_type", "Unknown")
            event_types[event_type] = event_types.get(event_type, 0) + 1
            
            # Create standardized event object
            event = {
                "event_name": event_type,
                "source": "FDA_MAUDE",
                "date": result.get("report_date", "Unknown"),
                "is_serious": event_type in ["Death", "Injury"],
                "source_id": result.get("report_id", "Unknown"),
                "device_name": result.get("brand_name", "Unknown"),
                "manufacturer": result.get("manufacturer", "Unknown")
            }
            
            processed["adverse_events"].append(event)
            event_counts[event_type] = event_counts.get(event_type, 0) + 1
        
        # Add summary metrics
        processed["metadata"]["event_types"] = event_types
        processed["metadata"]["event_counts"] = dict(sorted(
            event_counts.items(), 
            key=lambda x: x[1], 
            reverse=True
        ))
        
        return processed
    
    def _process_eudamed_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process and normalize EUDAMED data
        
        Args:
            data: Raw EUDAMED data
            
        Returns:
            Processed and normalized EUDAMED data
        """
        processed = {
            "adverse_events": [],
            "devices": [],
            "metadata": {
                "total_vigilance_reports": len(data.get("vigilance", [])),
                "total_devices": len(data.get("devices", []))
            }
        }
        
        # Process device data
        for device in data.get("devices", []):
            processed_device = {
                "device_id": device.get("id", "Unknown"),
                "name": device.get("name", "Unknown"),
                "manufacturer": device.get("manufacturer", "Unknown"),
                "source": "EU_EUDAMED"
            }
            processed["devices"].append(processed_device)
        
        # Process vigilance data
        event_counts = {}
        
        for report in data.get("vigilance", []):
            event_type = report.get("type", "Unknown")
            
            # Create standardized event object
            event = {
                "event_name": report.get("title", "Unknown vigilance report"),
                "source": "EU_EUDAMED",
                "date": report.get("date", "Unknown"),
                "is_serious": True,  # EUDAMED vigilance reports are typically serious
                "source_id": report.get("id", "Unknown"),
                "device_id": report.get("device_id", "Unknown"),
                "event_type": event_type
            }
            
            processed["adverse_events"].append(event)
            event_counts[event_type] = event_counts.get(event_type, 0) + 1
        
        # Add summary metrics
        processed["metadata"]["event_counts"] = dict(sorted(
            event_counts.items(), 
            key=lambda x: x[1], 
            reverse=True
        ))
        
        return processed
    
    def _integrate_data(self, sources: Dict[str, Any]) -> Dict[str, Any]:
        """
        Integrate data from multiple sources
        
        Args:
            sources: Dictionary of data from different sources
            
        Returns:
            Integrated and normalized data
        """
        integrated = {
            "adverse_events": [],
            "safety_reports": [],
            "devices": [],
            "summary": {},
            "product_details": {}
        }
        
        # Collect all adverse events
        for source_name, source_data in sources.items():
            if source_data.get("processed_data"):
                # Add adverse events
                if source_data["processed_data"].get("adverse_events"):
                    integrated["adverse_events"].extend(source_data["processed_data"]["adverse_events"])
                
                # Add devices (from EUDAMED)
                if source_data["processed_data"].get("devices"):
                    integrated["devices"].extend(source_data["processed_data"]["devices"])
                
                # Merge product details
                if source_data["processed_data"].get("product_details"):
                    integrated["product_details"].update(source_data["processed_data"]["product_details"])
                elif source_data["processed_data"].get("device_details"):
                    integrated["product_details"].update(source_data["processed_data"]["device_details"])
        
        # Deduplicate adverse events
        integrated["adverse_events"] = self._deduplicate_events(integrated["adverse_events"])
        
        # Generate safety reports
        integrated["safety_reports"] = self._generate_safety_reports(integrated["adverse_events"])
        
        return integrated
    
    def _deduplicate_events(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Deduplicate adverse events from multiple sources
        
        Args:
            events: List of adverse events
            
        Returns:
            Deduplicated list of events
        """
        # Track seen event combinations
        seen_events = set()
        deduplicated = []
        
        for event in events:
            # Create a unique identifier for this event
            event_key = f"{event['source']}:{event['source_id']}:{event['event_name']}"
            
            if event_key not in seen_events:
                seen_events.add(event_key)
                deduplicated.append(event)
        
        return deduplicated
    
    def _generate_safety_reports(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Generate safety reports from adverse events
        
        Args:
            events: List of adverse events
            
        Returns:
            List of safety reports
        """
        # Group events by source and source_id
        grouped_events = {}
        
        for event in events:
            key = f"{event['source']}:{event['source_id']}"
            if key not in grouped_events:
                grouped_events[key] = {
                    "source": event["source"],
                    "source_id": event["source_id"],
                    "date": event["date"],
                    "events": []
                }
            
            # Add this event to the report
            grouped_events[key]["events"].append({
                "event_name": event["event_name"],
                "is_serious": event["is_serious"]
            })
            
            # Set is_serious flag for the report if any event is serious
            if event["is_serious"]:
                grouped_events[key]["is_serious"] = True
        
        # Convert to list
        return list(grouped_events.values())
    
    def _generate_summary(self, integrated_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Generate summary statistics from integrated data
        
        Args:
            integrated_data: Integrated data from all sources
            
        Returns:
            Summary statistics
        """
        summary = {
            "total_events": len(integrated_data["adverse_events"]),
            "total_reports": len(integrated_data["safety_reports"]),
            "total_devices": len(integrated_data["devices"]),
            "serious_events": 0,
            "sources_represented": set(),
            "top_events": [],
            "event_by_source": {}
        }
        
        # Count serious events
        for event in integrated_data["adverse_events"]:
            if event["is_serious"]:
                summary["serious_events"] += 1
            
            # Track sources
            summary["sources_represented"].add(event["source"])
            
            # Count by source
            if event["source"] not in summary["event_by_source"]:
                summary["event_by_source"][event["source"]] = 0
            summary["event_by_source"][event["source"]] += 1
        
        # Count events by name
        event_counts = {}
        for event in integrated_data["adverse_events"]:
            event_name = event["event_name"]
            if event_name not in event_counts:
                event_counts[event_name] = 0
            event_counts[event_name] += 1
        
        # Get top events
        top_events = sorted(event_counts.items(), key=lambda x: x[1], reverse=True)[:10]
        summary["top_events"] = [{"name": name, "count": count} for name, count in top_events]
        
        # Convert set to list for JSON serialization
        summary["sources_represented"] = list(summary["sources_represented"])
        
        return summary
    
    def _extract_data_period(self, data: Dict[str, Any]) -> str:
        """
        Extract the data period from FAERS data
        
        Args:
            data: FAERS data
            
        Returns:
            String describing the data period
        """
        if not data.get("results"):
            return "Unknown"
        
        # Try to extract dates
        dates = []
        for result in data["results"]:
            if "receivedate" in result:
                try:
                    dates.append(datetime.strptime(result["receivedate"], "%Y%m%d"))
                except (ValueError, TypeError):
                    pass
        
        if not dates:
            return "Unknown"
        
        # Format date range
        min_date = min(dates).strftime("%Y-%m-%d")
        max_date = max(dates).strftime("%Y-%m-%d")
        
        return f"{min_date} to {max_date}"
    
    def _is_drug_id(self, product_id: str) -> bool:
        """
        Determine if a product ID is likely a drug (NDC) or device
        
        Args:
            product_id: Product identifier
            
        Returns:
            True if likely a drug, False if likely a device
        """
        # NDC codes are typically 10-11 digits with hyphens
        if not product_id:
            return False
        
        # Remove hyphens and check if numeric
        clean_id = product_id.replace("-", "")
        if clean_id.isdigit() and (len(clean_id) == 10 or len(clean_id) == 11):
            return True
        
        # Otherwise, assume it's a device code
        return False
    
    def _is_serious_event(self, event_name: str) -> bool:
        """
        Determine if an adverse event is serious based on terminology
        
        Args:
            event_name: Name of the adverse event
            
        Returns:
            True if the event is serious, False otherwise
        """
        serious_terms = [
            "death", "fatal", "mortality", "died",
            "hospitali", "life threatening", "life-threatening",
            "disability", "disabling",
            "congenital", "birth defect", "anomaly",
            "required intervention", "intervention to prevent",
            "shock", "anaphylaxis", "anaphylactic",
            "seizure", "cancer", "malignant", "neoplasm",
            "myocardial infarction", "heart attack", "cardiac arrest",
            "stroke", "cerebrovascular", "pulmonary embolism",
            "renal failure", "hepatic failure", "liver failure",
            "multiple organ", "coma", "sepsis", "septic"
        ]
        
        event_lower = event_name.lower()
        return any(term in event_lower for term in serious_terms)


async def fetch_integrated_data(
    product_id: str,
    product_name: str = None,
    manufacturer: str = None,
    date_range: int = DEFAULT_DATE_RANGE,
    use_cache: bool = True
) -> Dict[str, Any]:
    """
    Convenience function to fetch integrated data from all sources
    
    Args:
        product_id: Product identifier (NDC or device code)
        product_name: Product name (optional)
        manufacturer: Manufacturer name (optional)
        date_range: Date range in days to look back
        use_cache: Whether to use caching
        
    Returns:
        Dictionary containing integrated data from all sources
    """
    integrator = DataIntegrator(use_cache=use_cache)
    return await integrator.fetch_all_sources(
        product_id=product_id,
        product_name=product_name,
        manufacturer=manufacturer,
        date_range=date_range
    )

async def main():
    """
    Command line interface for testing
    """
    import argparse
    
    parser = argparse.ArgumentParser(description="Fetch integrated regulatory data")
    parser.add_argument("--id", help="Product ID (NDC or device code)")
    parser.add_argument("--name", help="Product name")
    parser.add_argument("--manufacturer", help="Manufacturer name")
    parser.add_argument("--days", type=int, default=DEFAULT_DATE_RANGE, help="Date range in days")
    parser.add_argument("--no-cache", action="store_true", help="Disable caching")
    parser.add_argument("--out", help="Output file for results (JSON)")
    
    args = parser.parse_args()
    
    if not args.id and not args.name:
        parser.print_help()
        return
    
    result = await fetch_integrated_data(
        product_id=args.id or "",
        product_name=args.name,
        manufacturer=args.manufacturer,
        date_range=args.days,
        use_cache=not args.no_cache
    )
    
    # Print summary
    print(f"\nIntegrated data summary:")
    print(f"Total events: {result['integrated_data']['summary'].get('total_events', 0)}")
    print(f"Serious events: {result['integrated_data']['summary'].get('serious_events', 0)}")
    print(f"Total reports: {result['integrated_data']['summary'].get('total_reports', 0)}")
    print(f"Sources: {', '.join(result['integrated_data']['summary'].get('sources_represented', []))}")
    
    # Top events
    print("\nTop adverse events:")
    for event in result['integrated_data']['summary'].get('top_events', [])[:5]:
        print(f"  {event['name']}: {event['count']} reports")
    
    # Save to file if requested
    if args.out:
        with open(args.out, 'w') as f:
            json.dump(result, f, indent=2)
        print(f"\nResults saved to {args.out}")

if __name__ == "__main__":
    asyncio.run(main())