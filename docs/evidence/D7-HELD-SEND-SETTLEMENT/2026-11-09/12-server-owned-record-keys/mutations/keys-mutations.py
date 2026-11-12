"""F1 (P-92) server-owned record keys: each key's stamp removed alone, the guard's case run, the file restored by SHA-256 (cmut2.py)."""
import subprocess, sys, os
SP = os.path.dirname(os.path.abspath(__file__))
F = 'server/services/submission-gateways/index.ts'
T = 'server/services/submission-gateways/__tests__/transmit-records-what-was-sent.test.ts'
M = [(f'K{i+1}-{k}-not-stamped', F, T, 'signed act', f"          {k}: undefined,\n", "") for i, k in enumerate(['heldSendSettlement', 'technicalRejection', 'as2Receipt', 'as2ReceiptHistory'])]
for m in M:
    subprocess.run([sys.executable, os.path.join(SP, 'cmut2.py'), *m], check=False)
