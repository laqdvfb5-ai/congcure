import { test, expect } from "@playwright/test";
import { closePool, getPool } from "@web12/db";
import {
  addStock,
  createCategory,
  createProduct,
  getBankPaymentForUser,
  getUser,
  login,
  registerUser,
} from "@web12/core";

const stamp = Date.now();
let token: string;
let otherToken: string;
let userId: number;
let product: { id: number; slug: string; name: string };
test.beforeAll(async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  const category = await createCategory({
    name: `Bank ${stamp}`,
    slug: `bank-${stamp}`,
  });
  product = await createProduct({
    categoryId: category.id,
    name: `Bank checkout ${stamp}`,
    type: "STOCK",
    priceMember: 12000,
    priceCtv: 11000,
    priceAgent: 10000,
  });
  await addStock(product.id, [
    "bank-account-1|password",
    "bank-account-2|password",
    "bank-account-3|password",
    "bank-account-4|password",
  ]);
  const user = await registerUser({
    email: `bank-${stamp}@test.local`,
    password: "bank-test-password",
    name: "Bank test",
  });
  userId = user.id;
  token = (await login(user.email, "bank-test-password")).token;
  const other = await registerUser({
    email: `bank-other-${stamp}@test.local`,
    password: "bank-test-password",
    name: "Other",
  });
  otherToken = (await login(other.email, "bank-test-password")).token;
});
test.afterAll(async () => {
  await closePool();
});
test.beforeEach(async ({ page }) => {
  await page
    .context()
    .addCookies([{ name: "sid", value: token, url: "http://localhost:3002" }]);
  await page.route("https://img.vietqr.io/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1kAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
});

test("bank checkout pays the exact order without a wallet balance and delivers once after authenticated webhooks", async ({
  page,
  request,
  browser,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/san-pham/${product.slug}`);
  await expect(page.locator(".tier-grid")).toHaveCount(0);
  await expect(
    page.getByRole("radio", { name: /^Thanh toán bằng ví/ }),
  ).toBeChecked();
  await expect(
    page.getByRole("link", { name: "Nạp tiền vào ví" }),
  ).toBeVisible();
  await page.getByRole("radio", { name: /^Thanh toán ngay/ }).check();
  await page.getByRole("button", { name: "Tăng số lượng" }).click();
  await page
    .getByRole("button", { name: "Thanh toán ngay 24.000đ", exact: true })
    .click();
  await expect(page).toHaveURL(/\/thanh-toan\/DH[A-F0-9]{16}$/);
  const code = new URL(page.url()).pathname.split("/").pop()!;
  await expect(
    page.getByRole("img", { name: "QR thanh toán 24.000đ" }),
  ).toHaveAttribute("src", new RegExp(`amount=24000&addInfo=${code}`));
  await expect(page.locator("main")).not.toContainText(
    /CTV|Đại lý|nhà cung cấp/i,
  );
  expect((await getUser(userId))?.balance).toBe(0);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/bank-checkout-${width}.png`,
      fullPage: true,
    });
  }
  expect((await request.get(`/api/me/payments/${code}`)).status()).toBe(401);
  const other = await browser.newContext();
  await other.addCookies([
    { name: "sid", value: otherToken, url: "http://localhost:3002" },
  ]);
  expect(
    (
      await other.request.get(`http://localhost:3002/api/me/payments/${code}`)
    ).status(),
  ).toBe(404);
  await other.close();
  const receipt = {
    id: `bank-ui-${stamp}`,
    transferType: "in",
    transferAmount: 4000,
    content: code,
    accountNumber: "1234567890",
  };
  expect(
    (await request.post("/api/webhooks/bank", { data: receipt })).status(),
  ).toBe(401);
  const headers = { Authorization: `Apikey ${process.env.WEBHOOK_TOKEN}` };
  expect(
    (
      await request.post("/api/webhooks/bank", { headers, data: receipt })
    ).status(),
  ).toBe(200);
  await expect(
    page.getByRole("img", { name: "QR thanh toán 20.000đ" }),
  ).toBeVisible({ timeout: 15000 });
  expect((await getBankPaymentForUser(code, userId)).orderId).toBeNull();
  expect(
    (
      await (
        await request.post("/api/webhooks/bank", { headers, data: receipt })
      ).json()
    ).status,
  ).toBe("DUPLICATE");
  const final = {
    ...receipt,
    id: `bank-ui-final-${stamp}`,
    transferAmount: 20000,
  };
  await request.post("/api/webhooks/bank", { headers, data: final });
  await expect(page).toHaveURL(/\/don-hang\/\d+$/, { timeout: 15000 });
  await expect(
    page.getByText("bank-account-1|password", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("bank-account-2|password", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Phương thức thanh toán: Chuyển khoản ngân hàng"),
  ).toBeVisible();
  expect((await getUser(userId))?.balance).toBe(0);
});

test("quick buy offers bank payment, restores pending checkout and allows cancellation", async ({
  page,
}) => {
  await page.goto("/");
  const row = page.locator(".product-row").filter({ hasText: product.name });
  await row.getByRole("button", { name: "Mua ngay", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("radio", { name: /^Thanh toán ngay/ })
    .check();
  await page
    .getByRole("button", { name: "Thanh toán ngay 12.000đ", exact: true })
    .click();
  await expect(page).toHaveURL(/\/thanh-toan\/DH[A-F0-9]{16}$/);
  const path = new URL(page.url()).pathname;
  await page.goto("/don-hang");
  await page.locator(`a[href="${path}"]`).click();
  await expect(
    page.getByRole("img", { name: "QR thanh toán 12.000đ" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Hủy thanh toán", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Đã hủy thanh toán" }),
  ).toBeVisible();
  await expect(page.locator(".qr-frame")).toHaveCount(0);
});

test("expired checkout removes its QR and returns partial money to the wallet", async ({
  page,
}) => {
  await page.goto(`/san-pham/${product.slug}`);
  await page.getByRole("radio", { name: /^Thanh toán ngay/ }).check();
  await page
    .getByRole("button", { name: "Thanh toán ngay 12.000đ", exact: true })
    .click();
  await expect(page).toHaveURL(/\/thanh-toan\/DH[A-F0-9]{16}$/);
  const code = new URL(page.url()).pathname.split("/").pop()!;
  await page.request.post("/api/webhooks/bank", {
    headers: { Authorization: `Apikey ${process.env.WEBHOOK_TOKEN}` },
    data: {
      id: `expire-ui-${stamp}`,
      transferType: "in",
      transferAmount: 2000,
      content: code,
      accountNumber: "1234567890",
    },
  });
  await getPool().query(
    "UPDATE bank_payments SET expires_at = now() - interval '1 minute' WHERE code = $1",
    [code],
  );
  await expect(
    page.getByRole("heading", { name: "Mã thanh toán đã hết hạn" }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText("Đã ghi nhận 2.000đ vào ví của bạn."),
  ).toBeVisible();
  await expect(page.locator(".qr-frame")).toHaveCount(0);
  expect((await getUser(userId))?.balance).toBe(2000);
});
