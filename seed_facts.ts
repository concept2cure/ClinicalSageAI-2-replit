
import 'dotenv/config';
import { db } from './server/db/index';
import { facts } from './shared/schema';

async function seed() {
  console.log("Seeding facts...");
  try {
      await db.insert(facts).values({
        factId: "fact-102",
        type: "clinical",
        key: "Primary Endpoint Results",
        value: "Study 102 demonstrated a 95% efficacy rate in reduction of systolic blood pressure (p < 0.001).",
        source: "Clinical Study Report 102 (Section 12.4)",
        confidence: 0.99
      });
      console.log("✅ Seeded Study 102 fact");

      await db.insert(facts).values({
        factId: "fact-005",
        type: "safety",
        key: "NOAEL (Rat)",
        value: "15 mg/kg/day",
        source: "Toxicology Report 005",
        confidence: 0.95
      });
      console.log("✅ Seeded NOAEL fact");
  } catch (e) {
      console.error("Error seeding (might be duplicate or schema issue):", e);
  }
  process.exit(0);
}

seed();
