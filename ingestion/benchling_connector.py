{
        "drug_name": "TestDrug",
        "manufacturing_site": "Site A",
        "batch_number": "BATCH123",
        "specifications": [
            {"parameter": "Assay (%)", "limit": ">95-105", "result": "98.2"},
            {"parameter": "Purity (%)", "limit": ">99.0", "result": "99.5"},
        ],
        "stability_data": [
            {"timepoint": "0-months", "result": "98.2"},
            {"timepoint": "3-months", "result": "97.8"},
            {"timepoint": "6-months", "result": "96.9"},
        ],
        "drug_substance_info": {
            "chemical_structure": "C20H24N2O2",
            "physicochemical_properties": "white crystalline powder; soluble in water",
            "synthesis_process": "Synthetic pathway using stepwise reactions with reagents X and Y."
        },
        "drug_product_info": {
            "formulation_composition": "5 mg active ingredient in capsule with microcrystalline cellulose and lactose.",
            "excipient_rationale": "Microcrystalline cellulose used as filler; lactose for stability and palatability.",
            "release_specifications": {
                "attribute": "Dissolution",
                "method": "USP II",
                "acceptance_criteria": ">=80% in 30 min",
                "result": "85%"
            }
        },
        "manufacturing_facility": {
            "locations": ["123 Pharma Way, Seattle, WA"],
            "equipment": ["Reactor-1000", "Filter-Dryer F-200"],
            "capacity": "500 kg/year"
        },
        "documentation": {
            "control_strategy": "Process controls include monitoring of reaction temperature and pH.",
            "record_keeping": "Batch records are maintained electronically with full traceability."
        }
    }