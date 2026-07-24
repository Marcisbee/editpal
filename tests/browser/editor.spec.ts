import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
	await page.goto("/");
});

test("editor exposes accessible semantics and extension renderers", async ({ page }) => {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	await expect(editor).toHaveAttribute("aria-multiline", "true");
	await expect(page.locator("textarea[name='content']")).toHaveValue(
		/# Editpal Markdown/,
	);
	await expect(page.locator("[data-ep-inline-integration]")).toContainText(
		"Marcisbee/editpal",
	);
	await expect(page.locator("[data-ep-line-embed]")).toContainText(
		"Twitter / X embed demo",
	);
});

test("async mention suggestions insert a structured mention", async ({ page }) => {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	await editor.click();
	await page.keyboard.press("ControlOrMeta+End");
	await page.keyboard.press("Enter");
	await page.keyboard.type("@mar");
	const option = page.getByRole("option", { name: /marcis/i });
	await expect(option).toBeVisible();
	await option.click();
	await expect(editor.locator("[data-ep-mention='people']")).toContainText(
		"@marcis",
	);
});

test("typing, history, and task interaction stay model-backed", async ({ page }) => {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	await editor.click();
	await page.keyboard.press("ControlOrMeta+End");
	await page.keyboard.press("Enter");
	await page.keyboard.type("Browser history");
	await expect(editor).toContainText("Browser history");

	await page.keyboard.press("ControlOrMeta+z");
	await expect(editor).not.toContainText("Browser history");
	await page.keyboard.press("ControlOrMeta+Shift+z");
	await expect(editor).toContainText("Browser history");

	const task = editor.locator("[data-ep-todo-check]").first();
	const checked = await task.isChecked();
	await task.click();
	await expect(task).toBeChecked({ checked: !checked });
});

test("file picker uploads an image attachment", async ({ page }) => {
	const input = page.locator(".e-attachment-picker input[type=file]");
	await input.setInputFiles({
		name: "pixel.png",
		mimeType: "image/png",
		buffer: Buffer.from(
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4G8AAAAASUVORK5CYII=",
			"base64",
		),
	});
	await expect(page.locator("[data-ep-attachment='image']")).toBeVisible();
});

test("preview produces semantic lists and clickable labeled links", async ({ page }) => {
	await page.getByRole("button", { name: "Preview" }).click();
	await expect(page.locator("[data-ep-preview] ul > li").first()).toBeVisible();
	await expect(
		page.locator("[data-ep-preview] a[href='https://openai.com']"),
	).toContainText("OpenAI");
});
