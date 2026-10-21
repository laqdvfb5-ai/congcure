import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { closePool } from "@web12/db";
import {
  createCategory,
  getProduct,
  login,
  registerUser,
  setUserRole,
} from "@web12/core";

const stamp = Date.now();
const email = `images-${stamp}@test.local`;
const password = "image-test-password";
let customerId: number;
let categoryId: number;

test.beforeAll(async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  const admin = await registerUser({ email, password, name: "Image Admin" });
  await setUserRole(admin.id, "ADMIN");
  const customer = await registerUser({
    email: `image-customer-${stamp}@test.local`,
    password,
    name: "Image Customer",
  });
  customerId = customer.id;
  categoryId = (
    await createCategory({ name: `Images ${stamp}`, slug: `images-${stamp}` })
  ).id;
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

test("uploads from the computer, saves the cover and gallery, and removes a reference without losing the file", async ({
  page,
  request,
  browser,
}) => {
  test.setTimeout(90_000);
  await signIn(page);
  await page.goto("/admin/san-pham/moi");
  await page
    .getByLabel("Tên sản phẩm", { exact: true })
    .fill(`Canva ảnh ${stamp}`);
  await page
    .getByLabel("Danh mục", { exact: true })
    .selectOption(String(categoryId));
  for (const label of ["Thành viên", "CTV", "Đại lý"])
    await page.getByLabel(label, { exact: true }).fill("10000");
  const png = await sharp({
    create: { width: 200, height: 120, channels: 3, background: "#21734d" },
  })
    .png()
    .toBuffer();
  const jpeg = await sharp({
    create: { width: 160, height: 160, channels: 3, background: "#2b70a4" },
  })
    .jpeg()
    .toBuffer();

  await page.getByLabel("Chọn ảnh sản phẩm từ máy tính").setInputFiles([
    { name: "product.png", mimeType: "image/png", buffer: png },
    { name: "cover.jpg", mimeType: "image/jpeg", buffer: jpeg },
  ]);
  await expect(page.locator(".product-image-item")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Lưu sản phẩm" }),
  ).toBeEnabled();
  const originalOrder = await page
    .locator(".product-image-item > img")
    .evaluateAll((images) => images.map((image) => image.getAttribute("src")));
  await page.getByRole("button", { name: "Đặt ảnh 2 làm ảnh chính" }).click();
  await expect
    .poll(() =>
      page
        .locator(".product-image-item > img")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByText("Ảnh sản phẩm", { exact: true }).click();
  await page.locator(".product-images-editor").screenshot({
    path: "test-results/product-upload-mobile.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .locator(".product-images-editor")
    .screenshot({
      path: "test-results/product-upload-desktop.png",
      animations: "disabled",
    });
  await page.getByRole("button", { name: "Lưu sản phẩm" }).click();
  await expect(page).toHaveURL(/\/admin\/san-pham\/\d+\?ok=/);
  const id = Number(new URL(page.url()).pathname.split("/").pop());
  const saved = await getProduct(id);
  expect(saved?.images).toEqual([originalOrder[1], originalOrder[0]]);

  const imageResponse = await request.get(saved!.images[0]!);
  expect(imageResponse.ok()).toBe(true);
  expect(imageResponse.headers()["content-type"]).toBe("image/webp");
  expect(imageResponse.headers()["x-content-type-options"]).toBe("nosniff");
  expect((await sharp(await imageResponse.body()).metadata()).format).toBe(
    "webp",
  );
  const anonymous = await browser.newContext();
  const storefront = await anonymous.newPage();
  await storefront.goto("http://localhost:3002/san-pham/" + saved!.slug);
  await expect(storefront.locator(".product-media img")).toHaveAttribute(
    "src",
    saved!.images[0]!,
  );
  await expect
    .poll(() =>
      storefront
        .locator(".product-media img")
        .evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
    )
    .toBe(true);
  await storefront.getByRole("button", { name: "Xem ảnh sản phẩm 2" }).click();
  await expect(storefront.locator(".product-media img")).toHaveAttribute(
    "src",
    saved!.images[1]!,
  );
  await storefront.goto("http://localhost:3002/");
  await expect(
    storefront
      .locator(".product-row")
      .filter({ hasText: saved!.name })
      .locator(".product-thumbnail"),
  ).toHaveAttribute("src", saved!.images[0]!);
  await anonymous.close();

  await page.reload();
  await expect(page.locator(".product-image-item")).toHaveCount(2);
  await page.getByRole("button", { name: "Xóa ảnh 1", exact: true }).click();
  await page.getByRole("button", { name: "Lưu sản phẩm" }).click();
  await expect(
    page.locator('[role="status"]').filter({ hasText: "Đã lưu sản phẩm" }),
  ).toBeVisible();
  await expect
    .poll(async () => (await getProduct(id))?.images)
    .toEqual([saved!.images[1]]);
  expect((await request.get(saved!.images[0]!)).ok()).toBe(true);
});

test("rejects disguised files and oversized input in the upload form", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/admin/san-pham/moi");
  const input = page.getByLabel("Chọn ảnh sản phẩm từ máy tính");
  await input.setInputFiles({
    name: "fake.png",
    mimeType: "image/png",
    buffer: Buffer.from("<script>bad image</script>"),
  });
  await expect(
    page.locator(".product-images-editor").getByRole("alert"),
  ).toContainText("Ảnh bị lỗi");
  await expect(page.locator(".product-image-item")).toHaveCount(0);
  await input.setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
  });
  await expect(
    page.locator(".product-images-editor").getByRole("alert"),
  ).toContainText("tối đa 5 MB");
  await expect(page.locator(".product-image-item")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Lưu sản phẩm" }),
  ).toBeEnabled();
});

test("checks staff permission again at upload time", async ({ page }) => {
  const bytes = await sharp({
    create: { width: 10, height: 10, channels: 3, background: "#21734d" },
  })
    .png()
    .toBuffer();
  const file = { name: "photo.png", mimeType: "image/png", buffer: bytes };
  await signIn(page);
  await page.goto("/admin/san-pham/moi");
  await page.context().clearCookies();
  await page.getByLabel("Chọn ảnh sản phẩm từ máy tính").setInputFiles(file);
  await expect(page).toHaveURL(/\/dang-nhap$/);

  await signIn(page);
  await page.goto("/admin/san-pham/moi");
  const customerLogin = await login(
    `image-customer-${stamp}@test.local`,
    password,
  );
  expect(customerLogin.user.id).toBe(customerId);
  await page
    .context()
    .addCookies([
      { name: "sid", value: customerLogin.token, url: "http://localhost:3002" },
    ]);
  await page.getByLabel("Chọn ảnh sản phẩm từ máy tính").setInputFiles(file);
  await expect(page).toHaveURL("http://localhost:3002/");
});
