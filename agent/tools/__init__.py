"""
IND Copilot Tool Registry

This module provides a registry of tools available to the IND Copilot agent
and handles tool execution.
"""

import json
import logging
from typing import Dict, List, Any, Optional, Callable

from agent.tools.document_tools import approve_document
from agent.tools.sequence_tools import create_sequence, validate_sequence

# Configure logger
logger = logging.getLogger(__name__)

def get_available_tools() -> List[Dict[str, Any]]:
    """
    Get the list of tools available to the agent
    
    Returns:
        List of tool specifications
    """
    return [
        {
            "type": "function",
            "function": {
                "name": "approve_document",
                "description": "QC + approve a doc",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "doc_id": {
                            "type": "integer",
                            "description": "The document ID to approve"
                        }
                    },
                    "required": ["doc_id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "create_sequence",
                "description": "build eCTD sequence for region",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "region": {
                            "type": "string",
                            "enum": ["FDA", "EMA", "PMDA"],
                            "description": "The regulatory region for the sequence"
                        }
                    },
                    "required": ["region"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "validate_sequence",
                "description": "run DTD + eValidator",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "seq_id": {
                            "type": "string",
                            "description": "The sequence ID to validate"
                        }
                    },
                    "required": ["seq_id"]
                }
            }
        }
    ]

# Tool execution mapping
_TOOL_MAP = {
    "approve_document": approve_document,
    "create_sequence": create_sequence,
    "validate_sequence": validate_sequence
}

async def execute_tool(tool_name: str, arguments: Dict[str, Any]) -> str:
    """
    Execute a tool by name with the given arguments
    
    Args:
        tool_name: Name of the tool to execute
        arguments: Arguments to pass to the tool
        
    Returns:
        Tool execution result as a string
    """
    try:
        # Check if tool exists
        if tool_name not in _TOOL_MAP:
            return f"Error: Tool '{tool_name}' not found"
        
        # Execute tool
        result = await _TOOL_MAP[tool_name](**arguments)
        
        # Format result if needed
        if isinstance(result, dict) or isinstance(result, list):
            return json.dumps(result, indent=2)
        
        return str(result)
    except Exception as e:
        logger.error(f"Error executing tool {tool_name}: {str(e)}")
        return f"Error executing tool: {str(e)}"