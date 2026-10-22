import http from "node:http";
import type { AddressInfo } from "node:net";
import { test, expect } from "@playwright/test";
import { closePool, getPool } from "@web12/db";
import {
  adjustBalance,
  createApiKey,
  createCategory,
  createProduct,
  createSupplier,
  login,
  registerUser,
} from "@web12/core";

const stamp = Date.now();
let server: http.Server;
let categorySlug: string;
let available: { id: number; slug: string; name: string };
let soldOut: { id: number; slug: string; name: string };
let unknown: { id: number; slug: string; name: string };
let token: string;
let apiKey: string;
let adminToken: string;
let calls = 0;

test.beforeAll(async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  server = http.createServer((req, res) => {
    if (
      req.method !== "GET" ||
      req.url !== "/api/products" ||
      req.headers["x-api-key"] !== "stock-key"
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    calls++;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        products: [
          {
            sku: "available",
            name: "Private upstream product",
            price: 999_999,
            stock: 7,
          },
          {
            sku: "empty",
            name: "Private empty product",
            price: 999_999,
            stock: 0,
          },
        ],
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const supplier = await createSupplier({
    name: "Private inventory provider",
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    apiKey: "stock-key",
  });
  const category = await createCategory({
    name: `Inventory ${stamp}`,
    slug: `inventory-${stamp}`,
  });
  categorySlug = category.slug;
  const base = {
    categoryId: category.id,
    type: "API" as const,
    supplierId: supplier.id,
    priceMember: 10_000,
    priceCtv: 10_000,
    priceAgent: 10_000,
  };
  available = await createProduct({
    ...base,
    name: `Canva available ${stamp}`,
    supplierSku: "available",
  });
  soldOut = await createProduct({
    ...base,
    name: `Canva empty ${stamp}`,
    supplierSku: "empty",
  });
  unknown = await createProduct({
    ...base,
    name: `Canva unknown ${stamp}`,
    supplierSku: "unknown",
  });
  const user = await registerUser({
    email: `stock-${stamp}@test.local`,
    password: "stock-test-password",
    name: "Stock Customer",
  });
  await adjustBalance(user.id, 100_000, "UI stock test", user.id);
  token = (await login(user.email, "stock-test-password")).token;
  apiKey = (await createApiKey(user.id, "stock API test")).key;
  const admin = await registerUser({ email: `stock-admin-${stamp}@test.local`, password: "stock-test-password", name: "Preorder Admin" });
  await getPool().query("UPDATE users SET role = 'ADMIN' WHERE id = $1", [admin.id]);
  adminToken = (await login(admin.email, "stock-test-password")).token;
});

test("customer preorders sold-out stock and admin delivers accounts", async ({ page }) => {
  await page.context().addCookies([{ name: "sid", value: token, url: "http://localhost:3002" }]);
  await page.goto("/danh-muc/" + categorySlug);
  await page.locator(".product-row").filter({ hasText: soldOut.name }).getByRole("button", { name: "Đặt trước" }).click();
  await expect(page.getByRole("dialog")).toContainText("thanh toán ngay, nhận tài khoản khi có hàng");
  await page.getByRole("dialog").getByRole("button", { name: /Đặt trước/ }).click();
  await expect(page).toHaveURL(/\/don-hang\/\d+$/);
  const orderUrl = page.url();
  const orderId = orderUrl.split("/").pop()!;
  await expect(page.getByText("Đơn đặt trước đang chờ hàng")).toBeVisible();

  await page.context().addCookies([{ name: "sid", value: adminToken, url: "http://localhost:3002" }]);
  await page.goto("/admin/don-hang?status=PREORDER");
  const row = page.locator("tr").filter({ has: page.locator(`input[name="orderId"][value="${orderId}"]`) });
  await row.getByRole("textbox").fill("preorder@example.test|secret");
  await row.getByRole("button", { name: "Giao hàng", exact: true }).click();
  await expect(page.getByText("Đã giao tài khoản cho khách")).toBeVisible();

  await page.context().addCookies([{ name: "sid", value: token, url: "http://localhost:3002" }]);
  await page.goto(orderUrl);
  await expect(page.locator(".status-badge")).toHaveText("Hoàn thành");
  await expect(page.locator("main")).toContainText("preorder@example.test|secret");
  await page.goto("/san-pham/" + soldOut.slug);
  await expect(page.getByRole("button", { name: /Đặt trước/ })).toBeEnabled();
});

test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await closePool();
});

test("shows live counts across catalog, detail, quick buy and reseller API without provider labels", async ({
  page,
  request,
}) => {
  await page
    .context()
    .addCookies([{ name: "sid", value: token, url: "http://localhost:3002" }]);
  await page.goto("/danh-muc/" + categorySlug);
  await expect(page.locator(".product-table-head")).toContainText("Tồn kho");
  const availableRow = page
    .locator(".product-row")
    .filter({ hasText: available.name });
  const emptyRow = page
    .locator(".product-row")
    .filter({ hasText: soldOut.name });
  const unknownRow = page
    .locator(".product-row")
    .filter({ hasText: unknown.name });
  await expect(availableRow.locator(".product-stock")).toHaveText("7");
  await expect(emptyRow.locator(".product-stock")).toHaveText("0");
  await expect(
    emptyRow.getByRole("button", { name: "Đặt trước" }),
  ).toBeEnabled();
  await expect(unknownRow.locator(".product-stock")).toHaveText(
    "Chưa cập nhật",
  );
  await expect(page.locator("main")).not.toContainText(
    /Nguồn API|Private inventory provider/,
  );
  await availableRow.getByRole("button", { name: "Mua ngay" }).click();
  await expect(page.getByRole("dialog")).toContainText("Tồn kho: 7");
  await expect(
    page.getByRole("spinbutton", { name: "Số lượng" }),
  ).toHaveAttribute("max", "7");
  await page.getByRole("button", { name: "Đóng thanh toán" }).click();
  await page.getByRole("checkbox", { name: "Còn hàng" }).check();
  await page.getByRole("button", { name: "Lọc", exact: true }).click();
  await expect(availableRow).toBeVisible();
  await expect(emptyRow).toHaveCount(0);
  await expect(unknownRow).toHaveCount(0);

  await page.goto("/san-pham/" + available.slug);
  await expect(
    page
      .locator(".product-specs > div")
      .filter({ has: page.locator("dt", { hasText: "Tồn kho" }) })
      .locator("dd"),
  ).toHaveText("7");
  await expect(
    page.getByRole("spinbutton", { name: "Số lượng" }),
  ).toHaveAttribute("max", "7");
  const response = await request.get("/api/v1/products", {
    headers: { "X-API-Key": apiKey },
  });
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(
    body.products.find((p: { id: number }) => p.id === available.id),
  ).toMatchObject({ stock: 7, price: 10_000 });
  expect(
    body.products.find((p: { id: number }) => p.id === soldOut.id).stock,
  ).toBe(0);
  expect(
    body.products.find((p: { id: number }) => p.id === unknown.id).stock,
  ).toBeNull();
  expect(calls).toBe(1);

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/danh-muc/" + categorySlug, { waitUntil: "networkidle" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .locator(".catalog-surface")
      .screenshot({
        path: `test-results/stock-${width}.png`,
        animations: "disabled",
      });
  }
});
