export type Field =
  | { key: string; label: string; type: "text" | "number" | "date" | "bool"; required?: boolean; unit?: string }
  | { key: string; label: string; type: "enum"; required?: boolean; options: string[] }
  | { key: "attachments"; label: "Attachments"; type: "file[]" };

export type Template = {
  id: string;
  when: (ctx: { categories: string[]; standard?: StandardRef }) => boolean;
  fields: Field[];
};

export type StandardRef = { 
  family: string; 
  code: string; 
  edition_year?: string; 
  clause?: string; 
  region?: string 
};

export const TEMPLATES: Template[] = [
  {
    id: "biocomp_cytotox",
    when: ({ categories, standard }) =>
      categories.some(c => c.includes("cytotox") || c.includes("biocompat")) && 
      (!standard || standard?.family === "ISO"),
    fields: [
      { key: "test_lab", label: "Test Lab", type: "text", required: true },
      { key: "test_date", label: "Test Date", type: "date", required: true },
      { key: "result", label: "Result", type: "enum", options: ["Pass", "Fail", "Not run"], required: true },
      { key: "contact_type", label: "Contact Type", type: "enum", options: ["Surface", "External Communicating", "Implant"] },
      { key: "contact_duration", label: "Contact Duration", type: "enum", options: ["Limited", "Prolonged", "Permanent"] },
      { key: "acceptance_criteria_ref", label: "Acceptance Criteria Ref", type: "text" },
      { key: "sample_id", label: "Sample ID", type: "text" },
      { key: "lot_batch", label: "Lot/Batch", type: "text" }
    ]
  },
  {
    id: "emc_60601_1_2",
    when: ({ categories, standard }) =>
      categories.some(c => c.includes("emc")) && 
      (!standard || (standard?.family === "IEC" && standard?.code.includes("60601"))),
    fields: [
      { key: "environment", label: "Intended Environment", type: "enum", options: ["Home", "Professional", "Emergency"], required: true },
      { key: "immunity_result", label: "Immunity Result", type: "enum", options: ["Pass", "Fail"], required: true },
      { key: "emissions_result", label: "Emissions Result", type: "enum", options: ["Pass", "Fail"], required: true },
      { key: "margin_db", label: "Margin", type: "number", unit: "dB" },
      { key: "test_config", label: "Test Configuration", type: "text" },
      { key: "clause", label: "Clause", type: "text" }
    ]
  },
  {
    id: "electrical_safety",
    when: ({ categories, standard }) =>
      categories.some(c => c.includes("electrical") || c.includes("60601-1")),
    fields: [
      { key: "clause", label: "Clause", type: "text", required: true },
      { key: "mopp_moop_level", label: "MOPP/MOOP Level", type: "enum", options: ["1xMOPP", "2xMOPP", "1xMOOP", "2xMOOP"], required: true },
      { key: "leakage_current", label: "Leakage Current (μA)", type: "number", required: true },
      { key: "dielectric_strength_result", label: "Dielectric Strength", type: "enum", options: ["Pass", "Fail"], required: true },
      { key: "protective_earth_check", label: "Protective Earth", type: "enum", options: ["Pass", "Fail", "N/A"] }
    ]
  },
  {
    id: "software_62304",
    when: ({ categories, standard }) =>
      categories.some(c => c.includes("software") || c.includes("62304")),
    fields: [
      { key: "software_class", label: "Software Class", type: "enum", options: ["Class A", "Class B", "Class C"], required: true },
      { key: "result", label: "Result", type: "enum", options: ["Pass", "Fail", "Not run"], required: true },
      { key: "soup_list", label: "SOUP List", type: "text" },
      { key: "defect_metrics", label: "Defect Metrics", type: "text" },
      { key: "trace_matrix_id", label: "Trace Matrix ID", type: "text" }
    ]
  },
  {
    id: "sterilization",
    when: ({ categories, standard }) =>
      categories.some(c => c.includes("ster") || c.includes("steril")),
    fields: [
      { key: "method", label: "Method", type: "enum", options: ["EO", "Radiation", "Moist Heat"], required: true },
      { key: "sal", label: "SAL (e.g., 10^-6)", type: "text", required: true },
      { key: "cycles", label: "Cycles", type: "number", required: true },
      { key: "residuals_check", label: "Residuals Check (EO)", type: "enum", options: ["Pass", "Fail", "N/A"] },
      { key: "result", label: "Result", type: "enum", options: ["Pass", "Fail"], required: true },
      { key: "load_config", label: "Load Configuration", type: "text" }
    ]
  }
];
