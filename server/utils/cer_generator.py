"""
CER Generator Utility

This module provides the core functionality for generating Clinical Evaluation Reports (CERs)
using OpenAI's GPT-4o model with pgvector similarity search for evidence retrieval.
"""

import os
import json
import asyncio
import logging
from typing import List, Dict, Any, AsyncGenerator, Optional, Tuple

import openai
from openai import AsyncOpenAI
from sqlalchemy import create_engine, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from pgvector.sqlalchemy import Vector

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize OpenAI client with API key
client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

# Database configuration
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable not set")

# Create async database engine
async_engine = create_async_engine(DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://"))
AsyncSessionLocal = sessionmaker(async_engine, class_=AsyncSession, expire_on_commit=False)

# Create sync engine for embedding operations
sync_engine = create_engine(DATABASE_URL)


async def get_device_details(device_id: int) -> Dict[str, Any]:
    """
    Retrieve device details from the database
    
    Args:
        device_id: The ID of the device
        
    Returns:
        Dictionary containing device details
    """
    async with AsyncSessionLocal() as session:
        query = text("SELECT * FROM devices WHERE id = :device_id")
        result = await session.execute(query, {"device_id": device_id})
        device = result.mappings().first()
        
        if not device:
            raise ValueError(f"Device with ID {device_id} not found")
        
        return dict(device)


async def fetch_adverse_events(device_id: int, start_date: str, end_date: str) -> List[Dict[str, Any]]:
    """
    Fetch adverse events for the specified device and date range
    
    Args:
        device_id: The ID of the device
        start_date: Start date in ISO format (YYYY-MM-DD)
        end_date: End date in ISO format (YYYY-MM-DD)
        
    Returns:
        List of adverse events
    """
    async with AsyncSessionLocal() as session:
        query = text("""
            SELECT * FROM adverse_events 
            WHERE device_id = :device_id 
            AND event_date BETWEEN :start_date AND :end_date
            ORDER BY event_date DESC
        """)
        
        result = await session.execute(
            query, 
            {
                "device_id": device_id,
                "start_date": start_date,
                "end_date": end_date
            }
        )
        
        events = [dict(row) for row in result.mappings().all()]
        return events


async def retrieve_similar_documents(query_text: str, top_k: int = 10) -> List[Dict[str, Any]]:
    """
    Retrieve semantically similar document chunks using pgvector
    
    Args:
        query_text: The text to search for
        top_k: Number of results to return
        
    Returns:
        List of similar document chunks with metadata
    """
    # Generate embedding for query text
    embedding_response = await client.embeddings.create(
        model="text-embedding-ada-002",
        input=query_text,
    )
    query_embedding = embedding_response.data[0].embedding
    
    # Perform similarity search using pgvector
    async with AsyncSessionLocal() as session:
        query = text("""
            SELECT id, content, source_type, source_id, metadata,
                   embedding <-> :query_embedding AS distance
            FROM doc_chunks
            ORDER BY distance
            LIMIT :limit
        """)
        
        result = await session.execute(
            query, 
            {
                "query_embedding": query_embedding,
                "limit": top_k
            }
        )
        
        chunks = [dict(row) for row in result.mappings().all()]
        return chunks


async def analyze_adverse_events(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Analyze adverse events to extract insights
    
    Args:
        events: List of adverse events
        
    Returns:
        Dictionary containing insights about the events
    """
    if not events:
        return {
            "total_count": 0,
            "serious_count": 0,
            "non_serious_count": 0,
            "common_event_types": [],
            "monthly_trend": []
        }
    
    # Count serious vs non-serious events
    serious_count = sum(1 for e in events if e.get("seriousness") in ["Death", "Life-threatening", "Hospitalization"])
    
    # Get common event types
    event_types = {}
    for event in events:
        event_type = event.get("event_type", "Unknown")
        event_types[event_type] = event_types.get(event_type, 0) + 1
    
    common_event_types = [
        {"type": k, "count": v} 
        for k, v in sorted(event_types.items(), key=lambda item: item[1], reverse=True)
    ][:10]
    
    # Generate monthly trend data
    # This would actually be more complex, using SQL aggregation
    monthly_trend = []  # Simplified for now
    
    return {
        "total_count": len(events),
        "serious_count": serious_count,
        "non_serious_count": len(events) - serious_count,
        "common_event_types": common_event_types,
        "monthly_trend": monthly_trend
    }


async def retrieve_evidence_for_section(device_details: Dict[str, Any], section_name: str) -> List[Dict[str, Any]]:
    """
    Retrieve evidence for a specific report section
    
    Args:
        device_details: Dictionary containing device details
        section_name: Name of the report section
        
    Returns:
        List of evidence items for the section
    """
    # Map section names to relevant query terms
    section_queries = {
        "executive_summary": f"{device_details['name']} medical device summary overview",
        "device_description": f"{device_details['name']} technical specifications features",
        "state_of_the_art": f"{device_details['name']} state of the art clinical technology",
        "risk_assessment": f"{device_details['name']} risks adverse events analysis",
        "clinical_evaluation": f"{device_details['name']} clinical trials studies evidence",
        "post_market_surveillance": f"{device_details['name']} post-market surveillance feedback",
        "conclusion": f"{device_details['name']} clinical evaluation conclusion benefit risk",
    }
    
    query = section_queries.get(section_name, f"{device_details['name']} {section_name}")
    evidence = await retrieve_similar_documents(query)
    
    # Organize evidence by source type
    grouped_evidence = {}
    for item in evidence:
        source = item.get("source_type", "unknown")
        if source not in grouped_evidence:
            grouped_evidence[source] = []
        grouped_evidence[source].append(item)
    
    return grouped_evidence


async def generate_section_content(
    section_name: str,
    device_details: Dict[str, Any],
    evidence: Dict[str, List[Dict[str, Any]]],
    insights: Dict[str, Any] = None
) -> AsyncGenerator[str, None]:
    """
    Generate content for a specific section of the CER using GPT-4o
    
    Args:
        section_name: Name of the report section
        device_details: Dictionary containing device details
        evidence: Dictionary of evidence items grouped by source type
        insights: Optional insights data
        
    Yields:
        Chunks of generated text as they become available
    """
    # Prepare system prompt with MDR/IVDR context
    system_prompt = f"""You are an expert regulatory writer specializing in EU MDR (2017/745) and IVDR (2017/746) Clinical Evaluation Reports.
Your task is to write the {section_name} section of a Clinical Evaluation Report for a medical device.
Follow these key principles:
1. Use formal, scientific language appropriate for regulatory submissions
2. Focus on evidence-based statements with clear references
3. Structure content with appropriate headings and lists
4. Address MDR/IVDR requirements specifically relevant to this section
5. Maintain objectivity and avoid marketing language
6. Cite evidence sources clearly (FAERS, PubMed, etc.)

Output format: Write detailed, comprehensive content for the section following MDR/IVDR regulations.
"""

    # Format evidence as text for inclusion in the prompt
    evidence_text = ""
    for source_type, items in evidence.items():
        evidence_text += f"\n\n== EVIDENCE FROM {source_type.upper()} ==\n"
        for i, item in enumerate(items[:5], 1):  # Limit to 5 items per source
            evidence_text += f"\n[{source_type}-{i}] {item['content']}\n"
    
    # Prepare insights text if available
    insights_text = ""
    if insights:
        insights_text = "\n\n== INSIGHTS FROM ADVERSE EVENT ANALYSIS ==\n"
        insights_text += f"Total events: {insights['total_count']}\n"
        insights_text += f"Serious events: {insights['serious_count']}\n"
        insights_text += f"Non-serious events: {insights['non_serious_count']}\n"
        
        if insights['common_event_types']:
            insights_text += "\nCommon event types:\n"
            for event_type in insights['common_event_types'][:5]:
                insights_text += f"- {event_type['type']}: {event_type['count']} occurrences\n"
    
    # Prepare user prompt with device details and evidence
    user_prompt = f"""Please write the {section_name.replace('_', ' ').title()} section for a Clinical Evaluation Report on the following medical device:

DEVICE INFORMATION:
- Name: {device_details['name']}
- Manufacturer: {device_details['manufacturer']}
- Device Class: {device_details['device_class']}
- Intended Use: {device_details['intended_use']}

{evidence_text}

{insights_text}

Write comprehensive content for this section following MDR/IVDR requirements.
"""

    # Call OpenAI API with streaming
    stream = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        stream=True,
        temperature=0.7,
        max_tokens=1500
    )
    
    # Stream the response
    async for chunk in stream:
        if chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content


async def generate_cer(
    device_id: int, 
    start_date: str, 
    end_date: str,
    sections: List[str] = None
) -> AsyncGenerator[Tuple[str, str], None]:
    """
    Generate a complete Clinical Evaluation Report for a device
    
    Args:
        device_id: The ID of the device
        start_date: Start date in ISO format (YYYY-MM-DD)
        end_date: End date in ISO format (YYYY-MM-DD)
        sections: Optional list of sections to generate (default: all sections)
        
    Yields:
        Tuples of (section_name, content_chunk) as they become available
    """
    logger.info(f"Starting CER generation for device {device_id}")
    
    # Define default sections if not provided
    if sections is None:
        sections = [
            "executive_summary",
            "device_description",
            "state_of_the_art",
            "risk_assessment",
            "clinical_evaluation",
            "post_market_surveillance",
            "conclusion"
        ]
    
    try:
        # Get device details
        device_details = await get_device_details(device_id)
        logger.info(f"Retrieved details for device: {device_details['name']}")
        
        # Fetch adverse events
        events = await fetch_adverse_events(device_id, start_date, end_date)
        logger.info(f"Retrieved {len(events)} adverse events")
        
        # Analyze events for insights
        insights = await analyze_adverse_events(events)
        logger.info("Analyzed adverse events for insights")
        
        # Generate content for each section
        for section_name in sections:
            logger.info(f"Generating {section_name} section")
            
            # Retrieve evidence specific to this section
            evidence = await retrieve_evidence_for_section(device_details, section_name)
            logger.info(f"Retrieved evidence for {section_name} from {len(evidence)} sources")
            
            # Generate and stream section content
            async for content_chunk in generate_section_content(
                section_name, device_details, evidence, insights
            ):
                yield (section_name, content_chunk)
    
    except Exception as e:
        logger.error(f"Error generating CER: {str(e)}")
        yield ("error", f"Error generating report: {str(e)}")


async def generate_cer_complete(
    device_id: int, 
    start_date: str, 
    end_date: str,
    sections: List[str] = None
) -> Dict[str, str]:
    """
    Generate a complete Clinical Evaluation Report as a single object
    
    Args:
        device_id: The ID of the device
        start_date: Start date in ISO format (YYYY-MM-DD)
        end_date: End date in ISO format (YYYY-MM-DD)
        sections: Optional list of sections to generate (default: all sections)
        
    Returns:
        Dictionary mapping section names to their complete content
    """
    # Container for complete report content
    report_content = {}
    
    # Generate report content
    async for section_name, content_chunk in generate_cer(
        device_id, start_date, end_date, sections
    ):
        if section_name == "error":
            raise ValueError(content_chunk)
            
        if section_name not in report_content:
            report_content[section_name] = ""
            
        report_content[section_name] += content_chunk
    
    return report_content