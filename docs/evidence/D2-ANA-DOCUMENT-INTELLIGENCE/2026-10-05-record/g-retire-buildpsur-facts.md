# g-retire-buildpsur — facts relied on

Checked 2026-10-05. "Search snippet" means the text came from a WebSearch result
on the regulator-hosted URL; the PDF itself was not opened (regulator sites are
blocked for WebFetch). "Recall" means it was not checked against regulator text.

| # | Fact | Basis | Used for |
|---|------|-------|----------|
| 1 | MDR Art 86(1): a PSUR states the volume of sales of the device and an estimate of the size and other characteristics of the population using it. | Search snippet of MDCG 2022-21, which quotes Art 86(1): https://health.ec.europa.eu/system/files/2023-01/mdcg_2022-21_en.pdf (checked 2026-10-05). Art 86 text itself: recall. | The canonical PSUR's `volumeOfSales` field is the place the sponsor's units-placed-on-market figure goes. |
| 2 | For the PSUR, "devices placed on the market" may be volumes of sales, units shipped, units implanted or another suitable indicator, used consistently through the PSUR. | Search snippet, same MDCG 2022-21 URL (checked 2026-10-05). | `PsurExposureFigures.unitsPlacedOnMarket` is a sponsor-supplied count; the engine does not choose the indicator. |
| 3 | The PSUR reports both the absolute number and the rate of serious incidents; the denominator is the number of devices, or a manufacturer-reasoned alternative (e.g. reusable instruments). | Search snippet, same MDCG 2022-21 URL (checked 2026-10-05). | `computePsurIncidentRate` (serious incidents / units placed on the market) and the `seriousIncidentRate` content field carrying both the count and the rate. Region split (EEA+TR+XI vs worldwide) is NOT implemented; recorded as a gap, not claimed. |
| 4 | IVDR Art 81 is the IVD counterpart of MDR Art 86 (PSUR for Class C and D). | Recall; consistent with the repo's own knowledge base (server/services/ivd-knowledge/regulatory/eu-ivdr.ts) and with the verified finding (index 65). | Unchanged: the canonical PSUR already cites "MDR Article 86 / IVDR Article 81". |

## Not a regulatory fact, a defect in the retired code

`buildPsur` rounded the rate to 6 decimals (`Math.round(x * 1e6) / 1e6`), so one
serious incident over 10,000,000 units reported a rate of 0. The canonical
`computePsurIncidentRate` does not round, returns `null` (not 0) when no units
were placed on the market, and accepts more incidents than units (incidents in
the period can involve units placed on the market in earlier periods).
