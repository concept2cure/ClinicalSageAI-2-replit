"""SE matrix and DOCX evidence generators.

Modules:
  - se_matrix_generator:      SE comparison payload builder
  - evidence_cell_renderer:   Render plan + actual python-docx table renderer
  - defense_manifest:         SHA-256 chain-of-custody manifest
  - docx_factory:             Full DOCX document renderer (cover + table + appendices)
  - defense_packet_builder:   ZIP builder (DOCX + manifest + questions + README)
"""
