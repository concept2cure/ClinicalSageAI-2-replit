# D2 — the medical-writing advisor's EU RMP structure is the GVP Module V structure (2026-10-15)

Lane `…session_01SuVLo2`.

**Before.** Measured at `83138b464`, the advisor (`server/services/ana/medical-writing.ts`) listed an RMP as five parts of its own. It had no Part IV (plans for post-authorisation efficacy studies) and no Part VII (annexes). The platform's RMP outline is market-specs `risk_management_plan`, from EU GVP Module V and Commission Implementing Regulation (EU) 520/2012. `red/medical-writing-rmp.txt`: 1 of 1 red.

**After.** The RMP structure is the library's Parts I–VII, in order. `green/medical-writing-rmp.txt`: the new case and the 10 suites that load medical writing pass, 120 of 120.

**What else was compared.** The advisor's other structures were checked against the platform's records:
- the IB and the protocol were moved onto their records earlier today (`D2-ANA-IB-OUTLINE`, `D2-ANA-PROTOCOL-M11-CHAT`);
- the CSR already reads ICH E3;
- the clinical overview and clinical summary match M4E. The advisor's clinical overview includes 2.5.7 Literature References, which the library outline lacks. That fix is in the library, scheduled for after its 24-hour hold.
