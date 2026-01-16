
import 'dotenv/config';
import { db } from './server/db/index';
import { facts } from './shared/schema';

async function seed() {
  console.log("Seeding facts...");
  try {
      await db.insert(facts).values({
        content: "Study 102 demonstrated a 95% efficacy rate in the primary endpoint (reduction of systolic blood pressure) compared to placebo (p < 0.001).",
        source: "Clinical Study Report 102 (Section 12.4)",
        category: "efficacy",
        tags: ["study-102", "efficacy", "blood-pressure"],
        confidence: 0.99
      });
      console.log("✅ Seeded Study 102 fact");

      await db.insert(facts).values({
        content: "The No Observed Adverse Effect Level (NOAEL) was determined to be 15 mg/kg/day based on the 28-day toxicity study in rats.",
        source: "Toxicology Report 005",
        category: "safety",
        tags: ["noael", "toxicity", "safety"],
        confidence: 0.95
      });
      console.log("✅ Seeded NOAEL fact");
  } catch (e) {
      console.error("Error seeding (might be duplicate or schema issue):", e);
  }
  process.exit(0);
}

seed();
