import { h, Fragment } from "preact";
import { useStore } from "exome/preact";

import { Model } from "./model";
import { AnyToken } from "./tokens";

function buildIndent(indent: number) {
	return " ".repeat(indent);
}

/**
 root
  ├ (1) heading  
  | └ (2) text  "Welcome to the playground"
  ├ (3) quote  
  | └ (4) text  "In case you were wondering what the black box at the bottom is – it's the debug view, showing the current state of editor. You can disable it by pressing on the settings control in the bottom-left of your screen and toggling the debug view setting."
  ├ (5) paragraph  
  | ├ (6) text  "The playground is a demo environment built with "
  | ├ (7) text  "@lexical/react" { format: code }
  | ├ (8) text  ". Try typing in "
  | ├ (10) text  "some text" { format: bold }
  | ├ (11) text  " with "
  | ├ (12) text  "different" { format: italic }
  | └ (13) text  " formats."

 selection: range 
  ├ anchor { key: 30, offset: 5, type: text }
  └ focus { key: 38, offset: 4, type: text }
 */
function debug(tokens: AnyToken | AnyToken[], indent = 0): string[] {
	let dent = buildIndent(indent);

	if (Array.isArray(tokens)) {
		if (indent === 0) {
			return ["root", ...tokens.map((t) => debug(t, indent + 1)).flat()];
		}

		return tokens.map((t) => debug(t, indent + 1)).flat();
	}

	dent += `├ (${tokens.key}) `;

	if (tokens.type === "t") {
		return [
			`${dent}text ${JSON.stringify(tokens.text)} ${
				tokens.props ? JSON.stringify(tokens.props) : ""
			}`,
		];
	}

	const output: string[] = [`${dent}`];

	if (tokens.type === "p") {
		output[0] += "paragraph";
	} else if (tokens.type === "h") {
		output[0] += "heading";
	} else {
		output[0] += (tokens as any).type;
	}

	if (tokens.props) {
		output[0] += " " + JSON.stringify(tokens.props);
	}

	if (tokens.children?.length) {
		output.push(...debug(tokens.children, indent));
	}

	return output;
}

export function Debug({ model }: { model: Model }) {
	const { tokens, selection } = useStore(model);
	const { first, last, format } = useStore(selection);

	return (
		<pre
			style={{
				textAlign: "left",
				fontSize: 12,
				lineHeight: 1.4,
				height: 300,
				overflowX: "hidden",
				overflowY: "scroll",
				width: "100%",
				border: "1px solid #ccc",
				borderRadius: 6,
				padding: 10,
				boxSizing: "border-box",
			}}
		>
			{`selection\n`}
			{selection ? (
				<>
					{` ├ format ${JSON.stringify(format)}\n`}
					{` ├ first ${JSON.stringify({
						key: first[0],
						offset: first[1],
					})}\n`}
					{` └ last ${JSON.stringify({
						key: last[0],
						offset: last[1],
					})}\n`}
				</>
			) : (
				" └ null"
			)}
			{"\n"}
			{debug(tokens).flat(Number.POSITIVE_INFINITY).join("\n")}
			{"\n"}
		</pre>
	);
}
