"""
Assistant Routes for OpenAI streaming support
"""

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from openai import OpenAI
import os

router = APIRouter()

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

@router.post("/api/assistant/stream")
async def chat_stream(req: Request):
    """
    Stream OpenAI completions for the assistant interface
    """
    body = await req.json()
    msgs = body["messages"]
    
    # Convert to OpenAI format
    formatted_msgs = [{"role": msg["role"], "content": msg["content"]} for msg in msgs]

    def gen():
        completion = client.chat.completions.create(
            model="gpt-4o",  # the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
            messages=formatted_msgs,
            stream=True,
        )
        for chunk in completion:
            content = chunk.choices[0].delta.content or ""
            yield content.encode()

    return StreamingResponse(gen(), media_type="text/plain")