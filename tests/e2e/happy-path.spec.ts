import { expect, test } from "@playwright/test";

test("sign in, create doc, and see it in recent docs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Sign in with Google" }).click();

  await expect(page).toHaveURL(/\/dashboard/);

  const title = `E2E Doc ${Date.now()}`;
  await page
    .getByLabel("Message")
    .fill(`Create a doc titled ${title} with this content: Hello from test`);

  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(title)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open doc" }).first()).toBeVisible();
});
