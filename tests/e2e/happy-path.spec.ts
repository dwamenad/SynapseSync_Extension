import { expect, test } from "@playwright/test";

test("sign in, create doc, and see it in recent docs", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText(/Signed in as/i)).toBeVisible();

  const title = `E2E Doc ${Date.now()}`;
  await page
    .getByLabel("Message")
    .fill(`Create a doc titled ${title} with this content: Hello from test`);

  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(/Created \\"?/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open doc" }).first()).toBeVisible();
});

test("chat history persists and can be cleared", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText(/Signed in as/i)).toBeVisible();

  const prompt = `Create a doc titled Persisted ${Date.now()} with this content: Keep me`;
  await page.getByLabel("Message").fill(prompt);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText(prompt)).toBeVisible();

  await page.reload();
  await expect(page.getByText(prompt)).toBeVisible();

  await page.getByRole("button", { name: "Clear history" }).click();
  await expect(page.getByText(prompt)).toHaveCount(0);
});

test("folder picker modal can select a folder", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText(/Signed in as/i)).toBeVisible();

  await page.getByRole("button", { name: "Browse" }).click();
  await expect(page.getByRole("heading", { name: "Pick a Folder" })).toBeVisible();
  await page.getByRole("button", { name: "Select" }).first().click();
  await expect(page.getByLabel("Folder ID (optional)")).not.toHaveValue("");
});

test("connection phase flow generates matrix and synthesis", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText(/Signed in as/i)).toBeVisible();

  await page.evaluate(async () => {
    const csrfRes = await fetch("/api/csrf", { credentials: "include" });
    const csrfData = await csrfRes.json();
    const csrfToken = csrfData.csrfToken as string;

    let recentRes = await fetch("/api/google/recentDocs", { credentials: "include" });
    let recentData = await recentRes.json();
    if (!recentData.docs?.length) {
      await fetch("/api/chat", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken
        },
        body: JSON.stringify({
          message: "Create a doc titled Connection Phase E2E with this content: Seed doc"
        })
      });
      recentRes = await fetch("/api/google/recentDocs", { credentials: "include" });
      recentData = await recentRes.json();
    }

    const targetDocId = recentData.docs[0].documentId as string;
    for (let i = 0; i < 5; i += 1) {
      await fetch("/api/chat", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken
        },
        body: JSON.stringify({
          targetDocId,
          disciplineMode: true,
          paperData: {
            title: `E2E Paper ${i + 1}`,
            abstract:
              "Participants completed gain-loss decision trials in uncertain reward contexts.",
            methods: "Twenty participants completed an fMRI-based reversal-learning task.",
            discussion: "The model identified value-sensitive cortical dynamics.",
            conclusions: "Findings suggest gain-loss asymmetries in valuation.",
            url: `https://example.org/e2e-paper-${i + 1}`
          }
        })
      });
    }
  });

  await page.reload();
  await page.getByRole("button", { name: "Generate / Refresh Evidence Matrix" }).click();
  await expect(page.getByRole("link", { name: "Open Matrix" })).toBeVisible();

  const paperCheckboxes = page.locator("input[type='checkbox']");
  const checkboxCount = await paperCheckboxes.count();
  expect(checkboxCount).toBeGreaterThanOrEqual(5);
  for (let i = 0; i < 5; i += 1) {
    await paperCheckboxes.nth(i).check();
  }

  await page.getByRole("button", { name: "Synthesize Section" }).click();
  await expect(
    page.getByRole("link", { name: /Open appended synthesis in Google Doc/i })
  ).toBeVisible();
});
