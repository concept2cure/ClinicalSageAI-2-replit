"""
Test Enhanced Vector Database with Sample Regulatory Documents

This script creates sample regulatory documents with proper metadata
to demonstrate the enhanced vector database functionality.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from openai import OpenAI
from server.db import SessionLocal, engine, Base
from server.models.doc_chunks import DocumentChunk

# Initialize OpenAI client
client = OpenAI()

# Sample regulatory documents for testing
SAMPLE_DOCUMENTS = [
    {
        "doc_id": "test_csr_001",
        "doc_title": "Phase III Clinical Study Report - Cardiovascular Safety Study",
        "content": """This clinical study report presents the results of a randomized, double-blind, placebo-controlled Phase III study evaluating the cardiovascular safety of XYZ-123 in patients with diabetes mellitus. The study was conducted in accordance with ICH GCP guidelines and FDA regulations. Primary endpoint was cardiovascular death, myocardial infarction, or stroke. The study enrolled 8,000 patients across 150 sites in the United States and Europe. Statistical analysis was performed according to the pre-specified statistical analysis plan. Results demonstrated non-inferiority to placebo for the primary composite cardiovascular endpoint with a hazard ratio of 0.98 (95% CI: 0.89-1.08). Adverse events were consistent with the known safety profile of the drug class.""",
        "ectd_section": "5.3.5.1",
        "doc_type": "CSR",
        "region_tag": ["FDA", "EMA"],
        "page_number": 1
    },
    {
        "doc_id": "test_ich_q2r1",
        "doc_title": "ICH Q2(R1) Validation of Analytical Procedures: Text and Methodology",
        "content": """This ICH harmonised tripartite guideline has been developed by the appropriate ICH Expert Working Group and has been subject to consultation by the regulatory parties, in accordance with the ICH Process. This guideline addresses the validation of analytical procedures included as part of registration applications for new drug substances and drug products. The objective of validation of an analytical procedure is to demonstrate that it is suitable for its intended purpose. The parameters for method validation include accuracy, precision, specificity, detection limit, quantitation limit, linearity, and range. Validation should be considered during the development phase for all analytical procedures intended for use during manufacturing.""",
        "ectd_section": "3.2.S.4.2",
        "doc_type": "ICH_Guideline",
        "region_tag": ["ICH", "FDA", "EMA", "PMDA"],
        "page_number": 1
    },
    {
        "doc_id": "test_protocol_001",
        "doc_title": "Clinical Trial Protocol - ABC-456 Phase II Oncology Study",
        "content": """Protocol Title: A Phase II, Open-Label, Multicenter Study to Evaluate the Efficacy and Safety of ABC-456 in Patients with Advanced Non-Small Cell Lung Cancer. Primary Objective: To evaluate the objective response rate (ORR) of ABC-456 in patients with advanced NSCLC. Secondary Objectives: To evaluate progression-free survival, overall survival, and safety profile. Study Design: This is a Phase II, open-label, multicenter, single-arm study. Approximately 100 patients will be enrolled. Treatment will consist of ABC-456 administered orally once daily until disease progression or unacceptable toxicity. Tumor assessments will be performed according to RECIST 1.1 criteria every 8 weeks.""",
        "ectd_section": "5.3.5.1",
        "doc_type": "Protocol",
        "region_tag": ["FDA"],
        "page_number": 1
    },
    {
        "doc_id": "test_fda_guidance",
        "doc_title": "FDA Guidance for Industry - Bioanalytical Method Validation",
        "content": """This guidance provides recommendations to sponsors of investigational new drug applications (INDs), new drug applications (NDAs), abbreviated new drug applications (ANDAs), and biologics license applications (BLAs) on bioanalytical method validation for pharmacokinetic studies. The guidance covers validation of assays for the quantitative determination of drugs and their metabolites in biological matrices such as blood, serum, plasma, or urine. Key validation parameters include selectivity, sensitivity, accuracy, precision, calibration curve, and stability. The guidance also addresses incurred sample reanalysis and the use of dried blood spots.""",
        "ectd_section": "1.3",
        "doc_type": "FDA_Guidance",
        "region_tag": ["FDA"],
        "page_number": 1
    },
    {
        "doc_id": "test_sap_001",
        "doc_title": "Statistical Analysis Plan - XYZ-789 Diabetes Study",
        "content": """Statistical Analysis Plan for Protocol XYZ-789: A Randomized, Double-Blind, Placebo-Controlled Study of XYZ-789 in Type 2 Diabetes Mellitus. Primary Analysis: The primary efficacy endpoint is the change from baseline in HbA1c at Week 24. Analysis will be performed using ANCOVA with treatment group as factor and baseline HbA1c as covariate. Missing data will be handled using mixed model repeated measures (MMRM). Secondary endpoints include change in fasting plasma glucose, body weight, and blood pressure. Safety analyses will include adverse events, laboratory parameters, and vital signs. All statistical tests will be two-sided with alpha level of 0.05.""",
        "ectd_section": "5.3.5.2",
        "doc_type": "SAP",
        "region_tag": ["FDA", "EMA"],
        "page_number": 1
    }
]

def create_test_chunks():
    """Create test document chunks with enhanced metadata"""
    print("Creating test document chunks with enhanced regulatory metadata...")
    
    db = SessionLocal()
    
    # Clear any existing test documents
    db.query(DocumentChunk).filter(DocumentChunk.doc_id.like("test_%")).delete()
    db.commit()
    
    total_chunks = 0
    
    for doc_data in SAMPLE_DOCUMENTS:
        print(f"Processing document: {doc_data['doc_title']}")
        
        # Split content into chunks (simulating chunking process)
        content = doc_data["content"]
        words = content.split()
        chunk_size = 200  # Smaller chunks for testing
        
        for i in range(0, len(words), chunk_size):
            chunk_words = words[i:i + chunk_size]
            chunk_content = " ".join(chunk_words)
            chunk_index = i // chunk_size
            
            try:
                # Generate embedding
                embedding_response = client.embeddings.create(
                    input=chunk_content,
                    model="text-embedding-3-small"
                )
                embedding = embedding_response.data[0].embedding
                
                # Create document chunk with enhanced metadata
                chunk = DocumentChunk(
                    doc_id=doc_data["doc_id"],
                    doc_title=doc_data["doc_title"],
                    chunk_index=chunk_index,
                    content=chunk_content,
                    embedding=embedding,
                    ectd_section=doc_data["ectd_section"],
                    page_number=doc_data["page_number"],
                    doc_type=doc_data["doc_type"],
                    region_tag=doc_data["region_tag"]
                )
                
                db.add(chunk)
                total_chunks += 1
                
            except Exception as e:
                print(f"Error creating chunk {chunk_index} for {doc_data['doc_id']}: {e}")
        
        db.commit()
        print(f"✅ Created chunks for {doc_data['doc_title']}")
    
    db.close()
    print(f"✅ Test data creation complete! Created {total_chunks} enhanced chunks")
    return total_chunks

def test_enhanced_search():
    """Test the enhanced search functionality"""
    print("\n🔍 Testing enhanced vector search functionality...")
    
    import requests
    import json
    
    base_url = "http://localhost:5000/api"
    
    # Test cases for enhanced search
    test_cases = [
        {
            "name": "Search CSR documents",
            "query": "clinical study cardiovascular safety",
            "filters": {"doc_type": "CSR"}
        },
        {
            "name": "Search ICH Guidelines",
            "query": "analytical validation procedures",
            "filters": {"doc_type": "ICH_Guideline"}
        },
        {
            "name": "Search eCTD Section 5.3",
            "query": "efficacy safety study",
            "filters": {"ectd_section": "5.3.5.1"}
        },
        {
            "name": "Search FDA documents",
            "query": "bioanalytical method validation",
            "filters": {"region": "FDA"}
        },
        {
            "name": "Search EMA documents",
            "query": "diabetes mellitus study",
            "filters": {"region": "EMA"}
        }
    ]
    
    for test_case in test_cases:
        print(f"\n📝 {test_case['name']}:")
        print(f"   Query: '{test_case['query']}'")
        print(f"   Filters: {test_case['filters']}")
        
        try:
            # Prepare search payload
            search_payload = {
                "query": test_case["query"],
                "limit": 3
            }
            search_payload.update(test_case["filters"])
            
            # Make search request
            response = requests.post(
                f"{base_url}/vector-search",
                json=search_payload,
                timeout=10
            )
            
            if response.status_code == 200:
                results = response.json()
                print(f"   ✅ Found {results.get('total', 0)} results")
                
                for i, result in enumerate(results.get('results', [])[:2]):
                    print(f"      {i+1}. {result.get('doc_title', 'Unknown')}")
                    print(f"         eCTD: {result.get('ectd_section', 'N/A')}")
                    print(f"         Type: {result.get('doc_type', 'N/A')}")
                    print(f"         Regions: {result.get('region_tag', [])}")
                    print(f"         Score: {result.get('similarity_score', 'N/A'):.3f}")
            else:
                print(f"   ❌ Search failed: {response.status_code}")
                
        except Exception as e:
            print(f"   ❌ Error: {e}")

def verify_database_schema():
    """Verify the enhanced database schema"""
    print("\n🔧 Verifying enhanced database schema...")
    
    db = SessionLocal()
    
    try:
        # Check total chunks
        total_chunks = db.query(DocumentChunk).count()
        print(f"   Total chunks in database: {total_chunks}")
        
        # Check enhanced metadata coverage
        with_ectd = db.query(DocumentChunk).filter(DocumentChunk.ectd_section.isnot(None)).count()
        with_doc_type = db.query(DocumentChunk).filter(DocumentChunk.doc_type.isnot(None)).count()
        with_regions = db.query(DocumentChunk).filter(DocumentChunk.region_tag.isnot(None)).count()
        
        print(f"   Chunks with eCTD sections: {with_ectd}")
        print(f"   Chunks with document types: {with_doc_type}")
        print(f"   Chunks with region tags: {with_regions}")
        
        if total_chunks > 0:
            print(f"   eCTD coverage: {with_ectd/total_chunks*100:.1f}%")
            print(f"   Doc type coverage: {with_doc_type/total_chunks*100:.1f}%")
            print(f"   Region coverage: {with_regions/total_chunks*100:.1f}%")
        
        # Show sample data
        print("\n📊 Sample enhanced chunks:")
        sample_chunks = db.query(DocumentChunk).limit(3).all()
        for chunk in sample_chunks:
            print(f"   • {chunk.doc_title[:50]}...")
            print(f"     eCTD: {chunk.ectd_section}, Type: {chunk.doc_type}")
            print(f"     Regions: {chunk.region_tag}")
        
    finally:
        db.close()

def main():
    """Main test function"""
    print("🚀 Enhanced Vector Database Test Suite")
    print("=" * 50)
    
    # Ensure database tables exist
    Base.metadata.create_all(engine)
    
    # Create test data
    chunks_created = create_test_chunks()
    
    # Verify schema
    verify_database_schema()
    
    # Test search functionality
    test_enhanced_search()
    
    print("\n" + "=" * 50)
    print("✅ Enhanced Vector Database Test Complete!")
    print(f"   📈 Created {chunks_created} enhanced chunks")
    print("   🔍 Search functionality verified")
    print("   📊 Regulatory metadata validated")

if __name__ == "__main__":
    main()