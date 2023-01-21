import React from "react";
import ReactDOM from "react-dom/client";

import { Editpal } from "./editpal";
import { Model } from "./model";
import { ranID } from "./utils";
import { Debug } from "./debug";

import "./index.css";

const root = [
	{
		id: ranID(),
		type: "h",
		props: {
			size: 2,
		},
		children: [
			{
				id: ranID(),
				type: "t",
				text: "Hello ",
			},
			{
				id: ranID(),
				type: "t",
				props: {
					color: "orangered",
				},
				text: "Jupiter",
			},
			{
				id: ranID(),
				type: "t",
				text: "!",
			},
		],
	},
	{
		id: ranID(),
		type: "h",
		props: {
			size: 3,
		},
		children: [
			{
				id: ranID(),
				type: "t",
				text: "Hello ",
			},
			{
				id: ranID(),
				type: "t",
				props: {
					color: "orangered",
				},
				text: "Jupiter",
			},
			{
				id: ranID(),
				type: "t",
				text: "!",
			},
		],
	},
	{
		id: ranID(),
		type: "todo",
		props: {
			done: false,
		},
		children: [
			{
				id: ranID(),
				type: "t",
				props: {
					color: "orangered",
				},
				text: "asd",
			},
		],
	},
	{
		id: ranID(),
		type: "todo",
		props: {
			done: true,
		},
		children: [
			{
				id: ranID(),
				type: "t",
				props: {},
				text: "fdc",
			},
		],
	},
	{
		id: ranID(),
		type: "l",
		props: {
			type: "ul",
		},
		children: [
			{
				id: ranID(),
				type: "t",
				text: "Bullet",
			},
		],
	},
	{
		id: ranID(),
		type: "l",
		props: {
			type: "ol",
		},
		children: [
			{
				id: ranID(),
				type: "t",
				text: "First",
			},
		],
	},
	{
		id: ranID(),
		type: "l",
		props: {
			type: "ol",
			indent: 1,
		},
		children: [
			{
				id: ranID(),
				type: "t",
				text: "First of first",
			},
		],
	},
	{
		id: ranID(),
		type: "l",
		props: {
			type: "ol",
			indent: 1,
		},
		children: [
			{
				id: ranID(),
				type: "t",
				text: "Second of first",
			},
		],
	},
	{
		id: ranID(),
		type: "l",
		props: {
			type: "ol",
		},
		children: [
			{
				id: ranID(),
				type: "t",
				text: "Second",
			},
		],
	},
	{
		id: ranID(),
		type: "p",
		children: [
			{
				id: ranID(),
				type: "t",
				text: "Unrelated",
			},
		],
	},
	{
		id: ranID(),
		type: "p",
		children: [
			{
				id: ranID(),
				type: "img",
				src: "https://img.strike.lv/photos/7110acef-3ad0-4382-a88f-93e854128be8.jpeg",
			},
		],
	},
	{
		id: ranID(),
		type: "l",
		props: {
			type: "ol",
		},
		children: [
			{
				id: ranID(),
				type: "t",
				text: "First again",
			},
		],
	},
	{
		id: ranID(),
		type: "p",
		props: {},
		children: [
			{
				id: ranID(),
				type: "t",
				props: {
					color: "orangered",
				},
				text: "Hello ",
			},
			{
				id: ranID(),
				type: "t",
				props: {
					fontWeight: "bold",
				},
				text: "World",
			},
			{
				id: ranID(),
				type: "t",
				props: {
					color: "orangered",
				},
				text: " 2",
			},
		],
	},
];

const model = new Model(root as any);

function App() {
	return (
		<div className="App">
			<h1>Text Editor</h1>
			<div>
				<Editpal model={model} />
				<Debug model={model} />
			</div>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
