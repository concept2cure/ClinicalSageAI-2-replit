"""Phase 7.0 — Document Renderers Package.

Import this package to auto-register all renderers with the render_runner.

Registered artifact types:
  - defense_packet_pdf      (Phase 7.0B)
  - se_matrix_pdf           (Phase 7.0E)
  - proof_pack_summary_pdf  (Phase 7.0E)
  - audit_trail_pdf         (Phase 7.0E)
  - ectd_sequence_zip       (Phase 7.0F)
"""

# Auto-register renderers on import — order does not matter
from . import defense_packet_pdf  # noqa: F401
from . import se_matrix_pdf  # noqa: F401
from . import proof_pack_summary_pdf  # noqa: F401
from . import audit_trail_pdf  # noqa: F401
from . import ectd_assembly  # noqa: F401
