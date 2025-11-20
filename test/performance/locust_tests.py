
"""
Performance tests for TrialSage document upload/download scenarios
Using Locust for load testing API endpoints
"""

from locust import HttpUser, task, between
import json
import random
import os
from io import BytesIO

class DocumentOperationsUser(HttpUser):
    wait_time = between(1, 3)
    
    def on_start(self):
        """Setup test user authentication"""
        # Use development token for testing
        self.headers = {
            "Authorization": "TS_DEV",
            "Content-Type": "application/json"
        }
        
        # Create test tenant context
        self.tenant_id = "perf_test_tenant"
        
    @task(3)
    def upload_document(self):
        """Test concurrent document uploads"""
        # Generate test document data
        test_content = f"Performance test document {random.randint(1, 10000)}"
        
        files = {
            'document': ('test_doc.txt', BytesIO(test_content.encode()), 'text/plain')
        }
        
        data = {
            'tenant_id': self.tenant_id,
            'document_type': 'protocol',
            'module': 'test_module'
        }
        
        with self.client.post(
            "/api/documents/upload",
            files=files,
            data=data,
            headers={"Authorization": "TS_DEV"},
            catch_response=True
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Upload failed: {response.status_code}")
    
    @task(2)
    def download_document(self):
        """Test concurrent document downloads"""
        # First get list of available documents
        with self.client.get(
            f"/api/documents?tenant_id={self.tenant_id}",
            headers=self.headers,
            catch_response=True
        ) as response:
            if response.status_code == 200:
                documents = response.json().get('documents', [])
                if documents:
                    # Download random document
                    doc_id = random.choice(documents)['id']
                    with self.client.get(
                        f"/api/documents/{doc_id}/download",
                        headers=self.headers,
                        catch_response=True
                    ) as download_response:
                        if download_response.status_code == 200:
                            download_response.success()
                        else:
                            download_response.failure(f"Download failed: {download_response.status_code}")
    
    @task(1)
    def search_documents(self):
        """Test document search performance"""
        search_terms = ["protocol", "study", "clinical", "regulatory", "analysis"]
        query = random.choice(search_terms)
        
        with self.client.get(
            f"/api/documents/search?q={query}&tenant_id={self.tenant_id}",
            headers=self.headers,
            catch_response=True
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Search failed: {response.status_code}")
    
    @task(1)
    def get_document_metadata(self):
        """Test metadata retrieval performance"""
        with self.client.get(
            f"/api/documents/metadata?tenant_id={self.tenant_id}",
            headers=self.headers,
            catch_response=True
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Metadata retrieval failed: {response.status_code}")

class VaultOperationsUser(HttpUser):
    wait_time = between(2, 5)
    
    def on_start(self):
        self.headers = {
            "Authorization": "TS_DEV",
            "Content-Type": "application/json"
        }
        self.tenant_id = "vault_perf_test"
    
    @task(2)
    def create_cer_report(self):
        """Test CER report generation performance"""
        cer_data = {
            "device_name": f"Test Device {random.randint(1, 1000)}",
            "device_type": "Medical Device",
            "tenant_id": self.tenant_id,
            "generation_type": "quick"
        }
        
        with self.client.post(
            "/api/cer/generate",
            json=cer_data,
            headers=self.headers,
            catch_response=True
        ) as response:
            if response.status_code in [200, 201]:
                response.success()
            else:
                response.failure(f"CER generation failed: {response.status_code}")
    
    @task(1)
    def vault_browser_access(self):
        """Test vault browser performance"""
        with self.client.get(
            f"/api/vault/browse?tenant_id={self.tenant_id}",
            headers=self.headers,
            catch_response=True
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Vault browse failed: {response.status_code}")
