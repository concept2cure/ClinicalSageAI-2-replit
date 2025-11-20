"""
Drug Similarity Module for TrialSage

This module provides molecular similarity analysis and protocol design recommendation
based on molecule characteristics and historical trial data.
"""

from typing import List, Dict, Any, Optional, Tuple
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
import json
import os
import logging
from collections import Counter, defaultdict

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Simulated molecule registry containing pharmacologic, mechanistic, and regulatory intelligence
REGISTRY_PATH = "data/molecule_registry.json"

class DrugSimilarityService:
    """Service to identify similar molecules and derive trial design recommendations"""
    
    def __init__(self, registry_path: str = REGISTRY_PATH):
        """Initialize the service with molecule registry data"""
        self.registry_path = registry_path
        self.molecule_db = self._load_registry()
        logger.info(f"Loaded {len(self.molecule_db)} molecules from registry")
    
    def _load_registry(self) -> List[Dict[str, Any]]:
        """Load the molecule registry from JSON file"""
        try:
            if os.path.exists(self.registry_path):
                with open(self.registry_path, "r") as f:
                    data = json.load(f)
                return data
            else:
                logger.warning(f"Registry file not found at {self.registry_path}, using fallback data")
                return self._get_fallback_data()
        except Exception as e:
            logger.error(f"Error loading molecule registry: {str(e)}")
            return self._get_fallback_data()
    
    def _get_fallback_data(self) -> List[Dict[str, Any]]:
        """Provide fallback data if registry file is not available"""
        return [
            {
                "name": "Semaglutide",
                "moa": "GLP-1 receptor agonist",
                "type": "Biologic",
                "origin": "Recombinant",
                "class": "GLP-1",
                "indication": "Obesity",
                "pk": {"half_life": 7.0, "route": "Subcutaneous"},
                "pd": ["ALT reduction", "A1c improvement"],
                "csr_links": ["CSR_2020_OBESITY_03", "CSR_2022_METABOLIC_01"],
                "success_rate": 0.88,
                "trial_design": {
                    "arms": 2,
                    "duration_weeks": 68,
                    "control_type": "Placebo",
                    "primary_endpoint": "Percent body weight change from baseline"
                }
            },
            {
                "name": "Obeticholic acid",
                "moa": "FXR agonist",
                "type": "Small Molecule",
                "origin": "Synthetic",
                "class": "FXR",
                "indication": "NASH",
                "pk": {"half_life": 4.5, "route": "Oral"},
                "pd": ["Fibrosis improvement", "ALT lowering"],
                "csr_links": ["CSR_2021_NASH_03"],
                "success_rate": 0.63,
                "trial_design": {
                    "arms": 3,
                    "duration_weeks": 72,
                    "control_type": "Placebo",
                    "primary_endpoint": "NASH resolution with no worsening of fibrosis"
                }
            }
        ]

    def vectorize_molecule(self, mol: Dict[str, Any]) -> List[float]:
        """Convert molecule data to numerical vector for similarity comparison"""
        # Basic vectorization - production version would use molecular fingerprints
        vector = [
            self._moa_to_vector(mol.get("moa", "")),
            self._class_to_vector(mol.get("class", "")),
            mol.get("pk", {}).get("half_life", 0) / 24.0,  # Normalize by max possible half-life
            len(mol.get("pd", [])) / 5.0,  # Normalize by max possible PD effects
            self._type_to_vector(mol.get("type", "")),
            self._origin_to_vector(mol.get("origin", "")),
            self._route_to_vector(mol.get("pk", {}).get("route", ""))
        ]
        return vector
    
    def _moa_to_vector(self, moa: str) -> float:
        """Convert MOA string to numerical representation"""
        moa_map = {
            "GLP-1 receptor agonist": 1.0,
            "GIP/GLP-1 dual receptor agonist": 0.9,
            "FXR agonist": 0.6,
            "CCR2/CCR5 antagonist": 0.5,
            "Thyroid hormone receptor-β agonist": 0.4,
            "FGF19 analog": 0.3,
            "FGF21 analog": 0.25,
            "GIP/GLP-1/Glucagon triple receptor agonist": 0.8,
            "MC4R agonist": 0.7
        }
        return moa_map.get(moa, 0.0)
    
    def _class_to_vector(self, mol_class: str) -> float:
        """Convert molecule class to numerical representation"""
        class_map = {
            "GLP-1": 1.0,
            "GIP/GLP-1": 0.9,
            "FXR": 0.7,
            "Chemokine receptor antagonist": 0.5,
            "THR-β agonist": 0.4,
            "FGF19": 0.3,
            "FGF21": 0.25,
            "GIP/GLP-1/Glucagon": 0.8,
            "Melanocortin-4 receptor agonist": 0.6
        }
        return class_map.get(mol_class, 0.0)
    
    def _type_to_vector(self, mol_type: str) -> float:
        """Convert molecule type to numerical representation"""
        type_map = {
            "Biologic": 1.0,
            "Small Molecule": 0.5,
            "Peptide": 0.8,
            "Antibody": 0.9,
            "Oligonucleotide": 0.3
        }
        return type_map.get(mol_type, 0.0)
    
    def _origin_to_vector(self, origin: str) -> float:
        """Convert molecule origin to numerical representation"""
        origin_map = {
            "Recombinant": 1.0,
            "Synthetic": 0.5,
            "Semi-synthetic": 0.7,
            "Natural": 0.3
        }
        return origin_map.get(origin, 0.0)
    
    def _route_to_vector(self, route: str) -> float:
        """Convert administration route to numerical representation"""
        route_map = {
            "Oral": 1.0,
            "Subcutaneous": 0.8,
            "Intravenous": 0.6,
            "Intramuscular": 0.7,
            "Topical": 0.4,
            "Inhalation": 0.5
        }
        return route_map.get(route, 0.0)

    def match_similar_molecules(self, query: Dict[str, Any], top_k: int = 3) -> List[Dict[str, Any]]:
        """Find molecules similar to the query molecule"""
        try:
            query_vec = np.array([self.vectorize_molecule(query)])
            scored = []

            for mol in self.molecule_db:
                mol_vec = np.array([self.vectorize_molecule(mol)])
                sim = cosine_similarity(query_vec, mol_vec)[0][0]
                
                # Only consider reasonably similar molecules (similarity > 0.3)
                if sim > 0.3:
                    scored.append({
                        "name": mol["name"],
                        "moa": mol["moa"],
                        "indication": mol["indication"],
                        "csr_links": mol.get("csr_links", []),
                        "similarity": round(float(sim), 2),
                        "success_rate": mol.get("success_rate", 0.5),
                        "trial_design": mol.get("trial_design", {})
                    })

            scored.sort(key=lambda x: x["similarity"], reverse=True)
            return scored[:top_k]
        except Exception as e:
            logger.error(f"Error matching similar molecules: {str(e)}")
            return []

    def generate_design_recommendation(self, query: Dict[str, Any], session_id: Optional[str] = None) -> Dict[str, Any]:
        """Generate trial design recommendations based on similar molecules"""
        try:
            similar_molecules = self.match_similar_molecules(query, top_k=5)
            
            if not similar_molecules:
                return {
                    "status": "error",
                    "message": "No similar molecules found to base recommendations on",
                    "session_id": session_id
                }
            
            # Extract design attributes from similar molecules
            designs = [m.get("trial_design", {}) for m in similar_molecules]
            design_attributes = self._aggregate_design_attributes(designs, similar_molecules)
            
            return {
                "status": "success",
                "session_id": session_id,
                "query_molecule": {
                    "name": query.get("name", "Unknown"),
                    "moa": query.get("moa", "Unknown"),
                    "type": query.get("type", "Unknown")
                },
                "similar_molecules": similar_molecules,
                "design_recommendation": design_attributes,
                "evidence_count": len(similar_molecules),
                "confidence_score": round(sum(m["similarity"] for m in similar_molecules) / len(similar_molecules), 2)
            }
        except Exception as e:
            logger.error(f"Error generating design recommendation: {str(e)}")
            return {
                "status": "error",
                "message": f"Failed to generate recommendation: {str(e)}",
                "session_id": session_id
            }
    
    def _aggregate_design_attributes(self, designs: List[Dict[str, Any]], molecules: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Aggregate design attributes from multiple similar molecules"""
        # Helper function to calculate weighted average
        def weighted_average(values: List[float], weights: List[float]) -> float:
            return sum(v * w for v, w in zip(values, weights)) / sum(weights)
        
        # Extract weights (similarities) from molecules
        weights = [m["similarity"] for m in molecules]
        
        # Extract numeric attributes with weighted average
        arms = [d.get("arms", 2) for d in designs]
        durations = [d.get("duration_weeks", 52) for d in designs]
        
        # Extract categorical attributes with weighted voting
        control_types = [d.get("control_type", "Placebo") for d in designs]
        primary_endpoints = [d.get("primary_endpoint", "") for d in designs]
        secondary_endpoints = []
        for d in designs:
            if d.get("secondary_endpoints"):
                secondary_endpoints.extend(d.get("secondary_endpoints", []))
        
        # Count occurrences for categorical attributes
        control_counter = Counter(control_types)
        endpoint_counter = Counter(primary_endpoints)
        secondary_counter = Counter(secondary_endpoints)
        
        # Get most common values
        most_common_control = control_counter.most_common(1)[0][0]
        most_common_endpoint = endpoint_counter.most_common(1)[0][0]
        most_common_secondary = [item[0] for item in secondary_counter.most_common(3)]
        
        # Calculate weighted numeric values
        avg_arms = round(weighted_average(arms, weights))
        avg_duration = round(weighted_average(durations, weights))
        
        return {
            "arms": avg_arms,
            "duration_weeks": avg_duration,
            "control_type": most_common_control,
            "primary_endpoint": most_common_endpoint,
            "secondary_endpoints": most_common_secondary,
            "dose_estimation": self._estimate_dosing(molecules),
            "success_probability": round(weighted_average([m.get("success_rate", 0.5) for m in molecules], weights), 2),
            "evidence_sources": len(molecules)
        }
    
    def _estimate_dosing(self, molecules: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Estimate appropriate dosing based on similar molecules"""
        doses = []
        for mol in molecules:
            if mol.get("trial_design") and mol.get("trial_design").get("typical_doses"):
                doses.extend(mol.get("trial_design").get("typical_doses", []))
        
        route = Counter([mol.get("pk", {}).get("route", "Oral") for mol in molecules]).most_common(1)[0][0]
        
        if not doses:
            return {
                "route": route,
                "doses": [],
                "frequency": "Unknown"
            }
        
        # Extract numeric values and units
        dose_values = []
        dose_units = []
        frequencies = []
        
        for dose in doses:
            if isinstance(dose, str):
                parts = dose.split("/")
                if len(parts) == 2:
                    dose_val = parts[0].strip()
                    freq = parts[1].strip()
                    
                    # Extract numeric part and unit
                    for i, char in enumerate(dose_val):
                        if not (char.isdigit() or char == '.'):
                            numeric_part = dose_val[:i]
                            unit_part = dose_val[i:]
                            if numeric_part:
                                dose_values.append(float(numeric_part))
                                dose_units.append(unit_part)
                                frequencies.append(freq)
                            break
        
        if not dose_values:
            return {
                "route": route,
                "doses": [],
                "frequency": "Unknown"
            }
        
        # Find most common unit and frequency
        most_common_unit = Counter(dose_units).most_common(1)[0][0]
        most_common_freq = Counter(frequencies).most_common(1)[0][0]
        
        # Filter doses with the same unit
        filtered_values = [v for v, u in zip(dose_values, dose_units) if u == most_common_unit]
        
        if not filtered_values:
            return {
                "route": route,
                "doses": [],
                "frequency": most_common_freq
            }
        
        # Calculate low, medium, high doses
        filtered_values.sort()
        if len(filtered_values) >= 3:
            recommended = [filtered_values[0], filtered_values[len(filtered_values)//2], filtered_values[-1]]
        else:
            recommended = filtered_values
        
        formatted_doses = [f"{dose}{most_common_unit}/{most_common_freq}" for dose in recommended]
        
        return {
            "route": route,
            "doses": formatted_doses,
            "frequency": most_common_freq
        }


# Example usage when run directly
if __name__ == "__main__":
    service = DrugSimilarityService()
    
    # Example query molecule
    test_molecule = {
        "name": "TestDrug",
        "moa": "GLP-1 receptor agonist",
        "type": "Biologic",
        "origin": "Recombinant",
        "class": "GLP-1",
        "indication": "Obesity",
        "pk": {"half_life": 6.0, "route": "Subcutaneous"},
        "pd": ["A1c improvement"]
    }
    
    # Get similar molecules
    similar = service.match_similar_molecules(test_molecule)
    print(json.dumps(similar, indent=2))
    
    # Generate design recommendation
    recommendation = service.generate_design_recommendation(test_molecule)
    print(json.dumps(recommendation, indent=2))