import { expect, type Locator, type Page, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
	await page.goto("/");
});

test("caret restoration stays within each editor root", async ({ page }) => {
	await page.goto("/root-fixture.html");

	await page.getByRole("button", {
		name: "Select Second scoped editor",
	}).click();
	const second = page.getByRole("textbox", {
		name: "Second scoped editor",
	});
	await expect.poll(() =>
		second.evaluate((editor) => {
			const selection = editor.ownerDocument.getSelection();
			return Boolean(
				selection?.focusNode && editor.contains(selection.focusNode),
			);
		})
	).toBe(true);
	await page.keyboard.type("!");
	await expect(second).toContainText("Second editor!");

	const shadow = page.getByRole("textbox", {
		name: "Shadow scoped editor",
	});
	await page.getByRole("button", {
		name: "Select Shadow scoped editor",
	}).click();
	await expect.poll(() =>
		shadow.evaluate((editor) => {
			const root = editor.getRootNode() as ShadowRoot;
			return root.activeElement === editor;
		})
	).toBe(true);
	await page.keyboard.type("!");
	await expect(shadow).toContainText("Shadow editor!");

	const frame = page.frameLocator("iframe");
	const iframeEditor = frame.getByRole("textbox", {
		name: "Iframe scoped editor",
	});
	await frame.getByRole("button", {
		name: "Select Iframe scoped editor",
	}).click();
	await expect.poll(() =>
		iframeEditor.evaluate((editor) => {
			const selection = editor.ownerDocument.getSelection();
			return Boolean(
				selection?.focusNode && editor.contains(selection.focusNode),
			);
		})
	).toBe(true);
	await page.keyboard.type("!");
	await expect(iframeEditor).toContainText("Iframe editor!");
});

async function placeCaretAtTextEnd(
	editor: Locator,
	text: string,
) {
	await editor.evaluate((element, value) => {
		const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
		let node: Text | undefined;
		while (walker.nextNode()) {
			const candidate = walker.currentNode as Text;
			if (candidate.data.includes(value)) {
				node = candidate;
			}
		}
		if (!node) {
			throw new Error(`Could not find ${value}`);
		}
		(element as HTMLElement).focus();
		const range = document.createRange();
		range.setStart(node, node.data.length);
		range.collapse(true);
		const selection = document.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		document.dispatchEvent(new Event("selectionchange"));
	}, text);
}

test("editor exposes accessible semantics and extension renderers", async ({ page }) => {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	await expect(editor).toHaveAttribute("aria-multiline", "true");
	await expect(editor).toHaveAttribute("autocapitalize", "sentences");
	await expect(editor).toHaveAttribute("autocorrect", "on");
	await expect(editor).toHaveAttribute("inputmode", "text");
	await expect(editor).toHaveAttribute("spellcheck", "true");
	await expect(editor).toHaveAttribute(
		"aria-placeholder",
		"Write some Markdown…",
	);
	await expect(editor.locator("h1")).toContainText("Editpal Markdown");
	await expect(editor.locator("ul > li").first()).toBeVisible();
	await expect(editor.locator("ol > li").first()).toBeVisible();
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

test("Tab follows focus order and the floating toolbar supports keyboard navigation", async ({ page }) => {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	const source = page.locator("textarea[name='content']");
	const initial = await source.inputValue();

	await editor.focus();
	await page.keyboard.press("Tab");
	await expect(editor).not.toBeFocused();
	await expect(source).toHaveValue(initial);

	await editor.evaluate((element) => {
		const heading = element.querySelector("[data-ep-h] [data-t]");
		const node = heading?.firstChild;
		if (!node || node.nodeType !== Node.TEXT_NODE) {
			throw new Error("Could not find heading text");
		}
		(element as HTMLElement).focus();
		const range = document.createRange();
		range.setStart(node, 0);
		range.setEnd(node, Math.min(7, node.textContent?.length || 0));
		const selection = document.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		document.dispatchEvent(new Event("selectionchange"));
	});

	const toolbar = page.getByRole("toolbar", { name: "Text formatting" });
	await expect(toolbar).toBeVisible();
	await page.keyboard.press("Alt+F10");
	const bold = toolbar.getByRole("button", { name: "Bold" });
	const italic = toolbar.getByRole("button", { name: "Italic" });
	await expect(bold).toBeFocused();
	await expect(bold).toHaveAttribute("aria-pressed", "false");
	await expect(bold).toHaveAttribute("tabindex", "0");
	await expect(italic).toHaveAttribute("tabindex", "-1");

	await page.keyboard.press("ArrowRight");
	await expect(italic).toBeFocused();
	await expect(italic).toHaveAttribute("tabindex", "0");
	await expect(bold).toHaveAttribute("tabindex", "-1");

	await page.keyboard.press("Escape");
	await expect(editor).toBeFocused();
});

test("native keyboard text is inserted from beforeinput, not keydown", async ({ page }) => {
	await page.getByRole("button", { name: "Basic" }).click();
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	const source = page.locator("textarea[name='content']");
	await placeCaretAtTextEnd(editor, "Type @ to try");
	const initial = await source.inputValue();

	const keydownPrevented = await editor.evaluate((element) => {
		const event = new KeyboardEvent("keydown", {
			bubbles: true,
			cancelable: true,
			key: "ß",
		});
		element.dispatchEvent(event);
		return event.defaultPrevented;
	});
	expect(keydownPrevented).toBe(false);
	await expect(source).toHaveValue(initial);

	const beforeInputPrevented = await editor.evaluate((element) => {
		const event = new InputEvent("beforeinput", {
			bubbles: true,
			cancelable: true,
			data: "ß",
			inputType: "insertText",
		});
		element.dispatchEvent(event);
		return event.defaultPrevented;
	});
	expect(beforeInputPrevented).toBe(true);
	await expect.poll(async () => (await source.inputValue()).length).toBe(
		initial.length + 1,
	);
	expect((await source.inputValue()).match(/ß/g)).toHaveLength(1);
});

test("native text replacements honor the browser target range", async ({ page }) => {
	await page.getByRole("button", { name: "Basic" }).click();
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	const source = page.locator("textarea[name='content']");

	const replace = async (
		needle: string,
		replacement: string,
		inputType: "insertText" | "insertReplacementText",
	) => {
		await editor.evaluate(
			(element, { inputType, needle, replacement }) => {
				const walker = document.createTreeWalker(
					element,
					NodeFilter.SHOW_TEXT,
				);
				let node: Text | undefined;
				while (walker.nextNode()) {
					const candidate = walker.currentNode as Text;
					if (candidate.data.includes(needle)) {
						node = candidate;
						break;
					}
				}
				if (!node) {
					throw new Error(`Could not find replacement target ${needle}`);
				}

				const start = node.data.indexOf(needle);
				const target = document.createRange();
				target.setStart(node, start);
				target.setEnd(node, start + needle.length);
				(element as HTMLElement).focus();
				const selection = document.getSelection();
				selection?.removeAllRanges();
				const caret = target.cloneRange();
				caret.collapse(false);
				selection?.addRange(caret);
				document.dispatchEvent(new Event("selectionchange"));

				const event = new InputEvent("beforeinput", {
					bubbles: true,
					cancelable: true,
					data: replacement,
					inputType,
				});
				Object.defineProperty(event, "getTargetRanges", {
					value: () => [target],
				});
				element.dispatchEvent(event);
			},
			{ inputType, needle, replacement },
		);
	};

	await replace("Type @", "Write @", "insertReplacementText");
	await expect(source).toHaveValue(/Write @ to try/);
	await page.keyboard.press("ControlOrMeta+z");
	await expect(source).toHaveValue(/Type @ to try/);
	await replace("Type @", "Draft @", "insertText");
	await expect(source).toHaveValue(/Draft @ to try/);
	await page.keyboard.press("ControlOrMeta+z");
	await expect(source).toHaveValue(/Type @ to try/);
});

test("ArrowRight leaves manually typed inline Markdown formatting", async ({ page }) => {
	await page.getByRole("button", { name: "Basic" }).click();
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	const source = page.locator("textarea[name='content']");

	await editor.focus();
	await page.keyboard.press("ControlOrMeta+End");
	for (
		const markdown of [
			"`code`",
			"**bold**",
			"_italic_",
			"~~strikethrough~~",
			"==highlighted==",
		]
	) {
		await page.keyboard.press("Enter");
		await page.keyboard.type(markdown);
		await expect(source).toHaveValue(
			new RegExp(`${markdown.replaceAll("*", "\\*")}$`),
		);

		await page.keyboard.press("ArrowRight");
		await page.keyboard.type(" after");
		await expect(source).toHaveValue(
			new RegExp(`${markdown.replaceAll("*", "\\*")} after$`),
		);
	}
});

test("drag and drop uses structured Editpal data and undoes atomically", async ({ page }) => {
	await page.getByRole("button", { name: "Basic" }).click();
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	const source = page.locator("textarea[name='content']");
	const initial = await source.inputValue();

	const payload = await editor.evaluate((element) => {
		const findText = (value: string) => {
			const walker = document.createTreeWalker(
				element,
				NodeFilter.SHOW_TEXT,
			);
			while (walker.nextNode()) {
				const node = walker.currentNode as Text;
				if (node.data.includes(value)) {
					return node;
				}
			}
			throw new Error(`Could not find ${value}`);
		};
		const dragged = findText("bold");
		const start = dragged.data.indexOf("bold");
		const selection = document.getSelection();
		const range = document.createRange();
		range.setStart(dragged, start);
		range.setEnd(dragged, start + 4);
		selection?.removeAllRanges();
		selection?.addRange(range);
		document.dispatchEvent(new Event("selectionchange"));

		const data = new DataTransfer();
		element.dispatchEvent(
			new DragEvent("dragstart", {
				bubbles: true,
				cancelable: true,
				dataTransfer: data,
			}),
		);
		const structured = data.getData("application/x-editpal-drag");
		if (!structured) {
			throw new Error(
				`Missing structured drag data (${Array.from(data.types).join(", ")})`,
			);
		}

		const target = findText("Type @ to try");
		const targetRange = document.createRange();
		targetRange.setStart(target, target.data.length);
		targetRange.collapse(true);
		const rect = targetRange.getBoundingClientRect();
		// Synthetic drop events do not move the native insertion caret on
		// mobile WebKit. Mirror the browser's real drag caret before dispatching
		// the event so the editor has a valid fallback when point hit-testing is
		// unavailable for synthetic coordinates.
		selection?.removeAllRanges();
		selection?.addRange(targetRange);
		document.dispatchEvent(new Event("selectionchange"));
		element.dispatchEvent(
			new DragEvent("drop", {
				bubbles: true,
				cancelable: true,
				clientX: rect.right,
				clientY: rect.top + Math.max(1, rect.height / 2),
				dataTransfer: data,
			}),
		);
		return {
			plain: data.getData("text/plain"),
			structured: JSON.parse(structured),
		};
	});

	expect(payload.plain).toBe("bold");
	expect(payload.structured.version).toBe(1);
	expect(payload.structured.fragment[0].children[0].props.fontWeight).toBe(
		"bold",
	);
	await expect(source).not.toHaveValue(initial);
	await expect(source).not.toHaveValue(/Write \*\*bold\*\*/);
	await expect(source).toHaveValue(/Type @ to try[^\n]*\*\*bold\*\*/);

	await editor.focus();
	await page.keyboard.press("ControlOrMeta+z");
	await expect(source).toHaveValue(initial);

	const image = editor.locator("[data-ep-img]").last();
	await expect(image).toHaveAttribute("draggable", "true");
	const imagePayload = await image.evaluate((element) => {
		const data = new DataTransfer();
		element.dispatchEvent(
			new DragEvent("dragstart", {
				bubbles: true,
				cancelable: true,
				dataTransfer: data,
			}),
		);
		const payload = data.getData("application/x-editpal-drag");
		element.dispatchEvent(
			new DragEvent("dragend", {
				bubbles: true,
				dataTransfer: data,
			}),
		);
		return JSON.parse(payload);
	});
	expect(
		imagePayload.fragment[0].children.some(
			(child: { type: string }) => child.type === "img",
		),
	).toBe(true);
	const lineEmbed = editor.locator("[data-ep-line-embed]");
	await expect(lineEmbed).toHaveAttribute(
		"draggable",
		"true",
	);
	const embedPayload = await lineEmbed.evaluate((element) => {
		const data = new DataTransfer();
		element.dispatchEvent(
			new DragEvent("dragstart", {
				bubbles: true,
				cancelable: true,
				dataTransfer: data,
			}),
		);
		const payload = data.getData("application/x-editpal-drag");
		element.dispatchEvent(
			new DragEvent("dragend", {
				bubbles: true,
				dataTransfer: data,
			}),
		);
		return JSON.parse(payload);
	});
	expect(
		embedPayload.fragment[0].children.some(
			(child: { props?: { link?: string } }) =>
				child.props?.link ===
					"https://twitter.com/openai/status/123456789",
		),
	).toBe(true);
});

test("a native dead-key composition commits once inside punctuation", async ({ page }) => {
	await page.getByRole("button", { name: "Basic" }).click();
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	const source = page.locator("textarea[name='content']");
	await editor.click();
	await page.keyboard.press("ControlOrMeta+a");
	await page.keyboard.press("Backspace");
	await page.keyboard.type("test ");
	await page.keyboard.type('""');
	await page.keyboard.press("ArrowLeft");
	await editor.evaluate((element) => {
		element.dispatchEvent(
			new CompositionEvent("compositionstart", {
				bubbles: true,
				data: "",
			}),
		);
		element.dispatchEvent(
			new CompositionEvent("compositionupdate", {
				bubbles: true,
				data: "'",
			}),
		);
		element.dispatchEvent(
			new KeyboardEvent("keyup", {
				bubbles: true,
				key: "ā",
			}),
		);
	});
	await expect(source).toHaveValue(/test ""/);

	await editor.evaluate((element) => {
		element.dispatchEvent(
			new CompositionEvent("compositionend", {
				bubbles: true,
				data: "ā",
			}),
		);
		element.dispatchEvent(
			new InputEvent("beforeinput", {
				bubbles: true,
				cancelable: true,
				data: "ā",
				inputType: "insertFromComposition",
			}),
		);
	});
	await expect(source).toHaveValue(/test "ā"/);
	expect(await source.inputValue()).not.toContain("āā");
	await page.keyboard.type("x");
	await expect(source).toHaveValue(/test "āx"/);
});

test("Safari link clicks preserve the selected integration toolbar", async ({
	page,
}, testInfo) => {
	test.skip(
		!["webkit", "mobile-safari"].includes(testInfo.project.name),
		"Safari-specific link selection regression",
	);
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	const integration = editor.locator(
		"[data-ep-inline-integration='github-repository']",
	);
	const toolbar = page.locator("[data-ep-context-toolbar='link']");

	await integration.locator("a").click();
	await expect(toolbar.getByLabel("Link URL")).toHaveValue(
		"https://github.com/Marcisbee/editpal",
	);
	await integration.evaluate((element) => {
		const editor = element.closest("[contenteditable='true']");
		if (!editor) {
			throw new Error("Could not find the integration editor");
		}
		const range = document.createRange();
		range.setStart(editor, 0);
		range.collapse(true);
		const selection = document.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		document.dispatchEvent(new Event("selectionchange"));
	});

	await expect(toolbar).toBeVisible();
	await expect(toolbar.getByLabel("Link URL")).toHaveValue(
		"https://github.com/Marcisbee/editpal",
	);
	await expect(page).toHaveURL("/");
});

test("ArrowUp stays inside the editor before a leading decorator", async ({ page }) => {
	await page.getByRole("button", { name: "Basic" }).click();
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	const source = page.locator("textarea[name='content']");
	const markdown = "![Leading decorator](https://example.com/leading.png)";

	await editor.focus();
	await page.keyboard.press("ControlOrMeta+a");
	await editor.evaluate((element, value) => {
		const data = new DataTransfer();
		data.setData("text/plain", value);
		const paste = new Event("paste", { bubbles: true, cancelable: true });
		Object.defineProperty(paste, "clipboardData", { value: data });
		element.dispatchEvent(paste);
	}, markdown);
	await expect(source).toHaveValue(markdown);

	const decorator = editor.locator("[data-ep-img]");
	const box = await decorator.boundingBox();
	expect(box).not.toBeNull();
	await decorator.click({
		position: { x: 1, y: Math.max(1, box!.height / 2) },
	});
	await page.keyboard.press("ArrowUp");
	await page.keyboard.press("ArrowUp");

	await expect.poll(() =>
		editor.evaluate((element) => {
			const selection = document.getSelection();
			return Boolean(
				selection?.isCollapsed &&
					selection.anchorNode &&
					element.contains(selection.anchorNode),
			);
		})
	).toBe(true);
	await expect(source).toHaveValue(markdown);
});

test(
	"Android selection ignores a synthetic zero-width-space insertion",
	async ({
		page,
	}, testInfo) => {
		test.skip(
			testInfo.project.name !== "mobile-chrome",
			"Android-specific native selection regression",
		);
		await page.getByRole("button", { name: "Basic" }).click();
		const editor = page.getByRole("textbox", {
			name: "Demo Markdown document",
		});
		const source = page.locator("textarea[name='content']");
		const initial = await source.inputValue();

		const result = await editor.evaluate((element) => {
			const walker = document.createTreeWalker(
				element,
				NodeFilter.SHOW_TEXT,
			);
			let node: Text | undefined;
			while (walker.nextNode()) {
				const candidate = walker.currentNode as Text;
				if (candidate.data === "bold") {
					node = candidate;
					break;
				}
			}
			if (!node) {
				throw new Error("Could not find the Android selection target");
			}
			(element as HTMLElement).focus();
			const range = document.createRange();
			range.selectNodeContents(node);
			const selection = document.getSelection();
			selection?.removeAllRanges();
			selection?.addRange(range);
			document.dispatchEvent(new Event("selectionchange"));

			const input = new InputEvent("beforeinput", {
				bubbles: true,
				cancelable: true,
				data: "\u200B",
				inputType: "insertText",
			});
			element.dispatchEvent(input);
			return {
				prevented: input.defaultPrevented,
				selected: document.getSelection()?.toString(),
			};
		});

		expect(result).toEqual({ prevented: true, selected: "bold" });
		await expect(source).toHaveValue(initial);
		await expect(source).not.toHaveValue(/\u200B/);
	},
);

test(
	"mobile clipboard beforeinput preserves multiline blocks on repeated paste",
	async ({
		page,
	}, testInfo) => {
		test.skip(
			!["mobile-chrome", "mobile-safari"].includes(testInfo.project.name),
			"Mobile clipboard regression",
		);
		await page.getByRole("button", { name: "Basic" }).click();
		const editor = page.getByRole("textbox", {
			name: "Demo Markdown document",
		});
		const source = page.locator("textarea[name='content']");
		const pasted = [
			"## Mobile clipboard",
			"First pasted paragraph",
			"Second pasted paragraph",
		].join("\n");
		const pasteFromClipboardSuggestion = async () => {
			return await editor.evaluate((element, text) => {
				const transfer = new DataTransfer();
				transfer.setData("text/plain", text);
				const event = new InputEvent("beforeinput", {
					bubbles: true,
					cancelable: true,
					inputType: "insertFromPaste",
				});
				Object.defineProperty(event, "dataTransfer", { value: transfer });
				element.dispatchEvent(event);
				return event.defaultPrevented;
			}, pasted);
		};

		for (let attempt = 0; attempt < 2; attempt++) {
			await editor.focus();
			await page.keyboard.press("ControlOrMeta+a");
			expect(await pasteFromClipboardSuggestion()).toBe(true);
			await expect(source).toHaveValue(pasted);
			await expect(editor.locator("[data-ep-h='2']")).toHaveCount(1);
			await expect(editor.locator("p[data-ep]")).toHaveCount(2);
		}
	},
);

test("iOS dictation commits the complete composition exactly once", async ({
	page,
}, testInfo) => {
	test.skip(
		testInfo.project.name !== "mobile-safari",
		"iOS-specific dictation regression",
	);
	await page.getByRole("button", { name: "Basic" }).click();
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	const source = page.locator("textarea[name='content']");
	const dictated =
		"Dictation keeps every spoken word. The second sentence also remains.";

	await editor.focus();
	await page.keyboard.press("ControlOrMeta+a");
	await editor.evaluate((element) => {
		element.dispatchEvent(
			new InputEvent("beforeinput", {
				bubbles: true,
				cancelable: true,
				data: "",
				inputType: "insertText",
			}),
		);
	});
	await expect(source).toHaveValue("");
	await editor.evaluate((element, value) => {
		element.dispatchEvent(
			new CompositionEvent("compositionstart", {
				bubbles: true,
				data: "",
			}),
		);
		for (
			const update of [
				"Dictation keeps every spoken word.",
				value,
			]
		) {
			element.dispatchEvent(
				new CompositionEvent("compositionupdate", {
					bubbles: true,
					data: update,
				}),
			);
			element.dispatchEvent(
				new InputEvent("beforeinput", {
					bubbles: true,
					cancelable: true,
					data: update,
					inputType: "insertCompositionText",
					isComposing: true,
				}),
			);
		}
		element.dispatchEvent(
			new CompositionEvent("compositionend", {
				bubbles: true,
				data: value,
			}),
		);
		const duplicate = new InputEvent("beforeinput", {
			bubbles: true,
			cancelable: true,
			data: value,
			inputType: "insertFromComposition",
		});
		element.dispatchEvent(duplicate);
	}, dictated);

	await expect(source).toHaveValue(dictated);
	await page.keyboard.type("!");
	await expect(source).toHaveValue(`${dictated}!`);
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
	const listboxId = await listbox.getAttribute("id");
	const firstOptionId = await option.getAttribute("id");
	await expect(editor).toHaveAttribute("aria-expanded", "true");
	await expect(editor).toHaveAttribute("aria-controls", listboxId!);
	await expect(editor).toHaveAttribute("aria-activedescendant", firstOptionId!);
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
	await expect(editor).toHaveAttribute("aria-expanded", "false");
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

test("mention popup dismisses while loading or empty", async ({ page }) => {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	await editor.getByText("Type @ to try the customizable mention API", {
		exact: false,
	}).evaluate((element) => {
		const editor = element.closest("[contenteditable='true']") as HTMLElement;
		const node = element.firstChild;
		if (!editor || !node) {
			throw new Error("Could not find a mention insertion point");
		}
		editor.focus();
		const range = document.createRange();
		range.selectNodeContents(node);
		range.collapse(false);
		const selection = document.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		document.dispatchEvent(new Event("selectionchange"));

		const nativeTimeout = window.setTimeout;
		window.setTimeout =
			((handler: TimerHandler, timeout?: number, ...args: any[]) =>
				nativeTimeout(
					handler,
					timeout === 80 ? 1_000 : timeout,
					...args,
				)) as typeof window.setTimeout;
	});
	await page.keyboard.press("Enter");
	await page.keyboard.type("@mar");
	const listbox = page.getByRole("listbox", { name: "People" });
	await expect(listbox).toContainText("Loading…");
	await page.keyboard.press("Escape");
	await expect(listbox).toHaveCount(0);

	await page.keyboard.type("zzzz");
	await expect(listbox).toContainText("No mentions found", {
		timeout: 2_000,
	});
	await page.keyboard.press("Escape");
	await expect(listbox).toHaveCount(0);
});

test("pointer and keyboard navigation keep a visible caret beside mentions", async ({ page }) => {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	const source = page.locator("textarea[name='content']");
	await editor.getByText("Type @ to try the customizable mention API", {
		exact: false,
	}).evaluate((element) => {
		const editor = element.closest("[contenteditable='true']") as HTMLElement;
		const node = element.firstChild;
		if (!editor || !node) {
			throw new Error("Could not find a mention insertion point");
		}
		editor.focus();
		const range = document.createRange();
		range.selectNodeContents(node);
		range.collapse(false);
		const selection = document.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		document.dispatchEvent(new Event("selectionchange"));
	});
	await page.keyboard.press("Enter");
	await page.keyboard.type("@mar");
	await page.getByRole("option", { name: /marcis/i }).click();
	const mention = editor.locator("[data-ep-mention='people']");
	const expectCaretBesideMention = async (side: "before" | "after") => {
		const mentionBox = await mention.boundingBox();
		const caret = await editor.evaluate(() => {
			const selection = document.getSelection();
			if (!selection?.isCollapsed || !selection.rangeCount) {
				return;
			}
			const rect = selection.getRangeAt(0).getBoundingClientRect();
			return { height: rect.height, left: rect.left };
		});
		expect(mentionBox).not.toBeNull();
		expect(caret).toBeDefined();
		expect(caret!.height).toBeGreaterThan(0);
		if (side === "before") {
			expect(caret!.left).toBeLessThanOrEqual(mentionBox!.x + 1);
		} else {
			expect(caret!.left).toBeGreaterThanOrEqual(
				mentionBox!.x + mentionBox!.width - 1,
			);
		}
	};

	await expectCaretBesideMention("after");
	await page.keyboard.press("ArrowLeft");
	await expectCaretBesideMention("before");
	await page.keyboard.press("ArrowRight");
	await expectCaretBesideMention("after");
	await page.keyboard.type(" after");
	await expect(source).toHaveValue(/@marcis after/);

	const box = await mention.boundingBox();
	expect(box).not.toBeNull();
	await mention.click({ position: { x: 1, y: box!.height / 2 } });
	await page.keyboard.type("L");
	await expect(source).toHaveValue(/L@marcis after/);
	await page.keyboard.press("Backspace");
	await expect(source).toHaveValue(/@marcis after/);

	const restoredBox = await mention.boundingBox();
	expect(restoredBox).not.toBeNull();
	await mention.click({
		position: {
			x: Math.max(1, restoredBox!.width - 1),
			y: restoredBox!.height / 2,
		},
	});
	await expectCaretBesideMention("after");
	await page.keyboard.type("R");
	await expect(source).toHaveValue(/@marcisR after/);
	await expect(mention).toHaveText("@marcis");
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
	await expect(page.getByRole("status")).toHaveText("Undo complete.");
	await page.keyboard.press("ControlOrMeta+Shift+z");
	await expect(editor).toContainText("Browser history");
	await expect(page.getByRole("status")).toHaveText("Redo complete.");

	const task = editor.locator("[data-ep-todo-check]").first();
	const checked = await task.isChecked();
	await task.click();
	await expect(task).toBeChecked({ checked: !checked });
});

test("transient WebKit root selections do not reset the typing caret", async ({ page }) => {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	await placeCaretAtTextEnd(editor, "Preview-ready Markdown");
	await editor.evaluate((element) => {
		const selection = document.getSelection();
		const transient = document.createRange();
		transient.setStart(element, 0);
		transient.collapse(true);
		selection?.removeAllRanges();
		selection?.addRange(transient);
		document.dispatchEvent(new Event("selectionchange"));
		element.dispatchEvent(
			new InputEvent("beforeinput", {
				bubbles: true,
				cancelable: true,
				data: "Z",
				inputType: "insertText",
			}),
		);
	});

	await expect(editor).toContainText(
		'const message = "Preview-ready Markdown";Z',
	);
});

test("typing restores only the editor caret without moving the page", async ({ page }) => {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	await placeCaretAtTextEnd(editor, "Preview-ready Markdown");
	const baseline = await editor.evaluate((element) => {
		const testWindow = window as Window & {
			__editpalScrollIntoViewCalls?: number;
		};
		const original = Element.prototype.scrollIntoView;
		testWindow.__editpalScrollIntoViewCalls = 0;
		Element.prototype.scrollIntoView = function (
			options?: boolean | ScrollIntoViewOptions,
		) {
			if (element.contains(this)) {
				testWindow.__editpalScrollIntoViewCalls! += 1;
			}
			return original.call(this, options);
		};
		const selection = document.getSelection();
		const caret = selection?.rangeCount
			? selection.getRangeAt(0).getBoundingClientRect()
			: undefined;
		if (!caret) {
			throw new Error("Could not measure the page-stability caret");
		}
		const caretDocumentTop = window.scrollY + caret.top;
		window.scrollTo(0, Math.max(0, caretDocumentTop - innerHeight * 0.65));
		return window.scrollY;
	});

	expect(baseline).toBeGreaterThan(0);
	await page.keyboard.type("Page-stable typing");
	await page.evaluate(() =>
		new Promise((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(resolve))
		)
	);

	expect(await page.evaluate(() => window.scrollY)).toBe(baseline);
	expect(
		await page.evaluate(() =>
			(window as Window & { __editpalScrollIntoViewCalls?: number })
				.__editpalScrollIntoViewCalls
		),
	).toBe(0);
});

test("an overflowing editor keeps its restored caret visible internally", async ({ page }) => {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	await editor.evaluate((element) => {
		Object.assign((element as HTMLElement).style, {
			height: "96px",
			maxHeight: "96px",
			minHeight: "96px",
			overflowY: "auto",
		});
	});
	await placeCaretAtTextEnd(editor, "Preview-ready Markdown");
	await editor.evaluate((element) => {
		element.scrollTop = 0;
	});

	await page.keyboard.type(" visible");
	await page.evaluate(() =>
		new Promise((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(resolve))
		)
	);

	const geometry = await editor.evaluate((element) => {
		const selection = document.getSelection();
		const caret = selection?.rangeCount
			? selection.getRangeAt(0).getBoundingClientRect()
			: undefined;
		const bounds = element.getBoundingClientRect();
		return {
			caretBottom: caret?.bottom,
			caretTop: caret?.top,
			editorBottom: bounds.bottom,
			editorTop: bounds.top,
			scrollTop: element.scrollTop,
		};
	});
	expect(geometry.scrollTop).toBeGreaterThan(0);
	expect(geometry.caretTop).toBeGreaterThanOrEqual(geometry.editorTop);
	expect(geometry.caretBottom).toBeLessThanOrEqual(geometry.editorBottom);
});

async function openEmptySlashCommand(page: Page) {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	const source = page.locator("textarea[name='content']");
	await editor.getByText("Type @ to try the customizable mention API", {
		exact: false,
	}).evaluate((element) => {
		const editor = element.closest("[contenteditable='true']") as HTMLElement;
		const node = element.firstChild;
		if (!editor || !node) {
			throw new Error("Could not find a slash command insertion point");
		}
		editor.focus();
		const range = document.createRange();
		range.selectNodeContents(node);
		range.collapse(false);
		const selection = document.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		document.dispatchEvent(new Event("selectionchange"));
	});
	await page.keyboard.press("Enter");
	const before = await source.inputValue();
	await page.keyboard.type("/");
	const search = page.getByRole("searchbox", { name: "Search commands" });
	await expect(search).toBeFocused();
	return { before, editor, search, source };
}

test("backspace removes an empty slash command trigger", async ({ page }) => {
	const { before, editor, search, source } = await openEmptySlashCommand(page);

	await page.keyboard.press("Backspace");

	await expect(search).toHaveCount(0);
	await expect(editor).toBeFocused();
	await expect(source).toHaveValue(before);
});

test("mobile beforeinput removes an empty slash command trigger", async ({ page }) => {
	const { before, editor, search, source } = await openEmptySlashCommand(page);
	await search.evaluate((element) => {
		element.dispatchEvent(
			new InputEvent("beforeinput", {
				bubbles: true,
				cancelable: true,
				inputType: "deleteContentBackward",
			}),
		);
	});

	await expect(search).toHaveCount(0);
	await expect(editor).toBeFocused();
	await expect(source).toHaveValue(before);
});

test("mobile held delete honors an accelerated beforeinput range", async ({ page }) => {
	await page.getByRole("button", { name: "Basic" }).click();
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	const source = page.locator("textarea[name='content']");
	const initial = await source.inputValue();
	const deleted = "video, or file.";

	await editor.getByText("Type @ to try the customizable mention API", {
		exact: false,
	}).evaluate((element, deletedText) => {
		const node = element.firstChild;
		if (!node || !node.textContent?.endsWith(deletedText)) {
			throw new Error("Could not find the held-delete target");
		}

		const target = document.createRange();
		target.setStart(node, node.textContent.length - deletedText.length);
		target.setEnd(node, node.textContent.length);

		(element.closest("[contenteditable='true']") as HTMLElement).focus();
		const selection = document.getSelection();
		selection?.removeAllRanges();
		const caret = target.cloneRange();
		caret.collapse(false);
		selection?.addRange(caret);
		document.dispatchEvent(new Event("selectionchange"));

		const event = new InputEvent("beforeinput", {
			bubbles: true,
			cancelable: true,
			inputType: "deleteContentBackward",
		});
		Object.defineProperty(event, "getTargetRanges", {
			value: () => [target],
		});
		element.dispatchEvent(event);
	}, deleted);

	await expect(source).toHaveValue(initial.replace(deleted, ""));
	await page.keyboard.press("ControlOrMeta+z");
	await expect(source).toHaveValue(initial);
});

test("slash option navigation stays inside a viewport-clamped popup", async ({ page }) => {
	const { search } = await openEmptySlashCommand(page);
	const baseline = await page.evaluate(() => window.scrollY);

	for (let index = 0; index < 12; index += 1) {
		await page.keyboard.press("ArrowDown");
	}

	const popup = search.locator("..");
	const bounds = await popup.boundingBox();
	const safeTop = await page.evaluate(() =>
		navigator.maxTouchPoints > 0 ? 56 : 0
	);
	expect(bounds).not.toBeNull();
	expect(bounds!.x).toBeGreaterThanOrEqual(0);
	expect(bounds!.y).toBeGreaterThanOrEqual(safeTop);
	expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
		await page.evaluate(() => visualViewport?.width ?? innerWidth),
	);
	expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
		await page.evaluate(() =>
			(visualViewport?.offsetTop ?? 0) +
			(visualViewport?.height ?? innerHeight)
		),
	);
	expect(await page.evaluate(() => window.scrollY)).toBe(baseline);
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
	await expect(page.getByRole("status")).toHaveText("pixel.png uploaded.");
});

test("mode changes provide polite feedback", async ({ page }) => {
	const status = page.getByRole("status");
	await page.getByRole("button", { name: "Basic" }).click();
	await expect(status).toHaveText("Basic editing mode.");
	await page.getByRole("button", { name: "Markdown" }).click();
	await expect(status).toHaveText("Markdown editing mode.");
});

test("images and embeds expose contextual controls when selected", async ({ page }) => {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	await editor.locator("[data-t]").first().click();
	await expect(page.locator(".e-fl-toolbar")).toHaveCount(0);

	const openAiLink = editor.locator("[data-ep-link='https://openai.com']");
	await openAiLink.scrollIntoViewIfNeeded();
	await openAiLink.evaluate(
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
	await expect(page).toHaveURL("/");
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
	await lineEmbed.locator("a").click();
	await expect(page).toHaveURL("/");
	await expect(linkToolbar.getByLabel("Link URL")).toHaveValue(
		"https://twitter.com/openai/status/123456789",
	);
});

test("inline integrations and line embeds delete atomically with history", async ({ page }) => {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	const source = page.locator("textarea[name='content']");
	const inlineIntegration = editor.locator(
		"[data-ep-inline-integration='github-repository']",
	);
	await inlineIntegration.click();
	await expect(inlineIntegration).toHaveAttribute("data-ep-s", "true");
	await page.keyboard.press("Delete");
	await expect(inlineIntegration).toHaveCount(0);
	await expect(source).not.toHaveValue(/github\.com\/Marcisbee\/editpal/);

	await page.keyboard.press("ControlOrMeta+z");
	await expect(
		editor.locator("[data-ep-inline-integration='github-repository']"),
	).toBeVisible();

	const lineEmbed = editor.locator("[data-ep-line-embed='tweet-demo']");
	await lineEmbed.click();
	await expect(lineEmbed).toHaveAttribute("data-ep-s", "true");
	await page.keyboard.press("Backspace");
	await expect(lineEmbed).toHaveCount(0);
	await expect(source).not.toHaveValue(/twitter\.com\/openai\/status/);

	await page.keyboard.press("ControlOrMeta+z");
	await expect(editor.locator("[data-ep-line-embed='tweet-demo']"))
		.toBeVisible();
	await page.keyboard.press("ControlOrMeta+Shift+z");
	await expect(editor.locator("[data-ep-line-embed='tweet-demo']")).toHaveCount(
		0,
	);

	const restoredIntegration = editor.locator(
		"[data-ep-inline-integration='github-repository']",
	);
	const integrationBox = await restoredIntegration.boundingBox();
	expect(integrationBox).not.toBeNull();
	await restoredIntegration.click({
		position: {
			x: 1,
			y: integrationBox!.height / 2,
		},
	});
	await expect.poll(async () =>
		restoredIntegration.evaluate((element) => {
			const selection = document.getSelection();
			if (!selection?.isCollapsed || !selection.rangeCount) {
				return false;
			}
			const caret = selection.getRangeAt(0).getBoundingClientRect();
			const integration = element.getBoundingClientRect();
			return caret.height > 0 && caret.left <= integration.left + 1;
		})
	).toBe(true);
	await restoredIntegration.click({
		position: {
			x: Math.max(1, integrationBox!.width - 1),
			y: integrationBox!.height / 2,
		},
	});
	await page.keyboard.type("replacement");
	await expect(restoredIntegration).toHaveCount(0);
	await expect(source).toHaveValue(/\nreplacement\n/);
	await page.keyboard.press("ControlOrMeta+z");
	const finalIntegration = editor.locator(
		"[data-ep-inline-integration='github-repository']",
	);
	await expect(finalIntegration).toBeVisible();
	await expect.poll(async () =>
		finalIntegration.evaluate((element) => {
			const selection = document.getSelection();
			if (!selection?.isCollapsed || !selection.rangeCount) {
				return false;
			}
			const caret = selection.getRangeAt(0).getBoundingClientRect();
			const integration = element.getBoundingClientRect();
			return caret.height > 0 &&
				caret.left >= integration.right - 1;
		})
	).toBe(true);
	await finalIntegration.click();
	await page.getByLabel("Link URL").focus();
	await page.keyboard.press("Escape");
	await page.keyboard.type(" continues");
	await expect(source).toHaveValue(
		/\[Marcisbee\/editpal\]\(https:\/\/github\.com\/Marcisbee\/editpal\) continues/,
	);
	await expect(finalIntegration).not.toContainText("continues");
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

test("link paste uses the edited occurrence and exits full-line embeds", async ({ page }) => {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	const source = page.locator("textarea[name='content']");
	const selectText = async (needle: string, blockText: string) => {
		await editor.evaluate((element, values) => {
			const block = Array.from(
				element.querySelectorAll<HTMLElement>(
					"p[data-ep], li[data-ep], [data-ep-h], [data-ep-quote]",
				),
			).find((candidate) => candidate.textContent === values.blockText);
			if (!block) {
				throw new Error(`Could not find block ${values.blockText}`);
			}
			const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
			let node: Text | undefined;
			while (walker.nextNode()) {
				const candidate = walker.currentNode as Text;
				if (candidate.data.includes(values.needle)) {
					node = candidate;
					break;
				}
			}
			if (!node) {
				throw new Error(`Could not find ${values.needle}`);
			}
			const start = node.data.indexOf(values.needle);
			const range = document.createRange();
			range.setStart(node, start);
			range.setEnd(node, start + values.needle.length);
			const selection = document.getSelection();
			selection?.removeAllRanges();
			selection?.addRange(range);
			document.dispatchEvent(new Event("selectionchange"));
		}, { blockText, needle });
	};
	const paste = async (text: string) => {
		await editor.evaluate((element, value) => {
			const data = new DataTransfer();
			data.setData("text/plain", value);
			const event = new Event("paste", { bubbles: true, cancelable: true });
			Object.defineProperty(event, "clipboardData", { value: data });
			element.dispatchEvent(event);
		}, text);
	};

	await editor.getByText("Type @ to try the customizable mention API", {
		exact: false,
	}).evaluate((element) => {
		const editor = element.closest("[contenteditable=true]") as HTMLElement;
		const node = element.firstChild;
		if (!editor || !node) {
			throw new Error("Could not find a link insertion point");
		}
		editor.focus();
		const range = document.createRange();
		range.selectNodeContents(node);
		range.collapse(false);
		const selection = document.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		document.dispatchEvent(new Event("selectionchange"));
	});
	await page.keyboard.press("Enter");
	await page.keyboard.type("First Second");
	await selectText("First", "First Second");
	await paste("https://openai.com");
	await page.keyboard.type(" continues");
	await expect(source).toHaveValue(
		/\[First\]\(https:\/\/openai\.com\) continues Second/,
	);

	await editor.evaluate((element) => {
		const block = Array.from(element.querySelectorAll("p[data-ep]")).find(
			(candidate) => candidate.textContent?.includes("continues Second"),
		);
		if (!block) {
			throw new Error("Could not find the edited link block");
		}
		const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
		let node: Text | undefined;
		while (walker.nextNode()) {
			const candidate = walker.currentNode as Text;
			if (candidate.data.includes(" Second")) {
				node = candidate;
			}
		}
		if (!node) {
			throw new Error("Could not find the link block ending");
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
	await page.keyboard.type("Tweet");
	await selectText("Tweet", "Tweet");
	const initialEmbeds = await editor.locator("[data-ep-line-embed]").count();
	await paste("https://x.com/openai/status/42");
	await expect(editor.locator("[data-ep-line-embed]")).toHaveCount(
		initialEmbeds + 1,
	);
	await page.keyboard.type("after embed");
	await expect(source).toHaveValue(
		/\[Tweet\]\(https:\/\/x\.com\/openai\/status\/42\)\nafter embed/,
	);
	await expect(editor.locator("[data-ep-line-embed]")).toHaveCount(
		initialEmbeds + 1,
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

test("Markdown tables stay editable and render with semantic alignment", async ({ page }) => {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	const source = page.locator("textarea[name='content']");
	await expect(editor.locator("[data-ep-table-row]")).toHaveCount(3);
	const firstCell = editor.locator("[data-ep-table-cell]").first();
	await expect(firstCell).toHaveCSS("position", "relative");
	expect(
		await firstCell.evaluate((cell) =>
			getComputedStyle(cell, "::before").position
		),
	).toBe("absolute");
	expect(
		await editor.locator("[data-ep-table-cell]:last-child").first().evaluate(
			(cell) => getComputedStyle(cell, "::after").position,
		),
	).toBe("absolute");
	await placeCaretAtTextEnd(editor, "Centered");
	await page.keyboard.type("!");
	await expect(source).toHaveValue(/\| Alignment \| Centered! \| Right \|/);

	await page.getByRole("button", { name: "Preview" }).click();
	const table = page.locator("[data-ep-preview] table[data-ep-table]");
	await expect(table.locator("thead th")).toHaveCount(3);
	await expect(table.locator("tbody tr")).toHaveCount(2);
	await expect(table.locator("thead th").nth(0)).toHaveCSS(
		"text-align",
		"left",
	);
	await expect(table.locator("thead th").nth(1)).toHaveCSS(
		"text-align",
		"center",
	);
	await expect(table.locator("thead th").nth(2)).toHaveCSS(
		"text-align",
		"right",
	);
});

test("large multiline paste preserves block types, history, and visible caret", async ({ page }) => {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	const source = page.locator("textarea[name='content']");
	const sections = Array.from({ length: 80 }, (_, index) => {
		const number = index + 1;
		return [
			`## Stress ${number}`,
			`Paragraph ${number} with **bold**, _italic_, and [link](https://example.com/${number}).`,
			`> Quote ${number}`,
			`- [x] Task ${number}`,
			`- Item ${number}`,
			`${number}. Ordered ${number}`,
			"```ts",
			`const section${number} = "**literal**";`,
			"```",
			"",
		].join("\n");
	}).join("\n");

	await editor.getByText("Type @ to try the customizable mention API", {
		exact: false,
	}).evaluate((element) => {
		const node = element.firstChild;
		if (!node) {
			throw new Error("Could not find a long-paste insertion point");
		}
		const range = document.createRange();
		range.selectNodeContents(node);
		range.collapse(false);
		const selection = document.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
		document.dispatchEvent(new Event("selectionchange"));
	});
	await page.keyboard.press("Enter");
	const beforePaste = await source.inputValue();
	await editor.evaluate((element, text) => {
		const data = new DataTransfer();
		data.setData("text/plain", text);
		const paste = new Event("paste", { bubbles: true, cancelable: true });
		Object.defineProperty(paste, "clipboardData", { value: data });
		element.dispatchEvent(paste);
	}, sections);

	await expect(source).toHaveValue(
		new RegExp(
			`Stress 80[\\s\\S]*const section80 = "\\*\\*literal\\*\\*";`,
		),
	);
	await expect(editor.locator("[data-ep-quote]")).toHaveCount(81);
	await expect(editor.locator("[data-ep-code]")).toHaveCount(81);

	const expectCaretVisible = async () => {
		await expect.poll(() =>
			page.evaluate(() => {
				const selection = document.getSelection();
				if (!selection?.rangeCount) {
					return false;
				}
				const rect = selection.getRangeAt(0).getBoundingClientRect();
				return rect.top >= 0 && rect.bottom <= innerHeight;
			})
		).toBe(true);
	};
	await expectCaretVisible();

	await page.keyboard.press("ControlOrMeta+z");
	await expect(source).toHaveValue(beforePaste);
	await expectCaretVisible();
	await page.keyboard.press("ControlOrMeta+Shift+z");
	await expect(source).toHaveValue(/Stress 80/);
	await expectCaretVisible();
});

test("select all replaces every block and trailing atom without inheriting style", async ({ page }) => {
	const editor = page.getByRole("textbox", {
		name: "Demo Markdown document",
	});
	const source = page.locator("textarea[name='content']");
	const original = await source.inputValue();
	const replacement = [
		"## Replacement heading",
		"> Replacement quote",
		"- [x] Replacement task",
		"```js",
		"const literal = '**code**';",
		"```",
		"Replacement tail",
	].join("\n");

	await editor.focus();
	await page.keyboard.press("Control+a");
	await editor.evaluate((element, text) => {
		const data = new DataTransfer();
		data.setData("text/plain", text);
		const paste = new Event("paste", { bubbles: true, cancelable: true });
		Object.defineProperty(paste, "clipboardData", { value: data });
		element.dispatchEvent(paste);
	}, replacement);

	await expect(source).toHaveValue(replacement);
	await expect(editor.locator("[data-ep-img]")).toHaveCount(0);
	await expect(editor.locator("[data-ep-h='2']")).toContainText(
		"Replacement heading",
	);
	await expect(editor.locator("[data-ep-code]")).toContainText(
		"const literal = '**code**';",
	);

	await page.keyboard.press("Control+z");
	await expect(source).toHaveValue(original);
	await page.keyboard.press("Control+Shift+z");
	await expect(source).toHaveValue(replacement);
});
