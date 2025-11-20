import os
import json
import pandas as pd
import numpy as np
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
import requests
from tqdm import tqdm
import pickle
import logging
from scipy.spatial.distance import cosine
import csv
import matplotlib.pyplot as plt
from sklearn.manifold import TSNE
from sklearn.cluster import KMeans, DBSCAN
from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
from sklearn.model_selection import train_test_split

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("csr_deep_learning.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("CSR-DeepLearning")

# Constants
EMBEDDING_DIM = 1024  # BGE-large embedding dimension
HF_MODEL_ID = "BAAI/bge-large-en-v1.5"  # Text embedding model
TEXT_MODEL_ID = "mistralai/Mixtral-8x7B-Instruct-v0.1"  # Text generation model
MULTIMODAL_MODEL_ID = "llava-hf/llava-1.5-13b-hf"  # Visual analysis model
EMBEDDINGS_CACHE_FILE = "data/csr_embeddings_cache.pkl"
PATTERNS_FILE = "data/learned_csr_patterns.json"
PROCESSED_CSRS_DIR = "data/processed_csrs"
CSR_ANALYTICS_OUTPUT_DIR = "data/csr_analytics"

# Ensure directories exist
os.makedirs(PROCESSED_CSRS_DIR, exist_ok=True)
os.makedirs(CSR_ANALYTICS_OUTPUT_DIR, exist_ok=True)

class CSRDeepLearningEngine:
    """Deep Learning Engine for CSR Intelligence"""
    
    def __init__(self, hf_api_key: Optional[str] = None):
        """Initialize the CSR Deep Learning Engine"""
        self.hf_api_key = hf_api_key or os.environ.get("HF_API_KEY")
        if not self.hf_api_key:
            logger.warning("No HuggingFace API key provided. API calls will be limited.")
        
        # Load existing embeddings cache if available
        self.embeddings_cache = {}
        if os.path.exists(EMBEDDINGS_CACHE_FILE):
            try:
                with open(EMBEDDINGS_CACHE_FILE, 'rb') as f:
                    self.embeddings_cache = pickle.load(f)
                logger.info(f"Loaded {len(self.embeddings_cache)} cached CSR embeddings")
            except Exception as e:
                logger.error(f"Error loading embeddings cache: {e}")
        
        # Load learned patterns if available
        self.learned_patterns = []
        if os.path.exists(PATTERNS_FILE):
            try:
                with open(PATTERNS_FILE, 'r') as f:
                    self.learned_patterns = json.load(f)
                logger.info(f"Loaded {len(self.learned_patterns)} learned CSR patterns")
            except Exception as e:
                logger.error(f"Error loading learned patterns: {e}")
    
    def _get_text_embedding(self, text: str) -> np.ndarray:
        """Get text embedding from HuggingFace model"""
        # Check cache first
        if text in self.embeddings_cache:
            return self.embeddings_cache[text]
        
        # If not in cache, get from API
        api_url = f"https://api-inference.huggingface.co/models/{HF_MODEL_ID}"
        headers = {"Authorization": f"Bearer {self.hf_api_key}"}
        
        # Prepare text for embedding - limit to 8192 tokens to avoid issues
        if len(text) > 32768:  # Approximate token limit
            text = text[:32768]
        
        try:
            response = requests.post(api_url, headers=headers, json={"inputs": text})
            response.raise_for_status()
            embedding = np.array(response.json())
            
            # Cache the embedding
            self.embeddings_cache[text] = embedding
            
            # Periodically save cache
            if len(self.embeddings_cache) % 10 == 0:
                self._save_embeddings_cache()
                
            return embedding
        except Exception as e:
            logger.error(f"Error getting embedding: {e}")
            # Return zero vector as fallback
            return np.zeros(EMBEDDING_DIM)
    
    def _save_embeddings_cache(self):
        """Save embeddings cache to disk"""
        try:
            with open(EMBEDDINGS_CACHE_FILE, 'wb') as f:
                pickle.dump(self.embeddings_cache, f)
            logger.info(f"Saved {len(self.embeddings_cache)} embeddings to cache")
        except Exception as e:
            logger.error(f"Error saving embeddings cache: {e}")
    
    def generate_csr_embeddings(self, csrs: List[Dict[str, Any]]) -> Dict[int, np.ndarray]:
        """Generate embeddings for a list of CSRs"""
        csr_embeddings = {}
        
        for csr in tqdm(csrs, desc="Generating CSR embeddings"):
            csr_id = csr.get('id')
            
            # Combine key fields for embedding
            csr_text = f"Title: {csr.get('title', '')}\n"
            csr_text += f"Sponsor: {csr.get('sponsor', '')}\n"
            csr_text += f"Indication: {csr.get('indication', '')}\n"
            csr_text += f"Phase: {csr.get('phase', '')}\n"
            
            # Add details if available
            if 'details' in csr and csr['details']:
                details = csr['details']
                csr_text += f"Study Design: {details.get('studyDesign', '')}\n"
                csr_text += f"Primary Objective: {details.get('primaryObjective', '')}\n"
                csr_text += f"Inclusion Criteria: {details.get('inclusionCriteria', '')}\n"
                csr_text += f"Exclusion Criteria: {details.get('exclusionCriteria', '')}\n"
                csr_text += f"Primary Endpoint: {details.get('primaryEndpoint', '')}\n"
                csr_text += f"Results: {details.get('results', '')}\n"
            
            # Get embedding
            embedding = self._get_text_embedding(csr_text)
            csr_embeddings[csr_id] = embedding
        
        return csr_embeddings
    
    def identify_csr_clusters(self, embeddings: Dict[int, np.ndarray]) -> Dict[str, Any]:
        """Identify clusters in CSR embeddings using DBSCAN and K-means"""
        if not embeddings:
            return {"error": "No embeddings provided"}
        
        # Convert embeddings dict to matrix
        csr_ids = list(embeddings.keys())
        embedding_matrix = np.array([embeddings[csr_id] for csr_id in csr_ids])
        
        # Normalize embeddings
        scaler = StandardScaler()
        normalized_embeddings = scaler.fit_transform(embedding_matrix)
        
        # Try to determine optimal number of clusters using elbow method
        inertia_values = []
        k_range = range(2, min(20, len(csr_ids)))
        for k in k_range:
            kmeans = KMeans(n_clusters=k, random_state=42)
            kmeans.fit(normalized_embeddings)
            inertia_values.append(kmeans.inertia_)
        
        # Find elbow point
        optimal_k = 5  # Default
        if len(inertia_values) > 2:
            changes = [inertia_values[i-1] - inertia_values[i] for i in range(1, len(inertia_values))]
            rates_of_change = [changes[i-1] - changes[i] for i in range(1, len(changes))]
            if rates_of_change:
                optimal_k = rates_of_change.index(max(rates_of_change)) + 3  # +3 because we started from k=2 and have a double difference
        
        # K-means clustering with optimal K
        kmeans = KMeans(n_clusters=optimal_k, random_state=42)
        kmeans_labels = kmeans.fit_predict(normalized_embeddings)
        
        # DBSCAN clustering
        dbscan = DBSCAN(eps=0.5, min_samples=5)
        dbscan_labels = dbscan.fit_predict(normalized_embeddings)
        
        # Dimensionality reduction for visualization
        tsne = TSNE(n_components=2, random_state=42)
        embeddings_2d = tsne.fit_transform(normalized_embeddings)
        
        # Save visualization
        plt.figure(figsize=(12, 8))
        plt.scatter(embeddings_2d[:, 0], embeddings_2d[:, 1], c=kmeans_labels, cmap='viridis', alpha=0.7)
        plt.title(f'CSR Clusters (K={optimal_k})')
        plt.colorbar(label='Cluster')
        plt.savefig(os.path.join(CSR_ANALYTICS_OUTPUT_DIR, 'csr_clusters.png'))
        plt.close()
        
        # Prepare results
        cluster_results = {
            "kmeans": {
                "n_clusters": optimal_k,
                "labels": kmeans_labels.tolist(),
                "cluster_sizes": np.bincount(kmeans_labels).tolist(),
                "cluster_centers": kmeans.cluster_centers_.tolist()
            },
            "dbscan": {
                "n_clusters": len(set(dbscan_labels)) - (1 if -1 in dbscan_labels else 0),
                "labels": dbscan_labels.tolist(),
                "cluster_sizes": np.bincount(dbscan_labels[dbscan_labels >= 0]).tolist() if -1 in dbscan_labels else np.bincount(dbscan_labels).tolist(),
                "noise_points": int(np.sum(dbscan_labels == -1))
            },
            "visualization": {
                "tsne_coordinates": embeddings_2d.tolist(),
                "visualization_path": os.path.join(CSR_ANALYTICS_OUTPUT_DIR, 'csr_clusters.png')
            },
            "csr_ids": csr_ids
        }
        
        return cluster_results
    
    def find_similar_csrs(self, query_csr_id: int, embeddings: Dict[int, np.ndarray], top_k: int = 10) -> List[Dict[str, Any]]:
        """Find CSRs similar to the query CSR"""
        if query_csr_id not in embeddings:
            return [{"error": f"CSR {query_csr_id} not found in embeddings"}]
        
        query_embedding = embeddings[query_csr_id]
        similarities = []
        
        for csr_id, embedding in embeddings.items():
            if csr_id != query_csr_id:
                similarity = 1 - cosine(query_embedding, embedding)
                similarities.append((csr_id, similarity))
        
        # Sort by similarity (descending)
        similarities.sort(key=lambda x: x[1], reverse=True)
        
        # Return top k
        similar_csrs = [{"csr_id": csr_id, "similarity": float(similarity)} for csr_id, similarity in similarities[:top_k]]
        return similar_csrs
    
    def discover_csr_patterns(self, csrs: List[Dict[str, Any]], embeddings: Dict[int, np.ndarray]) -> List[Dict[str, Any]]:
        """Discover patterns in CSRs using PCA and clustering"""
        patterns = []
        
        # Prepare feature matrix
        csr_ids = [csr['id'] for csr in csrs if csr['id'] in embeddings]
        if not csr_ids:
            return [{"error": "No matching CSRs with embeddings found"}]
        
        embedding_matrix = np.array([embeddings[csr_id] for csr_id in csr_ids])
        
        # PCA to identify main components of variation
        pca = PCA(n_components=10)
        pca.fit(embedding_matrix)
        
        # Analyze each principal component
        for i, component in enumerate(pca.components_):
            # Get CSRs with highest projection on this component
            projections = embedding_matrix.dot(component)
            top_indices = np.argsort(projections)[-5:]
            bottom_indices = np.argsort(projections)[:5]
            
            top_csrs = [csrs[csr_ids.index(csr_ids[idx])] for idx in top_indices]
            bottom_csrs = [csrs[csr_ids.index(csr_ids[idx])] for idx in bottom_indices]
            
            # Try to characterize the pattern
            pattern = {
                "pattern_id": f"pattern_{i}",
                "variance_explained": float(pca.explained_variance_ratio_[i]),
                "description": self._generate_pattern_description(top_csrs, bottom_csrs),
                "top_examples": [csr['id'] for csr in top_csrs],
                "bottom_examples": [csr['id'] for csr in bottom_csrs]
            }
            
            patterns.append(pattern)
        
        # Save learned patterns
        self.learned_patterns = patterns
        with open(PATTERNS_FILE, 'w') as f:
            json.dump(patterns, f, indent=2)
            
        return patterns
    
    def _generate_pattern_description(self, top_csrs: List[Dict[str, Any]], bottom_csrs: List[Dict[str, Any]]) -> str:
        """Generate description of pattern based on CSRs"""
        # Extract key features
        top_indications = [csr.get('indication', 'Unknown') for csr in top_csrs]
        top_phases = [csr.get('phase', 'Unknown') for csr in top_csrs]
        top_sponsors = [csr.get('sponsor', 'Unknown') for csr in top_csrs]
        
        bottom_indications = [csr.get('indication', 'Unknown') for csr in bottom_csrs]
        bottom_phases = [csr.get('phase', 'Unknown') for csr in bottom_csrs]
        bottom_sponsors = [csr.get('sponsor', 'Unknown') for csr in bottom_csrs]
        
        # Find most common values
        top_indication = max(set(top_indications), key=top_indications.count) if top_indications else "Various"
        top_phase = max(set(top_phases), key=top_phases.count) if top_phases else "Various"
        top_sponsor_type = "Major pharma" if any("pfizer" in s.lower() or "novartis" in s.lower() or "roche" in s.lower() or "merck" in s.lower() or "johnson" in s.lower() for s in top_sponsors) else "Various sponsors"
        
        bottom_indication = max(set(bottom_indications), key=bottom_indications.count) if bottom_indications else "Various"
        bottom_phase = max(set(bottom_phases), key=bottom_phases.count) if bottom_phases else "Various"
        
        # Generate description
        if top_indication != bottom_indication:
            description = f"Contrast between {top_indication} vs {bottom_indication} trials"
        elif top_phase != bottom_phase:
            description = f"Differentiation between {top_phase} vs {bottom_phase} trials"
        else:
            description = f"Pattern involving {top_indication} trials in {top_phase} phase"
            
        return description
    
    def analyze_csr_content(self, csr_text: str) -> Dict[str, Any]:
        """Analyze CSR content using HuggingFace text model"""
        api_url = f"https://api-inference.huggingface.co/models/{TEXT_MODEL_ID}"
        headers = {"Authorization": f"Bearer {self.hf_api_key}"}
        
        # Prepare prompt
        prompt = f"""
        <s>[INST] You are a clinical research expert analyzing a Clinical Study Report (CSR). 
        Please extract the following information from the text:
        1. Study design type
        2. Key inclusion/exclusion criteria
        3. Primary and secondary endpoints
        4. Statistical analysis approach
        5. Main efficacy findings
        6. Key safety findings
        7. Limitations
        
        Provide your analysis in JSON format with these fields.
        
        Here is the CSR text:
        {csr_text[:10000]}... [/INST]</s>
        """
        
        try:
            response = requests.post(
                api_url, 
                headers=headers, 
                json={
                    "inputs": prompt,
                    "parameters": {
                        "max_new_tokens": 800,
                        "temperature": 0.2,
                        "return_full_text": False
                    }
                }
            )
            response.raise_for_status()
            
            result = response.json()
            generated_text = result[0]["generated_text"] if isinstance(result, list) else result["generated_text"]
            
            # Extract JSON content from the response
            try:
                # Look for JSON-like structure
                json_start = generated_text.find('{')
                json_end = generated_text.rfind('}') + 1
                if json_start >= 0 and json_end > json_start:
                    json_content = generated_text[json_start:json_end]
                    analysis = json.loads(json_content)
                else:
                    # If no JSON structure, create a structured response
                    analysis = {
                        "study_design": "Not clearly identified",
                        "inclusion_exclusion": "Not clearly extracted",
                        "endpoints": "Not clearly identified",
                        "statistical_approach": "Not clearly described",
                        "efficacy_findings": "Not clearly summarized",
                        "safety_findings": "Not clearly extracted",
                        "limitations": "Not clearly described",
                        "raw_text": generated_text
                    }
            except json.JSONDecodeError:
                # If JSON parsing fails, provide a structured response with raw text
                analysis = {
                    "error": "Could not extract structured data",
                    "raw_text": generated_text
                }
                
            return analysis
        except Exception as e:
            logger.error(f"Error analyzing CSR content: {e}")
            return {"error": f"Analysis failed: {str(e)}"}
    
    def build_predictive_model(self, csrs: List[Dict[str, Any]], embeddings: Dict[int, np.ndarray], 
                             target_field: str, target_value: Any) -> Dict[str, Any]:
        """Build predictive model to identify CSRs with specific characteristics"""
        # Prepare data
        X = []
        y = []
        csr_ids = []
        
        for csr in csrs:
            csr_id = csr.get('id')
            if csr_id in embeddings:
                # Add embedding as features
                X.append(embeddings[csr_id])
                
                # Create target
                if target_field in csr:
                    target = 1 if csr[target_field] == target_value else 0
                elif 'details' in csr and target_field in csr['details']:
                    target = 1 if csr['details'][target_field] == target_value else 0
                else:
                    continue  # Skip if target not found
                
                y.append(target)
                csr_ids.append(csr_id)
        
        if not X or not y:
            return {"error": "Insufficient data for modeling"}
        
        # Convert to numpy arrays
        X = np.array(X)
        y = np.array(y)
        
        # Split data
        X_train, X_test, y_train, y_test, ids_train, ids_test = train_test_split(
            X, y, np.array(csr_ids), test_size=0.3, random_state=42, stratify=y if len(set(y)) > 1 else None
        )
        
        # Train models
        models = {
            "logistic_regression": LogisticRegression(max_iter=1000, class_weight='balanced'),
            "random_forest": RandomForestClassifier(n_estimators=100, class_weight='balanced')
        }
        
        results = {}
        
        for name, model in models.items():
            model.fit(X_train, y_train)
            y_pred = model.predict(X_test)
            
            accuracy = accuracy_score(y_test, y_pred)
            report = classification_report(y_test, y_pred, output_dict=True)
            
            # Get important features for random forest
            feature_importance = None
            if name == "random_forest":
                feature_importance = model.feature_importances_.tolist()
            
            # Save the model
            model_file = os.path.join(CSR_ANALYTICS_OUTPUT_DIR, f"csr_{target_field}_{name}_model.pkl")
            with open(model_file, 'wb') as f:
                pickle.dump(model, f)
            
            results[name] = {
                "accuracy": float(accuracy),
                "classification_report": report,
                "feature_importance": feature_importance,
                "model_file": model_file,
                "test_csr_ids": ids_test.tolist(),
                "test_predictions": y_pred.tolist(),
                "test_actuals": y_test.tolist()
            }
        
        return {
            "target_field": target_field,
            "target_value": target_value,
            "data_size": len(X),
            "positive_samples": int(sum(y)),
            "negative_samples": int(len(y) - sum(y)),
            "models": results
        }
    
    def mine_clinical_insights(self, csrs: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Mine insights from CSRs to build a knowledge base"""
        if not csrs:
            return {"error": "No CSRs provided"}
        
        # Initialize counters and collections
        insights = {
            "indications_summary": {},
            "phase_summary": {},
            "sponsor_summary": {},
            "study_design_patterns": {},
            "endpoint_frequency": {},
            "efficacy_by_indication": {},
            "safety_trends": {},
            "statistical_methods": {},
            "common_inclusion_criteria": {},
            "common_exclusion_criteria": {},
            "temporal_trends": {},
            "knowledge_map": []
        }
        
        # Process each CSR
        for csr in tqdm(csrs, desc="Mining clinical insights"):
            # Basic fields
            indication = csr.get('indication', 'Unknown')
            phase = csr.get('phase', 'Unknown') 
            sponsor = csr.get('sponsor', 'Unknown')
            year = None
            
            # Try to extract year from dates
            if 'date' in csr and csr['date']:
                try:
                    year = datetime.strptime(csr['date'], '%Y-%m-%d').year
                except:
                    pass
            
            if not year and 'uploadDate' in csr:
                try:
                    if isinstance(csr['uploadDate'], str):
                        year = datetime.strptime(csr['uploadDate'], '%Y-%m-%dT%H:%M:%S.%fZ').year
                    else:
                        # Assume datetime object
                        year = csr['uploadDate'].year
                except:
                    pass
            
            # Add to summary counters
            insights["indications_summary"][indication] = insights["indications_summary"].get(indication, 0) + 1
            insights["phase_summary"][phase] = insights["phase_summary"].get(phase, 0) + 1
            insights["sponsor_summary"][sponsor] = insights["sponsor_summary"].get(sponsor, 0) + 1
            
            # Get details if available
            if 'details' in csr and csr['details']:
                details = csr['details']
                
                # Study design
                study_design = details.get('studyDesign', 'Unknown')
                insights["study_design_patterns"][study_design] = insights["study_design_patterns"].get(study_design, 0) + 1
                
                # Endpoints
                if 'primaryEndpoint' in details and details['primaryEndpoint']:
                    primary_endpoint = details['primaryEndpoint']
                    insights["endpoint_frequency"][primary_endpoint] = insights["endpoint_frequency"].get(primary_endpoint, 0) + 1
                
                # Inclusion criteria
                if 'inclusionCriteria' in details and details['inclusionCriteria']:
                    inclusion_criteria = details['inclusionCriteria']
                    # Simple tokenization and counting
                    for criterion in inclusion_criteria.split('\n'):
                        criterion = criterion.strip()
                        if criterion:
                            insights["common_inclusion_criteria"][criterion] = insights["common_inclusion_criteria"].get(criterion, 0) + 1
                
                # Exclusion criteria
                if 'exclusionCriteria' in details and details['exclusionCriteria']:
                    exclusion_criteria = details['exclusionCriteria']
                    # Simple tokenization and counting
                    for criterion in exclusion_criteria.split('\n'):
                        criterion = criterion.strip()
                        if criterion:
                            insights["common_exclusion_criteria"][criterion] = insights["common_exclusion_criteria"].get(criterion, 0) + 1
                
                # Results
                if 'results' in details and details['results']:
                    # Add to efficacy by indication
                    if indication not in insights["efficacy_by_indication"]:
                        insights["efficacy_by_indication"][indication] = []
                    
                    insights["efficacy_by_indication"][indication].append({
                        "csr_id": csr['id'],
                        "results_summary": details['results'],
                        "phase": phase
                    })
            
            # Add to temporal trends if year is available
            if year:
                year_str = str(year)
                if year_str not in insights["temporal_trends"]:
                    insights["temporal_trends"][year_str] = {
                        "count": 0,
                        "indications": {},
                        "phases": {}
                    }
                
                insights["temporal_trends"][year_str]["count"] += 1
                insights["temporal_trends"][year_str]["indications"][indication] = insights["temporal_trends"][year_str]["indications"].get(indication, 0) + 1
                insights["temporal_trends"][year_str]["phases"][phase] = insights["temporal_trends"][year_str]["phases"].get(phase, 0) + 1
            
            # Add to knowledge map
            insights["knowledge_map"].append({
                "csr_id": csr['id'],
                "title": csr.get('title', 'Untitled'),
                "indication": indication,
                "phase": phase,
                "sponsor": sponsor,
                "year": year
            })
        
        # Sort and limit counters for readability
        for counter_key in ["indications_summary", "phase_summary", "sponsor_summary", "study_design_patterns", 
                           "endpoint_frequency", "common_inclusion_criteria", "common_exclusion_criteria"]:
            # Convert to sorted list of (key, count) tuples
            sorted_items = sorted(insights[counter_key].items(), key=lambda x: x[1], reverse=True)
            # Take top 30 items
            insights[counter_key] = dict(sorted_items[:30])
        
        # Generate visualization for temporal trends
        if insights["temporal_trends"]:
            years = sorted(insights["temporal_trends"].keys())
            counts = [insights["temporal_trends"][year]["count"] for year in years]
            
            plt.figure(figsize=(12, 6))
            plt.bar(years, counts)
            plt.title('CSRs by Year')
            plt.xlabel('Year')
            plt.ylabel('Number of CSRs')
            plt.savefig(os.path.join(CSR_ANALYTICS_OUTPUT_DIR, 'temporal_trends.png'))
            plt.close()
            
            insights["temporal_visualization"] = os.path.join(CSR_ANALYTICS_OUTPUT_DIR, 'temporal_trends.png')
        
        # Save insights to file
        insights_file = os.path.join(CSR_ANALYTICS_OUTPUT_DIR, 'csr_insights.json')
        with open(insights_file, 'w') as f:
            json.dump(insights, f, indent=2)
        
        insights["insights_file"] = insights_file
        return insights
    
    def generate_strategic_intelligence(self, csrs: List[Dict[str, Any]], query_indication: str) -> Dict[str, Any]:
        """Generate strategic intelligence report for a specific indication"""
        if not csrs:
            return {"error": "No CSRs provided"}
        
        # Filter CSRs by indication
        relevant_csrs = [csr for csr in csrs if csr.get('indication', '').lower() == query_indication.lower()]
        
        if not relevant_csrs:
            return {"error": f"No CSRs found for indication: {query_indication}"}
        
        # Generate embeddings if needed
        csr_embeddings = self.generate_csr_embeddings(relevant_csrs)
        
        # Identify clusters
        clusters = self.identify_csr_clusters(csr_embeddings)
        
        # Mine insights
        insights = self.mine_clinical_insights(relevant_csrs)
        
        # Analyze trends and patterns
        phases_distribution = {}
        sponsors_distribution = {}
        endpoints = {}
        designs = {}
        years_distribution = {}
        
        for csr in relevant_csrs:
            # Phase
            phase = csr.get('phase', 'Unknown')
            phases_distribution[phase] = phases_distribution.get(phase, 0) + 1
            
            # Sponsor
            sponsor = csr.get('sponsor', 'Unknown')
            sponsors_distribution[sponsor] = sponsors_distribution.get(sponsor, 0) + 1
            
            # Year
            year = None
            if 'date' in csr and csr['date']:
                try:
                    year = datetime.strptime(csr['date'], '%Y-%m-%d').year
                except:
                    pass
            
            if not year and 'uploadDate' in csr:
                try:
                    if isinstance(csr['uploadDate'], str):
                        year = datetime.strptime(csr['uploadDate'], '%Y-%m-%dT%H:%M:%S.%fZ').year
                    else:
                        # Assume datetime object
                        year = csr['uploadDate'].year
                except:
                    pass
            
            if year:
                year_str = str(year)
                years_distribution[year_str] = years_distribution.get(year_str, 0) + 1
            
            # Details
            if 'details' in csr and csr['details']:
                details = csr['details']
                
                # Endpoints
                if 'primaryEndpoint' in details and details['primaryEndpoint']:
                    endpoint = details['primaryEndpoint']
                    endpoints[endpoint] = endpoints.get(endpoint, 0) + 1
                
                # Study design
                if 'studyDesign' in details and details['studyDesign']:
                    design = details['studyDesign']
                    designs[design] = designs.get(design, 0) + 1
        
        # Create structured report 
        strategic_report = {
            "indication": query_indication,
            "report_date": datetime.now().strftime("%Y-%m-%d"),
            "summary": {
                "total_csrs": len(relevant_csrs),
                "phases_distribution": phases_distribution,
                "top_sponsors": dict(sorted(sponsors_distribution.items(), key=lambda x: x[1], reverse=True)[:5]),
                "top_endpoints": dict(sorted(endpoints.items(), key=lambda x: x[1], reverse=True)[:5]),
                "top_designs": dict(sorted(designs.items(), key=lambda x: x[1], reverse=True)[:5]),
                "temporal_distribution": years_distribution
            },
            "cluster_analysis": clusters,
            "insights": insights,
            "strategic_recommendations": self._generate_strategic_recommendations(relevant_csrs, query_indication),
            "competitive_landscape": self._analyze_competitive_landscape(relevant_csrs),
            "critical_success_factors": self._identify_success_factors(relevant_csrs)
        }
        
        # Save report
        report_file = os.path.join(CSR_ANALYTICS_OUTPUT_DIR, f'{query_indication.replace(" ", "_")}_strategic_report.json')
        with open(report_file, 'w') as f:
            json.dump(strategic_report, f, indent=2)
        
        strategic_report["report_file"] = report_file
        return strategic_report
    
    def _generate_strategic_recommendations(self, csrs: List[Dict[str, Any]], indication: str) -> List[Dict[str, Any]]:
        """Generate strategic recommendations based on CSR analysis"""
        api_url = f"https://api-inference.huggingface.co/models/{TEXT_MODEL_ID}"
        headers = {"Authorization": f"Bearer {self.hf_api_key}"}
        
        # Extract key data for the prompt
        phase_counts = {}
        endpoint_counts = {}
        design_counts = {}
        sample_sizes = []
        
        for csr in csrs:
            phase = csr.get('phase', 'Unknown')
            phase_counts[phase] = phase_counts.get(phase, 0) + 1
            
            if 'details' in csr and csr['details']:
                details = csr['details']
                
                if 'primaryEndpoint' in details and details['primaryEndpoint']:
                    endpoint = details['primaryEndpoint']
                    endpoint_counts[endpoint] = endpoint_counts.get(endpoint, 0) + 1
                
                if 'studyDesign' in details and details['studyDesign']:
                    design = details['studyDesign']
                    design_counts[design] = design_counts.get(design, 0) + 1
                
                if 'sampleSize' in details and details['sampleSize']:
                    try:
                        sample_size = int(details['sampleSize'])
                        sample_sizes.append(sample_size)
                    except:
                        pass
        
        # Prepare data summary
        top_phases = dict(sorted(phase_counts.items(), key=lambda x: x[1], reverse=True)[:3])
        top_endpoints = dict(sorted(endpoint_counts.items(), key=lambda x: x[1], reverse=True)[:3])
        top_designs = dict(sorted(design_counts.items(), key=lambda x: x[1], reverse=True)[:3])
        avg_sample_size = sum(sample_sizes) / len(sample_sizes) if sample_sizes else 0
        
        data_summary = {
            "indication": indication,
            "num_csrs": len(csrs),
            "top_phases": top_phases,
            "top_endpoints": top_endpoints,
            "top_designs": top_designs,
            "avg_sample_size": int(avg_sample_size)
        }
        
        # Prepare prompt
        prompt = f"""
        <s>[INST] You are a strategic advisor in clinical trial design and pharmaceutical R&D.
        
        Based on the analysis of {len(csrs)} Clinical Study Reports (CSRs) for {indication}, please provide strategic recommendations.
        
        Here is a summary of the data:
        - Total CSRs analyzed: {len(csrs)}
        - Top trial phases: {json.dumps(top_phases)}
        - Top primary endpoints: {json.dumps(top_endpoints)} 
        - Top study designs: {json.dumps(top_designs)}
        - Average sample size: {int(avg_sample_size)}
        
        Please provide 5 strategic recommendations for designing new clinical trials in {indication}, based on historical CSR data.
        
        For each recommendation, include:
        1. The recommendation
        2. The rationale based on historical data
        3. The potential impact on trial success
        
        Format your response as a JSON array of recommendation objects.
        [/INST]</s>
        """
        
        try:
            response = requests.post(
                api_url, 
                headers=headers, 
                json={
                    "inputs": prompt,
                    "parameters": {
                        "max_new_tokens": 1000,
                        "temperature": 0.3,
                        "return_full_text": False
                    }
                }
            )
            response.raise_for_status()
            
            result = response.json()
            generated_text = result[0]["generated_text"] if isinstance(result, list) else result["generated_text"]
            
            # Extract JSON content from the response
            try:
                # Look for JSON-like structure
                json_start = generated_text.find('[')
                json_end = generated_text.rfind(']') + 1
                if json_start >= 0 and json_end > json_start:
                    json_content = generated_text[json_start:json_end]
                    recommendations = json.loads(json_content)
                else:
                    # Fallback if JSON extraction fails
                    recommendations = [
                        {
                            "recommendation": "Consider using the most common endpoints for better comparability",
                            "rationale": f"The most used endpoints in {indication} trials are {', '.join(list(top_endpoints.keys())[:2])}",
                            "potential_impact": "Improved ability to benchmark against historical data"
                        },
                        {
                            "recommendation": f"Target a sample size of approximately {int(avg_sample_size)}",
                            "rationale": "Based on average sample size from historical trials",
                            "potential_impact": "Appropriate statistical power while maintaining efficiency"
                        }
                    ]
            except json.JSONDecodeError:
                # If JSON parsing fails, provide fallback recommendations
                recommendations = [
                    {
                        "recommendation": "Use established study designs for higher success probability",
                        "rationale": f"The most common study designs in {indication} are {', '.join(list(top_designs.keys())[:2])}",
                        "potential_impact": "Reduced regulatory risk and improved trial outcomes"
                    },
                    {
                        "recommendation": "Consider the optimal phase distribution for your development plan",
                        "rationale": f"Historical trials in {indication} have focused on {', '.join(list(top_phases.keys())[:2])} phases",
                        "potential_impact": "Strategic resource allocation aligned with industry practice"
                    }
                ]
                
            return recommendations
        except Exception as e:
            logger.error(f"Error generating recommendations: {e}")
            return [{"error": f"Failed to generate recommendations: {str(e)}"}]
    
    def _analyze_competitive_landscape(self, csrs: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze the competitive landscape from CSRs"""
        # Count CSRs by sponsor
        sponsor_counts = {}
        sponsor_phases = {}
        sponsor_years = {}
        
        for csr in csrs:
            sponsor = csr.get('sponsor', 'Unknown')
            phase = csr.get('phase', 'Unknown')
            
            # Count sponsors
            sponsor_counts[sponsor] = sponsor_counts.get(sponsor, 0) + 1
            
            # Track phases by sponsor
            if sponsor not in sponsor_phases:
                sponsor_phases[sponsor] = {}
            sponsor_phases[sponsor][phase] = sponsor_phases[sponsor].get(phase, 0) + 1
            
            # Try to extract year
            year = None
            if 'date' in csr and csr['date']:
                try:
                    year = datetime.strptime(csr['date'], '%Y-%m-%d').year
                except:
                    pass
            
            if not year and 'uploadDate' in csr:
                try:
                    if isinstance(csr['uploadDate'], str):
                        year = datetime.strptime(csr['uploadDate'], '%Y-%m-%dT%H:%M:%S.%fZ').year
                    else:
                        # Assume datetime object
                        year = csr['uploadDate'].year
                except:
                    pass
            
            if year:
                if sponsor not in sponsor_years:
                    sponsor_years[sponsor] = {}
                sponsor_years[sponsor][str(year)] = sponsor_years[sponsor].get(str(year), 0) + 1
        
        # Get top sponsors
        top_sponsors = dict(sorted(sponsor_counts.items(), key=lambda x: x[1], reverse=True)[:10])
        
        # Create competitive landscape
        landscape = {
            "top_sponsors": top_sponsors,
            "sponsor_phases": {sponsor: sponsor_phases.get(sponsor, {}) for sponsor in top_sponsors},
            "sponsor_activity_timeline": {sponsor: sponsor_years.get(sponsor, {}) for sponsor in top_sponsors},
            "market_concentration": {
                "top_3_share": sum(list(sponsor_counts.values())[:3]) / sum(sponsor_counts.values()) if sponsor_counts else 0,
                "top_5_share": sum(list(sponsor_counts.values())[:5]) / sum(sponsor_counts.values()) if sponsor_counts else 0,
                "total_sponsors": len(sponsor_counts)
            }
        }
        
        return landscape
    
    def _identify_success_factors(self, csrs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Identify critical success factors from CSRs"""
        # This would ideally use complex ML to identify factors associated with trial success
        # For now, we'll use a simplified approach
        
        # Extract key design elements and outcomes
        design_elements = []
        
        for csr in csrs:
            outcome = "Unknown"
            phase = csr.get('phase', 'Unknown')
            design = None
            endpoints = []
            sample_size = None
            
            if 'details' in csr and csr['details']:
                details = csr['details']
                
                # Study design
                if 'studyDesign' in details:
                    design = details['studyDesign']
                
                # Primary endpoint
                if 'primaryEndpoint' in details:
                    endpoints.append(details['primaryEndpoint'])
                
                # Secondary endpoints
                if 'secondaryEndpoints' in details and isinstance(details['secondaryEndpoints'], list):
                    endpoints.extend(details['secondaryEndpoints'])
                
                # Sample size
                if 'sampleSize' in details:
                    try:
                        sample_size = int(details['sampleSize'])
                    except:
                        pass
                
                # Results - look for indications of success or failure
                if 'results' in details and details['results']:
                    results = details['results'].lower()
                    if "statistically significant" in results and "primary endpoint" in results:
                        outcome = "Success"
                    elif "not statistically significant" in results and "primary endpoint" in results:
                        outcome = "Failure"
                    elif "met the primary endpoint" in results:
                        outcome = "Success"
                    elif "did not meet" in results and "primary endpoint" in results:
                        outcome = "Failure"
            
            # Add to design elements if we have enough data
            if design and endpoints and sample_size and outcome != "Unknown":
                design_elements.append({
                    "csr_id": csr['id'],
                    "phase": phase,
                    "design": design,
                    "endpoints": endpoints,
                    "sample_size": sample_size,
                    "outcome": outcome
                })
        
        # Analyze success rates by different factors
        success_by_design = {}
        success_by_phase = {}
        success_by_sample_size = {}
        
        for element in design_elements:
            # By design
            design = element['design']
            if design not in success_by_design:
                success_by_design[design] = {"success": 0, "failure": 0}
            
            if element['outcome'] == "Success":
                success_by_design[design]["success"] += 1
            elif element['outcome'] == "Failure":
                success_by_design[design]["failure"] += 1
            
            # By phase
            phase = element['phase']
            if phase not in success_by_phase:
                success_by_phase[phase] = {"success": 0, "failure": 0}
            
            if element['outcome'] == "Success":
                success_by_phase[phase]["success"] += 1
            elif element['outcome'] == "Failure":
                success_by_phase[phase]["failure"] += 1
            
            # By sample size range
            sample_size = element['sample_size']
            size_range = "Small (<100)" if sample_size < 100 else "Medium (100-300)" if sample_size < 300 else "Large (300+)"
            
            if size_range not in success_by_sample_size:
                success_by_sample_size[size_range] = {"success": 0, "failure": 0}
            
            if element['outcome'] == "Success":
                success_by_sample_size[size_range]["success"] += 1
            elif element['outcome'] == "Failure":
                success_by_sample_size[size_range]["failure"] += 1
        
        # Calculate success rates
        success_factors = []
        
        # By design
        for design, counts in success_by_design.items():
            total = counts["success"] + counts["failure"]
            if total >= 3:  # Only consider designs with sufficient data
                success_rate = counts["success"] / total if total > 0 else 0
                success_factors.append({
                    "factor": "Study Design",
                    "value": design,
                    "success_rate": success_rate,
                    "trials_count": total,
                    "impact": "High" if success_rate > 0.7 else "Medium" if success_rate > 0.5 else "Low"
                })
        
        # By phase
        for phase, counts in success_by_phase.items():
            total = counts["success"] + counts["failure"]
            if total >= 3:  # Only consider phases with sufficient data
                success_rate = counts["success"] / total if total > 0 else 0
                success_factors.append({
                    "factor": "Trial Phase",
                    "value": phase,
                    "success_rate": success_rate,
                    "trials_count": total,
                    "impact": "High" if success_rate > 0.7 else "Medium" if success_rate > 0.5 else "Low"
                })
        
        # By sample size
        for size_range, counts in success_by_sample_size.items():
            total = counts["success"] + counts["failure"]
            if total >= 3:  # Only consider sample sizes with sufficient data
                success_rate = counts["success"] / total if total > 0 else 0
                success_factors.append({
                    "factor": "Sample Size",
                    "value": size_range,
                    "success_rate": success_rate,
                    "trials_count": total,
                    "impact": "High" if success_rate > 0.7 else "Medium" if success_rate > 0.5 else "Low"
                })
        
        # Sort by success rate
        success_factors.sort(key=lambda x: x["success_rate"], reverse=True)
        
        return success_factors

# Command-line interface for testing
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='CSR Deep Learning Analysis')
    parser.add_argument('--function', type=str, required=True, 
                        choices=['embeddings', 'clusters', 'insights', 'strategic', 'patterns'],
                        help='Function to run')
    parser.add_argument('--indication', type=str, help='Indication for strategic analysis')
    
    args = parser.parse_args()
    
    # Initialize engine
    engine = CSRDeepLearningEngine()
    
    # Load CSRs
    csrs = []
    
    # This is a placeholder - in real use we would load from the database
    # For this example, we'll look for a JSON file with CSR data
    csr_file = 'data/csr_data.json'
    
    if os.path.exists(csr_file):
        with open(csr_file, 'r') as f:
            csrs = json.load(f)
        logger.info(f"Loaded {len(csrs)} CSRs from {csr_file}")
    else:
        logger.warning(f"CSR data file not found: {csr_file}")
    
    # Run the selected function
    if args.function == 'embeddings':
        embeddings = engine.generate_csr_embeddings(csrs[:10])  # Just do 10 for testing
        logger.info(f"Generated embeddings for {len(embeddings)} CSRs")
        
    elif args.function == 'clusters':
        embeddings = engine.generate_csr_embeddings(csrs[:100])  # Just do 100 for testing
        clusters = engine.identify_csr_clusters(embeddings)
        logger.info(f"Identified clusters in CSR data: {clusters.get('kmeans', {}).get('n_clusters')} kmeans clusters")
        
    elif args.function == 'insights':
        insights = engine.mine_clinical_insights(csrs[:100])  # Just do 100 for testing
        logger.info(f"Mined insights from CSR data. Insights file: {insights.get('insights_file')}")
        
    elif args.function == 'strategic':
        if not args.indication:
            logger.error("Indication must be specified for strategic analysis")
            sys.exit(1)
            
        strategic = engine.generate_strategic_intelligence(csrs, args.indication)
        logger.info(f"Generated strategic intelligence for {args.indication}. Report file: {strategic.get('report_file')}")
        
    elif args.function == 'patterns':
        embeddings = engine.generate_csr_embeddings(csrs[:100])  # Just do 100 for testing
        patterns = engine.discover_csr_patterns(csrs[:100], embeddings)
        logger.info(f"Discovered {len(patterns)} patterns in CSR data")