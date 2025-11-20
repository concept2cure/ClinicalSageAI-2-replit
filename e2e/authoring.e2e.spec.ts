import { test, expect } from "@playwright/test";

/**
 * E2E Smoke: Document Authoring
 * Requires BASE_URL env and a document already openable in the UI.
 * You may need to adjust tab labels if your UI text differs.
 */
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

test("Document Authoring smoke: toolbar, insert token, drawers", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });

  // Navigate to CMC Wizard → Document Authoring tab
  // Adjust these selectors if your tab text differs.
  await page.getByText("CMC").first().click({ timeout: 10_000 }).catch(()=>{});
  await page.getByText("Document Authoring", { exact: false }).first().click();

  // Toolbar should be visible
  await expect(page.getByText("Run Validation")).toBeVisible();

  // Open Insert Token palette
  await page.getByText("Insert Token").click();
  await expect(page.getByText("Insert token")).toBeVisible();

  // Choose a common token like DP Specs (adjust if your palette displays different label)
  const choice = page.getByText(/DP Specifications|QUALITY\.SPECS\.DP/i).first();
  await choice.click();

  // A token block should appear (relies on Step 7 data attributes)
  const tokenBlock = page.locator('[data-token-key="QUALITY.SPECS.DP"]').first();
  await expect(tokenBlock).toBeVisible();

  // Evidence drawer opens
  await page.getByText("Evidence").click();
  await expect(page.getByText(/Evidence \(Citations\)/)).toBeVisible();
  await page.getByText("✕").first().click();

  // Diff drawers open
  await page.getByText("Diff since Sign").click();
  await expect(page.getByText(/Diff since last Sign/)).toBeVisible();
  await page.getByText("✕").first().click();

  await page.getByText("Diff since Export").click();
  await expect(page.getByText(/Diff since last Export/)).toBeVisible();
  await page.getByText("✕").first().click();

  // Section Data drawer: should list at least one token and Jump should not error
  await page.getByText(/^Data$/).click();
  await expect(page.getByText(/Section Data/)).toBeVisible();
  await page.getByText(/^Jump$/).first().click();
});