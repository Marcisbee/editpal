import { Fragment, h } from "preact";
import { createPortal } from "preact/compat";
import { useStore } from "exome/preact";
import { useContext, useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { RefObject } from "preact";

import { EditorContext, preventDefaultAndStop } from "./editpal.tsx";
import { ACTION } from "./model.ts";
import { toMarkdown } from "./markdown-parser.ts";
import { Toolbar } from "./toolbar.tsx";
import type { AnyToken, InlineToken } from "./tokens.ts";
import { isBlockToken } from "./tokens.ts";

function linkedToken(token: AnyToken | undefined): InlineToken | undefined {
	if (!token) {
		return;
	}
	if (isBlockToken(token)) {
		return token.children.find((child) =>
			child.type === "url" ||
			(child.type === "t" && Boolean(child.props.link || child.props.url))
		);
	}
	return token.type === "url" ||
			(token.type === "t" && Boolean(token.props.link || token.props.url))
		? token
		: undefined;
}

function linkValue(token: InlineToken): string {
	if (token.type === "url") {
		return token.src;
	}
	return token.type === "t"
		? String(token.props.link || token.props.url || "")
		: "";
}

function LinkToolbar({ token }: { token: InlineToken }) {
	const { editor, extensions, model, setActiveId } = useContext(EditorContext);
	const [url, setUrl] = useState(linkValue(token));

	useEffect(() => setUrl(linkValue(token)), [token.id, linkValue(token)]);

	function endTokenId(): string {
		let endId = token.id;
		if (token.type === "t" && token.props.link) {
			const parent = model.parent(token.key);
			const index = parent?.children.indexOf(token) ?? -1;
			for (
				let cursor = index + 1;
				cursor < (parent?.children.length || 0);
				cursor++
			) {
				const child = parent?.children[cursor];
				if (child?.type !== "t" || child.props.link !== token.props.link) {
					break;
				}
				endId = child.id;
			}
		}
		return endId;
	}

	function placeAfter(endId: string) {
		const currentKey = model._idToKey[token.id];
		const current = currentKey ? model.findElement(currentKey) : undefined;
		const parent = current && !isBlockToken(current)
			? model.parent(current.key)
			: undefined;
		const isLineEmbed = parent &&
			extensions?.lineEmbeds?.some((definition) =>
				Boolean(definition.match(toMarkdown([parent]), parent))
			);
		if (parent && isLineEmbed) {
			const blockIndex = model.tokens.indexOf(parent);
			const nextBlock = model.tokens[blockIndex + 1];
			if (nextBlock?.children[0]) {
				model.select(nextBlock.children[0], 0);
			} else {
				model.placeCaretAfter(endId);
				model.action(ACTION._Enter);
			}
		} else {
			model.placeCaretAfter(endId);
		}
	}

	function finish(value: string | null) {
		const endId = endTokenId();
		model.updateLink(token.id, value);
		placeAfter(endId);
		setActiveId(undefined);
		editor.current?.focus({ preventScroll: true });
	}

	return (
		<div data-ep-context-toolbar="link">
			<Toolbar hideLink />
			<div className="e-fl-toolbar-row e-toolbar-link-editor">
				<input
					aria-label="Link URL"
					type="url"
					value={url}
					onInput={(event) => setUrl(event.currentTarget.value)}
					onKeyDown={(event) => {
						event.stopPropagation();
						if (event.key === "Enter") {
							event.preventDefault();
							finish(url.trim() || null);
						}
						if (event.key === "Escape") {
							placeAfter(endTokenId());
							setActiveId(undefined);
							editor.current?.focus({ preventScroll: true });
						}
					}}
				/>
				<button
					type="button"
					aria-label="Apply link"
					title="Apply URL"
					onMouseDown={preventDefaultAndStop}
					onClick={(event) => {
						preventDefaultAndStop(event);
						finish(url.trim() || null);
					}}
				>
					✓
				</button>
				<button
					type="button"
					aria-label="Unlink"
					title="Unlink"
					onMouseDown={preventDefaultAndStop}
					onClick={(event) => {
						preventDefaultAndStop(event);
						finish(null);
					}}
				>
					×
				</button>
			</div>
		</div>
	);
}

function AssetToolbar(
	{ token }: {
		token: Extract<InlineToken, { type: "attachment" | "img" }>;
	},
) {
	const { editor, extensions, model, replaceAsset, setActiveId } = useContext(
		EditorContext,
	);
	const inputRef = useRef<HTMLInputElement>(null);
	const isImage = token.type === "img" ||
		(token.type === "attachment" && token.props.kind === "image");
	const label = isImage
		? token.props.alt || ""
		: token.type === "attachment"
		? token.props.name
		: "";

	function remove() {
		model.selection.setSelection(token.key, 0, token.key, 0);
		model.action(ACTION._Key, "");
		setActiveId(undefined);
		editor.current?.focus({ preventScroll: true });
	}

	return (
		<div className="e-fl-toolbar-row" data-ep-context-toolbar="asset">
			{isImage && (
				<input
					aria-label="Image alt text"
					placeholder="Alt text"
					value={label}
					onKeyDown={(event) => event.stopPropagation()}
					onInput={(event) =>
						model.updateAsset(token.id, { alt: event.currentTarget.value })}
				/>
			)}
			{extensions?.attachments && (
				<>
					<button
						type="button"
						aria-label={`Replace ${isImage ? "image" : "file"}`}
						title={`Replace ${isImage ? "image" : "file"}`}
						onMouseDown={preventDefaultAndStop}
						onClick={(event) => {
							preventDefaultAndStop(event);
							inputRef.current?.click();
						}}
					>
						↻
					</button>
					<input
						ref={inputRef}
						type="file"
						hidden
						accept={isImage ? "image/*" : extensions.attachments.accept}
						onChange={(event) => {
							const file = event.currentTarget.files?.[0];
							if (file) {
								void replaceAsset(token.id, file);
							}
							event.currentTarget.value = "";
						}}
					/>
				</>
			)}
			<button
				type="button"
				aria-label={`Remove ${isImage ? "image" : "file"}`}
				title={`Remove ${isImage ? "image" : "file"}`}
				onMouseDown={preventDefaultAndStop}
				onClick={(event) => {
					preventDefaultAndStop(event);
					remove();
				}}
			>
				×
			</button>
		</div>
	);
}

function toolbarButtons(toolbar: HTMLElement): HTMLButtonElement[] {
	return Array.from(
		toolbar.querySelectorAll<HTMLButtonElement>("button:not([disabled])"),
	);
}

function setRovingButton(
	toolbar: HTMLElement,
	active: HTMLButtonElement | undefined,
) {
	for (const button of toolbarButtons(toolbar)) {
		button.tabIndex = button === active ? 0 : -1;
	}
}

export function FloatingToolbar(
	{ toolbarRef }: { toolbarRef: RefObject<HTMLDivElement> },
) {
	const { activeId, editable, editor, extensions, model } = useContext(
		EditorContext,
	);
	const { focus, first, last, getOffset, getPortal } = useStore(
		model.selection,
	);
	const { x, y } = getOffset();
	const portalElement = useMemo(getPortal, [getPortal]);
	const active = activeId
		? model.findElement(model._idToKey[activeId])
		: undefined;
	const selected = model.findElement(first[0]);
	const selectionTouchesCode = model.selectionTouchesCodeBlock;
	const link = linkedToken(active) || linkedToken(selected);
	const asset = active?.type === "img" || active?.type === "attachment"
		? active
		: undefined;
	const collapsed = first[0] === last[0] && first[1] === last[1];
	const beforeCaret = collapsed && selected?.type === "t"
		? selected.text.slice(0, first[1])
		: "";
	const mentionQueryOpen = Boolean(
		beforeCaret && extensions?.mentions?.some((config) => {
			if (config.getQuery) {
				return Boolean(config.getQuery(beforeCaret, config.trigger));
			}
			const index = beforeCaret.lastIndexOf(config.trigger);
			return index >= 0 &&
				(index === 0 || /\s|\(|\[|\{/.test(beforeCaret[index - 1])) &&
				!/\s/.test(beforeCaret.slice(index + config.trigger.length));
		}),
	);
	const rect = useMemo(() => {
		if (activeId && editor.current) {
			const element = Array.from(
				editor.current.querySelectorAll<HTMLElement>(
					"[data-ep-selectable][data-ep]",
				),
			).find((candidate) => candidate.dataset.ep === activeId);
			if (element) {
				return element.getBoundingClientRect();
			}
		}
		const selection = globalThis.getSelection();
		if (!selection?.rangeCount) {
			return null;
		}
		try {
			return selection.getRangeAt(0).cloneRange().getBoundingClientRect();
		} catch {
			return null;
		}
	}, [activeId, editor, first.join(":"), last.join(":")]);
	const visible = editable && Boolean(rect) && (focus || Boolean(activeId)) &&
		!model.slash.isOpen && !mentionQueryOpen && !selectionTouchesCode &&
		(Boolean(activeId) || !collapsed);

	useEffect(() => {
		const toolbar = toolbarRef.current;
		if (!visible || !toolbar) {
			return;
		}

		const syncRovingButton = () => {
			const buttons = toolbarButtons(toolbar);
			const current = buttons.find((button) => button.tabIndex === 0) ||
				buttons[0];
			setRovingButton(toolbar, current);
		};
		syncRovingButton();

		const observer = new MutationObserver(syncRovingButton);
		observer.observe(toolbar, { childList: true, subtree: true });
		return () => observer.disconnect();
	}, [toolbarRef, visible, active?.id, link?.id, asset?.id]);

	if (!visible || !rect) {
		return null;
	}
	const placeBelow = rect.top - y < 90;
	const viewportWidth = globalThis.innerWidth || 0;
	const center = rect.left + rect.width / 2 - x;
	const left = viewportWidth
		? Math.max(170, Math.min(center, viewportWidth - 170))
		: center;

	const output = (
		<div
			ref={toolbarRef}
			className="e-fl-toolbar"
			role="toolbar"
			aria-label={asset
				? "Asset controls"
				: link
				? "Link and text formatting"
				: "Text formatting"}
			data-ep-toolbar-below={placeBelow || undefined}
			onMouseDown={(event) => event.stopPropagation()}
			onFocus={(event) => {
				if (event.target instanceof HTMLButtonElement) {
					setRovingButton(event.currentTarget, event.target);
				}
			}}
			onKeyDownCapture={(event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					editor.current?.focus({ preventScroll: true });
					return;
				}
				if (!(event.target instanceof HTMLButtonElement)) {
					return;
				}
				const buttons = toolbarButtons(event.currentTarget);
				const current = buttons.indexOf(event.target);
				if (current < 0) {
					return;
				}
				let next: number | undefined;
				if (event.key === "ArrowRight" || event.key === "ArrowDown") {
					next = (current + 1) % buttons.length;
				} else if (
					event.key === "ArrowLeft" || event.key === "ArrowUp"
				) {
					next = (current - 1 + buttons.length) % buttons.length;
				} else if (event.key === "Home") {
					next = 0;
				} else if (event.key === "End") {
					next = buttons.length - 1;
				}
				if (next === undefined) {
					return;
				}
				event.preventDefault();
				event.stopPropagation();
				setRovingButton(event.currentTarget, buttons[next]);
				buttons[next]?.focus({ preventScroll: true });
			}}
			style={{
				left,
				top: (placeBelow ? rect.bottom : rect.top) - y,
			}}
		>
			{asset
				? <AssetToolbar token={asset} />
				: link
				? <LinkToolbar token={link} />
				: <Toolbar />}
		</div>
	);

	return portalElement ? createPortal(output, portalElement) : output;
}
