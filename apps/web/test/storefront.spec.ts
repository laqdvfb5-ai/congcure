import { test, expect, type Page } from "@playwright/test";
import { closePool } from "@web12/db";
import {
  addStock,
  adjustBalance,
  createCategory,
  createProduct,
  createSupplier,
  createApiKey,
  completeApiOrder,
  getProductBySlug,
  getUser,
  listOrdersForUser,
  registerUser,
  purchase,
  refundOrder,
  setUserRole,
} from "@web12/core";

const stamp = Date.now();
const email = `ui-${stamp}@test.local`;
const password = "ui-test-password";
let userId: number;
let productId: number;
let productSlug: string;
let apiSlug: string;
let supplierId: number;

test.beforeEach(async ({ page }) => {
  await page.route("https://img.vietqr.io/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG1kAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
});

test.beforeAll(async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  const user = await registerUser({ email, password, name: "UI Test" });
  userId = user.id;
  await setUserRole(userId, "ADMIN");
  await adjustBalance(userId, 200_000, "UI test credit", userId);
  const category = await createCategory({
    name: `UI ${stamp}`,
    slug: `ui-${stamp}`,
  });
  const product = await createProduct({
    categoryId: category.id,
    name: `Gmail UI ${stamp}`,
    type: "STOCK",
    priceMember: 10_000,
    priceCtv: 9_000,
    priceAgent: 8_000,
  });
  productId = product.id;
  productSlug = product.slug;
  await addStock(productId, [
    "ui-account-1|password-1",
    "ui-account-2|password-2",
    "ui-account-3|password-3",
  ]);
  const supplier = await createSupplier({
    name: "UI mock",
    baseUrl: "http://127.0.0.1:1",
    apiKey: "ui-mock-key",
  });
  supplierId = supplier.id;
  const api = await createProduct({
    categoryId: category.id,
    name: `Netflix UI ${stamp}`,
    type: "API",
    supplierId,
    supplierSku: "ui",
    priceMember: 5_000,
    priceCtv: 5_000,
    priceAgent: 5_000,
  });
  apiSlug = api.slug;
});
test.afterAll(async () => {
  await closePool();
});

async function signIn(page: Page) {
  await page.goto("/dang-nhap");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/localhost:3002\/$/);
}

test("quick purchase charges selected quantity and delivers downloadable accounts", async ({
  page,
}) => {
  await signIn(page);
  const row = page
    .locator(".product-row")
    .filter({ hasText: `Gmail UI ${stamp}` });
  await row.getByRole("button", { name: "Mua ngay" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Tăng số lượng" }).click();
  await expect(dialog.locator(".purchase-total")).toContainText("20.000đ");
  await dialog.getByRole("button", { name: "Thanh toán 20.000đ" }).click();
  await expect(page).toHaveURL(/\/don-hang\/\d+$/);
  await expect(
    page.getByText("ui-account-1|password-1", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("ui-account-2|password-2", { exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Tải .txt" }).click();
  expect((await download).suggestedFilename()).toBe("congcure-tai-khoan.txt");
  expect((await getUser(userId))?.balance).toBe(180_000);
});

test("pending orders refresh after fulfillment and status endpoint enforces ownership", async ({
  page,
  request,
  browser,
}) => {
  await signIn(page);
  await page.goto("/san-pham/" + apiSlug);
  await page.getByRole("button", { name: "Thanh toán 5.000đ" }).click();
  await expect(page).toHaveURL(/\/don-hang\/\d+$/);
  await expect(page.getByText("Đơn hàng đang được xử lý")).toBeVisible();
  const id = Number(new URL(page.url()).pathname.split("/").pop());
  expect((await request.get("/api/me/orders/" + id)).status()).toBe(401);
  const other = await registerUser({
    email: `other-${stamp}@test.local`,
    password,
    name: "Other",
  });
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  await otherPage.goto("http://localhost:3002/dang-nhap");
  await otherPage.getByLabel("Email", { exact: true }).fill(other.email);
  await otherPage.getByLabel("Mật khẩu", { exact: true }).fill(password);
  await otherPage
    .getByRole("button", { name: "Đăng nhập", exact: true })
    .click();
  await expect(otherPage).toHaveURL(/localhost:3002\/$/);
  expect(
    (
      await otherContext.request.get(
        "http://localhost:3002/api/me/orders/" + id,
      )
    ).status(),
  ).toBe(404);
  await otherContext.close();
  await completeApiOrder(id, ["delivered-by-ui-test|secret"], "ui-ref");
  await expect(
    page.getByText("delivered-by-ui-test|secret", { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
});

test("wallet observes balance changes and API keys stay out of URLs", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/nap-tien");
  await page.getByRole("button", { name: "Số khác", exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Số tiền tùy chọn" })
    .fill("123000");
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  await expect(
    page.getByRole("img", { name: "QR nạp 123.000đ" }),
  ).toHaveAttribute("src", /amount=123000/);
  await adjustBalance(userId, 12_000, "UI polling test", userId);
  await expect(page.getByText("Số dư ví đã tăng 12.000đ.")).toBeVisible({
    timeout: 15_000,
  });
  await page.goto("/tai-khoan");
  await page.getByLabel("Tên khóa API").fill("UI key");
  await page.getByRole("button", { name: "Tạo khóa", exact: true }).click();
  await expect(page.getByText("Khóa API mới", { exact: true })).toBeVisible();
  expect(page.url()).not.toContain("sk_");
  await expect(
    page.getByRole("cell", { name: "UI key", exact: true }),
  ).toBeVisible();
});

test("TOTP matches the RFC 6238 SHA1 vector without sending the secret", async ({
  page,
}) => {
  await page.clock.install({ time: new Date(59_000) });
  await page.clock.pauseAt(new Date(59_000));
  await page.goto("/cong-cu/2fa");
  const requests: string[] = [];
  page.on("request", (req) =>
    requests.push(req.url() + (req.postData() ?? "")),
  );
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  await page.getByLabel("Secret key").fill(secret);
  await expect(page.locator(".totp-code")).toHaveText("287 082");
  expect(requests.some((r) => r.includes(secret))).toBe(false);
  await page.getByRole("button", { name: "Xóa secret" }).click();
  await expect(page.locator(".totp-code")).toHaveText("--- ---");
});

test("customer pages and API responses keep supplier details in admin only", async ({
  page,
  request,
}) => {
  await signIn(page);
  for (const path of ["/", "/san-pham/" + apiSlug, "/chinh-sach"]) {
    await page.goto(path);
    await expect(page.locator("main")).not.toContainText(
      /Nguồn API|nhà cung cấp|giao từ nguồn/i,
    );
  }
  await page.goto("/");
  await page
    .locator(".product-row")
    .filter({ hasText: `Netflix UI ${stamp}` })
    .getByRole("button", { name: "Mua ngay" })
    .click();
  await expect(page.getByRole("dialog")).not.toContainText(
    /nguồn|nhà cung cấp/i,
  );
  await page.getByRole("button", { name: "Đóng thanh toán" }).click();

  const product = await getProductBySlug(apiSlug);
  const order = await purchase(userId, product!.id, 1);
  const internalError =
    "Nhà cung cấp Private Vendor: https://provider-private.invalid/orders failed";
  await refundOrder(order.id, internalError);
  await page.goto("/don-hang/" + order.id);
  await expect(page.locator("main")).toContainText(
    "Số tiền đã được hoàn vào ví.",
  );
  expect(await page.content()).not.toContain("provider-private.invalid");
  const { key } = await createApiKey(userId, "privacy test");
  const response = await request.get("/api/v1/orders/" + order.id, {
    headers: { "X-API-Key": key },
  });
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.order.error).toContain("Số tiền đã được hoàn vào ví.");
  expect(JSON.stringify(body)).not.toContain("provider-private.invalid");

  await page.goto("/admin/don-hang?status=REFUNDED");
  await expect(page.getByText(internalError, { exact: true })).toBeVisible();
  await page.goto("/admin/san-pham");
  await expect(
    page.getByRole("cell", { name: "Nguồn API", exact: true }).first(),
  ).toBeVisible();
});

test("customer and admin views fit mobile and desktop in both themes", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await signIn(page);
  const order = (await listOrdersForUser(userId))[0];
  const routes = [
    "/",
    "/san-pham/" + productSlug,
    "/don-hang",
    ...(order ? ["/don-hang/" + order.id] : []),
    "/nap-tien",
    "/tai-khoan",
    "/chinh-sach",
    "/cong-cu/2fa",
    "/admin",
    "/admin/san-pham",
    "/admin/san-pham/moi",
    "/admin/san-pham/" + productId,
    "/admin/danh-muc",
    "/admin/don-hang",
    "/admin/nguoi-dung",
    "/admin/giao-dich",
    "/admin/nha-cung-cap",
    "/admin/nha-cung-cap/" + supplierId + "/san-pham",
  ];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("main h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        route + " at " + width,
      ).toBe(true);
    }
    await page.goto("/");
    await page
      .getByRole("button", { name: "Đổi giao diện sáng / tối" })
      .click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.screenshot({
      path: "test-results/home-" + width + "-dark.png",
      fullPage: true,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Đổi giao diện sáng / tối" })
      .click();
    await page.screenshot({
      path: "test-results/home-" + width + "-light.png",
      fullPage: true,
      animations: "disabled",
    });
  }
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Mở menu" }).click();
  await expect(
    page.getByRole("dialog", { name: "Menu điều hướng" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Đóng menu" }).click();
  await expect(
    page.getByRole("dialog", { name: "Menu điều hướng" }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Mở menu" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Đăng xuất", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Đăng ký", exact: true }),
  ).toBeVisible();
});
