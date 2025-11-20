"""
IND Copilot Agent Core

This module provides the core functionality for the IND Copilot agent, 
which assists users with regulatory document management and submission workflows.
"""

import json
import logging
import os
from datetime import datetime
from typing import Dict, List, Any, Optional, Callable, AsyncGenerator

import openai
from openai.types.chat import ChatCompletionMessage, ChatCompletionMessageParam

from agent.tools import get_available_tools, execute_tool
from agent.memory import add_to_memory, retrieve_from_memory

# Configure logger
logger = logging.getLogger(__name__)

# Initialize OpenAI client
openai_client = openai.AsyncOpenAI(
    api_key=os.environ.get("OPENAI_API_KEY")
)

# System prompt for the agent
SYSTEM_PROMPT = """
You are the IND Copilot, an expert regulatory affairs assistant that helps pharmaceutical teams navigate IND submissions.

Your capabilities:
- Answering questions about FDA regulations and submission requirements
- Running quality control checks on documents
- Creating and validating eCTD sequences
- Providing guidance on regulatory strategy

When answering questions:
- Be concise and clear, focusing on regulatory accuracy
- Provide specific citations to FDA guidance when possible
- If uncertain, acknowledge limitations rather than speculating

You have access to tools for document processing and sequence creation. Use them when appropriate.
"""

async def create_chat_completion(
    messages: List[ChatCompletionMessageParam],
    tools: Optional[List[Dict[str, Any]]] = None,
    stream: bool = True,
    model: str = "gpt-4o",  # the newest OpenAI model is "gpt-4o" which was released May 13, 2024
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Create a chat completion with the OpenAI API
    
    Args:
        messages: List of message objects
        tools: List of tools available to the model
        stream: Whether to stream the response
        model: Model to use
        
    Yields:
        Dict containing response chunk information
    """
    try:
        response = await openai_client.chat.completions.create(
            model=model,
            messages=messages,
            tools=tools,
            stream=stream
        )
        
        if stream:
            async for chunk in response:
                yield {
                    "type": "chunk",
                    "content": chunk.choices[0].delta.content if chunk.choices[0].delta.content else "",
                    "tool_calls": chunk.choices[0].delta.tool_calls if hasattr(chunk.choices[0].delta, "tool_calls") else None,
                    "finish_reason": chunk.choices[0].finish_reason
                }
        else:
            yield {
                "type": "message",
                "content": response.choices[0].message.content,
                "tool_calls": response.choices[0].message.tool_calls,
                "finish_reason": response.choices[0].finish_reason
            }
    except Exception as e:
        logger.error(f"Error creating chat completion: {str(e)}")
        yield {
            "type": "error",
            "content": f"An error occurred: {str(e)}"
        }

async def process_chat(
    user_message: str,
    conversation_id: str,
    project_id: Optional[int] = None,
    history: Optional[List[Dict[str, Any]]] = None,
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Process a chat message from the user
    
    Args:
        user_message: Message from the user
        conversation_id: Unique conversation identifier
        project_id: Optional project identifier
        history: Optional conversation history
        
    Yields:
        Dict containing response information
    """
    # Initialize or get history
    history = history or []
    
    # Add user message to history
    history.append({
        "role": "user",
        "content": user_message
    })
    
    # Save to memory
    if project_id:
        await add_to_memory(
            project_id=project_id,
            conversation_id=conversation_id,
            message={
                "role": "user",
                "content": user_message,
                "timestamp": datetime.utcnow().isoformat()
            }
        )
    
    # Get relevant context from memory
    context = None
    if project_id:
        context = await retrieve_from_memory(
            project_id=project_id,
            query=user_message,
            limit=5
        )
    
    # Prepare messages for the API
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT}
    ]
    
    # Add context from memory if available
    if context:
        context_message = "Here are some relevant pieces of information from previous conversations:\n\n"
        for item in context:
            context_message += f"- {item['content']}\n"
        
        messages.append({
            "role": "system",
            "content": context_message
        })
    
    # Add conversation history
    messages.extend(history)
    
    # Get available tools
    tools = get_available_tools()
    
    # Generate response
    current_assistant_message = {"role": "assistant", "content": ""}
    tool_calls_pending = False
    
    async for chunk in create_chat_completion(messages, tools):
        # Handle tool calls
        if chunk.get("tool_calls"):
            tool_calls_pending = True
            
            # Format and yield tool calls for UI
            for tool_call in chunk.get("tool_calls", []):
                yield {
                    "type": "tool_call",
                    "tool_name": tool_call.function.name,
                    "tool_args": json.loads(tool_call.function.arguments)
                }
            
            # Execute tool and get result
            tool_results = []
            for tool_call in chunk.get("tool_calls", []):
                result = await execute_tool(
                    tool_name=tool_call.function.name,
                    arguments=json.loads(tool_call.function.arguments)
                )
                tool_results.append({
                    "tool_call_id": tool_call.id,
                    "role": "tool",
                    "name": tool_call.function.name,
                    "content": result
                })
            
            # Add tool calls and results to history
            for result in tool_results:
                history.append(result)
                
                # Save to memory
                if project_id:
                    await add_to_memory(
                        project_id=project_id,
                        conversation_id=conversation_id,
                        message={
                            "role": "tool",
                            "name": result["name"],
                            "content": result["content"],
                            "timestamp": datetime.utcnow().isoformat()
                        }
                    )
                
                # Yield tool results for UI
                yield {
                    "type": "tool_result",
                    "tool_name": result["name"],
                    "content": result["content"]
                }
            
            # Continue the conversation with tool results
            messages.extend(tool_results)
            async for response_chunk in create_chat_completion(messages, tools):
                content = response_chunk.get("content", "")
                if content:
                    current_assistant_message["content"] += content
                    yield {
                        "type": "message",
                        "content": content
                    }
        
        # Handle normal message chunks
        elif chunk.get("type") == "chunk" and chunk.get("content"):
            current_assistant_message["content"] += chunk.get("content", "")
            yield {
                "type": "message",
                "content": chunk.get("content", "")
            }
    
    # Add assistant message to history
    if current_assistant_message["content"] or tool_calls_pending:
        history.append(current_assistant_message)
        
        # Save to memory
        if project_id:
            await add_to_memory(
                project_id=project_id,
                conversation_id=conversation_id,
                message={
                    "role": "assistant",
                    "content": current_assistant_message["content"],
                    "timestamp": datetime.utcnow().isoformat()
                }
            )
    
    # Yield completion notification
    yield {
        "type": "done"
    }

async def generate_suggestions(project_id: int) -> List[Dict[str, Any]]:
    """
    Generate proactive suggestions for a project
    
    Args:
        project_id: Project identifier
        
    Returns:
        List of suggestion objects
    """
    # Get project context
    context = await retrieve_from_memory(
        project_id=project_id,
        query="important project information",
        limit=10
    )
    
    # Create system message with context
    system_message = SYSTEM_PROMPT + "\n\nYour task is to generate proactive suggestions for the project team based on the current state."
    
    if context:
        system_message += "\n\nHere is the current project context:\n\n"
        for item in context:
            system_message += f"- {item['content']}\n"
    
    # Create planning prompt
    planning_prompt = """
    Generate a list of 3-5 proactive suggestions for the project team. Suggestions should be:
    1. Specific and actionable
    2. Related to IND submission workflows
    3. Include relevant tool calls when appropriate
    
    For each suggestion, include:
    - A clear description of the recommendation
    - A justification for why this is important
    - Actionable next steps, preferably including tool calls
    """
    
    # Get available tools
    tools = get_available_tools()
    
    # Generate suggestions
    messages = [
        {"role": "system", "content": system_message},
        {"role": "user", "content": planning_prompt}
    ]
    
    response = await openai_client.chat.completions.create(
        model="gpt-4o",  # the newest OpenAI model is "gpt-4o" which was released May 13, 2024
        messages=messages,
        tools=tools,
        stream=False
    )
    
    # Parse suggestions from response
    suggestions = []
    
    # If tool calls are present, format them as suggestions
    if response.choices[0].message.tool_calls:
        for tool_call in response.choices[0].message.tool_calls:
            tool_name = tool_call.function.name
            arguments = json.loads(tool_call.function.arguments)
            
            suggestion = {
                "project_id": project_id,
                "text": f"I suggest running {tool_name} with these parameters: {arguments}",
                "action": {
                    "name": tool_name,
                    "arguments": arguments
                }
            }
            suggestions.append(suggestion)
    
    # If content is present, try to extract suggestions
    elif response.choices[0].message.content:
        content = response.choices[0].message.content
        
        # Simple parsing - in production you'd want more robust parsing
        sections = content.split("\n\n")
        for section in sections:
            if section.strip().startswith(("Suggestion", "Recommendation", "- ")):
                suggestions.append({
                    "project_id": project_id,
                    "text": section.strip(),
                    "action": None  # No direct action for these text-only suggestions
                })
    
    return suggestions