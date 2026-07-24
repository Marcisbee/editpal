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
	const listbox = page.getByRole("listbox", { name: "People" });
	expect(
		await listbox.evaluate((element) =>
			element.parentElement === document.body
		),
	).toBe(true);
	const box = await listbox.boundingBox();
	const viewport = page.viewportSize();
	expect(box).not.toBeNull();
	expect(viewport).not.toBeNull();
	expect(box!.x).toBeGreaterThanOrEqual(0);
	expect(box!.y).toBeGreaterThanOrEqual(0);
	expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
	expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
	await option.click();
	await expect(editor.locator("[data-ep-mention='people']")).toContainText(
		"@marcis",
	);
	await page.keyboard.type(" works");
	await expect(page.locator("textarea[name='content']")).toHaveValue(
		/@marcis works/,
	);
	for (let index = 0; index < " works".length; index++) {
		await page.keyboard.press("Backspace");
	}
	await page.keyboard.press("Backspace");
	await expect(editor.locator("[data-ep-mention='people']")).toHaveCount(0);
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

test("images and embeds expose contextual controls when selected", async ({ page }) => {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	await editor.locator("[data-t]").first().click();
	await expect(page.locator(".e-fl-toolbar")).toHaveCount(0);

	await editor.locator("[data-ep-link='https://openai.com']").evaluate(
		(element) => {
			const node = Array.from(element.childNodes).find((child) =>
				child.nodeType === Node.TEXT_NODE && child.textContent === "OpenAI"
			);
			if (!node) {
				throw new Error("Could not find link label");
			}
			const range = document.createRange();
			range.selectNodeContents(node);
			const selection = document.getSelection();
			selection?.removeAllRanges();
			selection?.addRange(range);
			document.dispatchEvent(new Event("selectionchange"));
		},
	);
	const linkToolbar = page.locator("[data-ep-context-toolbar='link']");
	await expect(linkToolbar.getByLabel("Link URL")).toHaveValue(
		"https://openai.com",
	);
	await linkToolbar.getByRole("button", { name: "Unlink" }).click();
	await expect(page.locator("textarea[name='content']")).toHaveValue(
		/OpenAI links and images are supported\./,
	);

	const markdownImage = page.locator("[data-ep-img]").first();
	await expect(markdownImage.locator("input")).toHaveCount(0);
	await markdownImage.click();
	const assetToolbar = page.locator("[data-ep-context-toolbar='asset']");
	await expect(assetToolbar).toBeVisible();
	await expect(assetToolbar.getByLabel("Image alt text")).toHaveValue(
		"Genji cyberdemon skin",
	);
	await assetToolbar.getByLabel("Image alt text").fill("Accessible artwork");
	await expect(page.locator("textarea[name='content']")).toHaveValue(
		/!\[Accessible artwork\]/,
	);

	const inlineIntegration = page.locator("[data-ep-inline-integration]")
		.first();
	expect(
		await inlineIntegration.evaluate((element) => {
			const style = getComputedStyle(element);
			return style.userSelect ||
				style.getPropertyValue("-webkit-user-select");
		}),
	).toBe("none");
	await inlineIntegration.click();
	await expect(linkToolbar.getByLabel("Link URL")).toHaveValue(
		"https://github.com/Marcisbee/editpal",
	);

	const lineEmbed = page.locator("[data-ep-line-embed]");
	expect(
		await lineEmbed.evaluate((element) => {
			const style = getComputedStyle(element);
			return style.userSelect ||
				style.getPropertyValue("-webkit-user-select");
		}),
	).toBe("none");
	await lineEmbed.click();
	await expect(linkToolbar.getByLabel("Link URL")).toHaveValue(
		"https://twitter.com/openai/status/123456789",
	);
});

test("text toolbar requires an explicit selection", async ({ page }) => {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	const selectText = async (
		needle: string,
		start: number,
		end: number = start,
	) => {
		await editor.evaluate((element, point) => {
			const walker = document.createTreeWalker(
				element,
				NodeFilter.SHOW_TEXT,
			);
			let node: Text | undefined;
			while (walker.nextNode()) {
				const candidate = walker.currentNode as Text;
				if (candidate.data.includes(point.needle)) {
					node = candidate;
					break;
				}
			}
			if (!node) {
				throw new Error(`Could not find ${point.needle}`);
			}
			const range = document.createRange();
			range.setStart(
				node,
				node.data.indexOf(point.needle) + point.start,
			);
			range.setEnd(
				node,
				node.data.indexOf(point.needle) + point.end,
			);
			const selection = document.getSelection();
			selection?.removeAllRanges();
			selection?.addRange(range);
			document.dispatchEvent(new Event("selectionchange"));
		}, { end, needle, start });
	};

	await editor.locator("[data-ep-h]").click();
	await selectText("Editpal Markdown", 2);
	await expect(page.locator(".e-fl-toolbar")).toHaveCount(0);

	await selectText("Editpal Markdown", 0, "Editpal".length);
	await expect(page.locator(".e-fl-toolbar")).toBeVisible();
	await page.getByRole("button", { name: "Bold" }).click();
	await expect(page.locator("textarea[name='content']")).toHaveValue(
		/^# \*\*Editpal\*\* Markdown/,
	);

	await editor.focus();
	await selectText("Markdown", 0, "Markdown".length);
	await page.getByRole("button", { name: "Link", exact: true }).click();
	await page.getByLabel("New link URL").fill("https://example.com/heading");
	await page.getByRole("button", { name: "Apply new link" }).click();
	await expect(page.locator("textarea[name='content']")).toHaveValue(
		/^# \*\*Editpal\*\* \[Markdown\]\(https:\/\/example\.com\/heading\)/,
	);

	const linkedHeading = editor.locator(
		"[data-ep-link='https://example.com/heading']",
	);
	await expect(
		page.locator("[data-ep-context-toolbar='link']"),
	).toBeVisible();
	await page.getByRole("button", { name: "Italic" }).click();
	await expect(linkedHeading).toHaveCSS("font-style", "italic");
});

test("plain URL paste links selected text and leaves a typing boundary", async ({ page }) => {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	await editor.click();
	await page.keyboard.press("ControlOrMeta+a");
	await page.keyboard.type("paste label");
	await editor.evaluate((element) => {
		const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
		let node: Text | null = null;
		while (walker.nextNode()) {
			const candidate = walker.currentNode as Text;
			if (candidate.data.includes("paste label")) {
				node = candidate;
			}
		}
		if (!node) {
			throw new Error("Could not find pasted-link label");
		}
		const start = node.data.indexOf("paste label");
		const range = document.createRange();
		range.setStart(node, start);
		range.setEnd(node, start + "paste label".length);
		const selection = document.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		document.dispatchEvent(new Event("selectionchange"));
		const data = new DataTransfer();
		data.setData("text/plain", "https://example.com/pasted");
		data.setData("text/markdown", "**ignored rich clipboard value**");
		const paste = new Event("paste", { bubbles: true, cancelable: true });
		Object.defineProperty(paste, "clipboardData", { value: data });
		element.dispatchEvent(paste);
	});
	await page.keyboard.type(" continues");

	await expect(page.locator("textarea[name='content']")).toHaveValue(
		/\[paste label\]\(https:\/\/example\.com\/pasted\) continues/,
	);
	await expect(
		editor.locator("[data-ep-link='https://example.com/pasted']"),
	).not.toContainText("continues");
});

test("URL paste creates Markdown links and integrations stay opt-in", async ({ page }) => {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	const pasteText = async (text: string) => {
		await editor.evaluate((element, value) => {
			const data = new DataTransfer();
			data.setData("text/plain", value);
			const paste = new Event("paste", { bubbles: true, cancelable: true });
			Object.defineProperty(paste, "clipboardData", { value: data });
			element.dispatchEvent(paste);
		}, text);
	};

	await editor.evaluate((element) => {
		(element as HTMLElement).focus();
		const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
		let node: Text | undefined;
		while (walker.nextNode()) {
			const candidate = walker.currentNode as Text;
			if (candidate.data.includes("Type @ to try")) {
				node = candidate;
				break;
			}
		}
		if (!node) {
			throw new Error("Could not find a plain URL paste point");
		}
		const range = document.createRange();
		range.setStart(node, node.data.length);
		range.collapse(true);
		const selection = document.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		document.dispatchEvent(new Event("selectionchange"));
	});
	await page.keyboard.press("Enter");
	await page.keyboard.type("Before ");
	const initialIntegrations = await editor.locator(
		"[data-ep-inline-integration]",
	).count();
	await pasteText("https://example.com/plain");
	await page.keyboard.type(" continues");

	await expect(page.locator("textarea[name='content']")).toHaveValue(
		/Before \[https:\/\/example\.com\/plain\]\(https:\/\/example\.com\/plain\) continues/,
	);
	await expect(editor.locator("[data-ep-url]")).toHaveCount(0);
	await expect(
		editor.locator("[data-ep-link='https://example.com/plain']"),
	).toBeVisible();
	await expect(editor.locator("[data-ep-inline-integration]")).toHaveCount(
		initialIntegrations,
	);

	await page.keyboard.press("Enter");
	await page.keyboard.type("Repository: ");
	await pasteText("https://github.com/openai/openai-node");
	const integration = editor.locator(
		"[data-ep-inline-integration='github-repository']",
	).last();
	await expect(editor.locator("[data-ep-inline-integration]")).toHaveCount(
		initialIntegrations + 1,
	);
	await expect(integration).toBeVisible();
	expect(
		await integration.evaluate((element) => {
			const style = getComputedStyle(element);
			return style.userSelect ||
				style.getPropertyValue("-webkit-user-select");
		}),
	).toBe("none");
	await expect(page.locator("textarea[name='content']")).toHaveValue(
		/Repository: \[https:\/\/github\.com\/openai\/openai-node\]\(https:\/\/github\.com\/openai\/openai-node\)/,
	);
});

test("pasted images are selectable and leave the caret on a new line", async ({ page }) => {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	await editor.click();
	await editor.evaluate((element) => {
		const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
		let node: Text | undefined;
		while (walker.nextNode()) {
			const candidate = walker.currentNode as Text;
			if (candidate.data.includes("Editpal Markdown")) {
				node = candidate;
				break;
			}
		}
		if (!node) {
			throw new Error("Could not find image paste point");
		}
		const range = document.createRange();
		range.setStart(node, node.data.length);
		range.collapse(true);
		const selection = document.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		document.dispatchEvent(new Event("selectionchange"));

		const data = new DataTransfer();
		const binary = atob(
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4G8AAAAASUVORK5CYII=",
		);
		const bytes = Uint8Array.from(
			binary,
			(character) => character.charCodeAt(0),
		);
		data.items.add(
			new File([bytes], "clipboard.png", { type: "image/png" }),
		);
		const paste = new Event("paste", { bubbles: true, cancelable: true });
		Object.defineProperty(paste, "clipboardData", { value: data });
		element.dispatchEvent(paste);
	});
	const attachment = editor.locator("[data-ep-attachment='image']").last();
	await expect(attachment).toBeVisible();
	expect(
		await attachment.evaluate((element) => {
			const style = getComputedStyle(element);
			return style.userSelect ||
				style.getPropertyValue("-webkit-user-select");
		}),
	).toBe("none");
	await page.keyboard.type("after pasted image");
	await expect(page.locator("textarea[name='content']")).toHaveValue(
		/!\[clipboard\.png\]\(blob:[^)]+\)\n\s*(?:(?:\d+\.)|(?:#{1,6}))?\s*after pasted image/,
	);

	await attachment.click();
	await expect(
		page.locator("[data-ep-context-toolbar='asset']"),
	).toBeVisible();
	await expect(attachment).toHaveAttribute("data-ep-s", "true");
});

test("code fences stay literal and reject rich editor elements", async ({ page }) => {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	const codeText = editor.locator("[data-ep-code] code [data-ep]").first();
	await editor.focus();

	await codeText.evaluate((element) => {
		const node = element.firstChild;
		if (!node || node.nodeType !== Node.TEXT_NODE) {
			throw new Error("Could not find code text");
		}
		const range = document.createRange();
		range.setStart(node, 0);
		range.setEnd(node, Math.min(5, node.textContent?.length || 0));
		const selection = document.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		document.dispatchEvent(new Event("selectionchange"));
	});

	const source = page.locator("textarea[name='content']");
	const before = await source.inputValue();
	await page.keyboard.press("ControlOrMeta+b");
	await expect(source).toHaveValue(before);
	await expect(page.locator(".e-fl-toolbar")).toHaveCount(0);

	await codeText.evaluate((element) => {
		const data = new DataTransfer();
		data.items.add(
			new File(["image"], "inside-code.png", { type: "image/png" }),
		);
		const paste = new Event("paste", { bubbles: true, cancelable: true });
		Object.defineProperty(paste, "clipboardData", { value: data });
		element.dispatchEvent(paste);
	});
	await expect(editor.locator("[data-ep-code] img")).toHaveCount(0);
	await expect(editor.locator("[data-ep-code] [data-ep-attachment]"))
		.toHaveCount(
			0,
		);
	await expect(source).toHaveValue(before);

	await codeText.evaluate((element) => {
		const data = new DataTransfer();
		data.setData("text/plain", "https://example.com/literal");
		const paste = new Event("paste", { bubbles: true, cancelable: true });
		Object.defineProperty(paste, "clipboardData", { value: data });
		element.dispatchEvent(paste);
	});
	await expect(editor.locator("[data-ep-code] code")).toContainText(
		"https://example.com/literal",
	);
	await expect(editor.locator("[data-ep-code] [data-ep-link]")).toHaveCount(0);

	await page.keyboard.type(" @mar /");
	await expect(page.getByRole("listbox", { name: "People" })).toHaveCount(0);
	await expect(page.locator(".e-fl-drop")).toHaveCount(0);
});

test("preview produces semantic lists and clickable labeled links", async ({ page }) => {
	await page.getByRole("button", { name: "Preview" }).click();
	await expect(page.locator("[data-ep-preview] ul > li").first()).toBeVisible();
	await expect(
		page.locator("[data-ep-preview] a[href='https://openai.com']"),
	).toContainText("OpenAI");
});
