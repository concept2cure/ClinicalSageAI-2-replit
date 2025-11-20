"""
Agent Chat API

This module provides FastAPI endpoints for chatting with the IND Copilot agent,
including both HTTP and WebSocket endpoints.
"""

import json
import uuid
import logging
from typing import Dict, List, Optional, Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agent.core import process_chat

# Configure logger
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agent", tags=["agent"])

class ChatRequest(BaseModel):
    """
    Request model for chat messages
    """
    message: str
    conversation_id: Optional[str] = None
    project_id: Optional[int] = None

class ChatResponse(BaseModel):
    """
    Response model for chat
    """
    conversation_id: str
    message: str
    tool_calls: Optional[List[Dict[str, Any]]] = None

@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Process a chat message (HTTP endpoint - non-streaming)
    
    Args:
        request: Chat request containing message and optional context
        
    Returns:
        Chat response
    """
    # Generate conversation ID if not provided
    conversation_id = request.conversation_id or str(uuid.uuid4())
    
    full_response = ""
    tool_calls = []
    
    async for chunk in process_chat(
        user_message=request.message,
        conversation_id=conversation_id,
        project_id=request.project_id
    ):
        if chunk.get("type") == "message":
            full_response += chunk.get("content", "")
        elif chunk.get("type") == "tool_call":
            tool_calls.append({
                "tool_name": chunk.get("tool_name"),
                "tool_args": chunk.get("tool_args")
            })
    
    return ChatResponse(
        conversation_id=conversation_id,
        message=full_response,
        tool_calls=tool_calls if tool_calls else None
    )

@router.get("/chat/stream")
async def chat_stream(
    message: str,
    conversation_id: Optional[str] = None,
    project_id: Optional[int] = None
):
    """
    Process a chat message with streaming response
    
    Args:
        message: User message
        conversation_id: Optional conversation identifier
        project_id: Optional project identifier
        
    Returns:
        Streaming response with chat messages
    """
    # Generate conversation ID if not provided
    conversation_id = conversation_id or str(uuid.uuid4())
    
    async def stream_generator():
        try:
            async for chunk in process_chat(
                user_message=message,
                conversation_id=conversation_id,
                project_id=project_id
            ):
                yield f"data: {json.dumps(chunk)}\n\n"
        except Exception as e:
            logger.error(f"Error in chat stream: {str(e)}")
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
        
        # Send end of stream marker
        yield f"data: {json.dumps({'type': 'end'})}\n\n"
    
    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream"
    )

@router.websocket("/ws/chat")
async def chat_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for chat
    
    Args:
        websocket: WebSocket connection
    """
    await websocket.accept()
    
    try:
        # Wait for initial connection message
        connection_data = await websocket.receive_json()
        conversation_id = connection_data.get("conversation_id") or str(uuid.uuid4())
        project_id = connection_data.get("project_id")
        
        # Send connection acknowledgment
        await websocket.send_json({
            "type": "connected",
            "conversation_id": conversation_id
        })
        
        # Chat loop
        while True:
            # Wait for message
            data = await websocket.receive_json()
            message = data.get("message", "")
            
            if not message:
                await websocket.send_json({
                    "type": "error",
                    "content": "Message cannot be empty"
                })
                continue
            
            # Process chat
            async for chunk in process_chat(
                user_message=message,
                conversation_id=conversation_id,
                project_id=project_id
            ):
                await websocket.send_json(chunk)
            
    except WebSocketDisconnect:
        logger.info(f"Client disconnected from chat WebSocket")
    except Exception as e:
        logger.error(f"Error in chat WebSocket: {str(e)}")
        try:
            await websocket.send_json({
                "type": "error",
                "content": f"An error occurred: {str(e)}"
            })
        except:
            pass