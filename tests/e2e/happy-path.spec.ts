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
