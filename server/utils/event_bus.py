"""
Event Bus for TrialSage QC Events

This module provides an event bus implementation to facilitate communication
between different components of the application, particularly for QC events.
"""

import asyncio
import json
import logging
from typing import Dict, List, Callable, Any, Set, Optional, Union
from datetime import datetime

# Configure logging
logger = logging.getLogger(__name__)

class EventBus:
    """
    Simple in-memory event bus implementation for handling pub/sub events
    within the application. Can be replaced with Redis for a more robust
    implementation in production.
    """
    
    def __init__(self):
        """Initialize the event bus"""
        self.subscribers: Dict[str, Set[Callable]] = {}
        self.document_subscribers: Dict[str, Set[Callable]] = {}
        self.history: Dict[str, List[Dict[str, Any]]] = {}
        self.max_history = 100
    
    def subscribe(self, event_type: str, callback: Callable) -> None:
        """
        Subscribe to events of a specific type
        
        Args:
            event_type: Type of event to subscribe to
            callback: Function to call when event occurs
        """
        if event_type not in self.subscribers:
            self.subscribers[event_type] = set()
        self.subscribers[event_type].add(callback)
        logger.debug(f"Subscribed to event type: {event_type}")
    
    def unsubscribe(self, event_type: str, callback: Callable) -> None:
        """
        Unsubscribe from events of a specific type
        
        Args:
            event_type: Type of event to unsubscribe from
            callback: Function to remove from subscribers
        """
        if event_type in self.subscribers and callback in self.subscribers[event_type]:
            self.subscribers[event_type].remove(callback)
            logger.debug(f"Unsubscribed from event type: {event_type}")
    
    def subscribe_to_document(self, document_id: str, callback: Callable) -> None:
        """
        Subscribe to events for a specific document
        
        Args:
            document_id: ID of document to subscribe to
            callback: Function to call when event occurs for this document
        """
        if document_id not in self.document_subscribers:
            self.document_subscribers[document_id] = set()
        self.document_subscribers[document_id].add(callback)
        logger.debug(f"Subscribed to document: {document_id}")
        
        # Send the latest status immediately if available
        if document_id in self.history and self.history[document_id]:
            latest = self.history[document_id][-1]
            asyncio.create_task(self._notify_subscriber(callback, latest))
    
    def unsubscribe_from_document(self, document_id: str, callback: Callable) -> None:
        """
        Unsubscribe from events for a specific document
        
        Args:
            document_id: ID of document to unsubscribe from
            callback: Function to remove from subscribers
        """
        if document_id in self.document_subscribers and callback in self.document_subscribers[document_id]:
            self.document_subscribers[document_id].remove(callback)
            logger.debug(f"Unsubscribed from document: {document_id}")
    
    async def publish(self, event: Dict[str, Any]) -> None:
        """
        Publish an event to all relevant subscribers
        
        Args:
            event: Event data to publish
        """
        event_type = event.get('type')
        document_id = event.get('id')
        
        # Add timestamp if not present
        if 'timestamp' not in event:
            event['timestamp'] = datetime.utcnow().isoformat()
        
        # Store in history if it's a document event
        if document_id:
            if document_id not in self.history:
                self.history[document_id] = []
            
            self.history[document_id].append(event)
            
            # Trim history if it exceeds max length
            if len(self.history[document_id]) > self.max_history:
                self.history[document_id] = self.history[document_id][-self.max_history:]
        
        # Notify subscribers by event type
        if event_type and event_type in self.subscribers:
            for callback in list(self.subscribers[event_type]):
                try:
                    await self._notify_subscriber(callback, event)
                except Exception as e:
                    logger.error(f"Error notifying subscriber for event type {event_type}: {str(e)}")
        
        # Notify subscribers by document ID
        if document_id and document_id in self.document_subscribers:
            for callback in list(self.document_subscribers[document_id]):
                try:
                    await self._notify_subscriber(callback, event)
                except Exception as e:
                    logger.error(f"Error notifying subscriber for document {document_id}: {str(e)}")
    
    async def _notify_subscriber(self, callback: Callable, event: Dict[str, Any]) -> None:
        """Helper to notify a single subscriber with proper error handling"""
        try:
            if asyncio.iscoroutinefunction(callback):
                await callback(event)
            else:
                callback(event)
        except Exception as e:
            logger.error(f"Error in event subscriber callback: {str(e)}")
    
    def get_document_history(self, document_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get the event history for a specific document
        
        Args:
            document_id: ID of document to get history for
            limit: Maximum number of events to return (most recent first)
            
        Returns:
            List of events for the document
        """
        if document_id in self.history:
            return list(reversed(self.history[document_id]))[:limit]
        return []
    
    def get_document_status(self, document_id: str) -> Optional[Dict[str, Any]]:
        """
        Get the latest status for a specific document
        
        Args:
            document_id: ID of document to get status for
            
        Returns:
            Latest event for the document or None if no events
        """
        if document_id in self.history and self.history[document_id]:
            return self.history[document_id][-1]
        return None

# Create a singleton instance
event_bus = EventBus()