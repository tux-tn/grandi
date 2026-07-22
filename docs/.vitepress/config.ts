import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const apiSidebarPath = path.resolve(configDir, "../api/typedoc-sidebar.json");
const apiSidebar = fs.existsSync(apiSidebarPath)
	? JSON.parse(fs.readFileSync(apiSidebarPath, "utf8"))
	: [];
const rootPackage = JSON.parse(
	fs.readFileSync(path.resolve(configDir, "../../package.json"), "utf8"),
);
const base = process.env.DOCS_BASE ?? "/";

export default defineConfig({
	title: "Grandi",
	description: "TypeScript-first native Node.js bindings for NDI",
	base,
	lang: "en-US",
	cleanUrls: true,
	lastUpdated: true,
	head: [
		["link", { rel: "icon", href: `${base}mark.svg`, type: "image/svg+xml" }],
		["meta", { name: "theme-color", content: "#080d12" }],
		["meta", { property: "og:type", content: "website" }],
		["meta", { property: "og:title", content: "Grandi" }],
		[
			"meta",
			{
				property: "og:description",
				content:
					"Send, receive, discover, route, and synchronize NDI streams from Node.js.",
			},
		],
	],
	vite: {
		plugins: [llmstxt()],
	},
	themeConfig: {
		logo: "/mark.svg",
		siteTitle: "GRANDI",
		nav: [
			{ text: "Start", link: "/guide/installation" },
			{ text: "Guides", link: "/guide/receiving" },
			{ text: "Timing", link: "/concepts/timing" },
			{ text: "API", link: "/api/" },
			{
				text: `v${rootPackage.version}`,
				items: [
					{ text: "npm", link: "https://www.npmjs.com/package/grandi" },
					{ text: "Release notes", link: "/releases" },
					{
						text: "GitHub releases",
						link: "https://github.com/tux-tn/grandi/releases",
					},
				],
			},
		],
		sidebar: {
			"/guide/": [
				{
					text: "Get started",
					items: [
						{ text: "Installation", link: "/guide/installation" },
						{ text: "Migrate to version 2", link: "/guide/migration-v2" },
						{ text: "Lifecycle", link: "/guide/lifecycle" },
					],
				},
				{
					text: "Workflows",
					items: [
						{ text: "Discover sources", link: "/guide/discovery" },
						{ text: "Receive media", link: "/guide/receiving" },
						{ text: "Send media", link: "/guide/sending" },
						{ text: "Frame synchronization", link: "/guide/frame-sync" },
						{ text: "Route sources", link: "/guide/routing" },
					],
				},
				{
					text: "Operations",
					items: [
						{ text: "Platform support", link: "/guide/platforms" },
						{
							text: "Electron and bundlers",
							link: "/guide/electron-bundlers",
						},
						{ text: "Troubleshooting", link: "/guide/troubleshooting" },
					],
				},
			],
			"/concepts/": [
				{
					text: "Concepts",
					items: [
						{ text: "Timing & timecode", link: "/concepts/timing" },
						{ text: "Frame contracts", link: "/concepts/frames" },
						{ text: "Native runtime", link: "/concepts/native-runtime" },
						{
							text: "NDI SDK guidance",
							link: "/concepts/sdk-guidance",
						},
					],
				},
			],
			"/api/": [{ text: "API reference", items: apiSidebar }],
		},
		socialLinks: [{ icon: "github", link: "https://github.com/tux-tn/grandi" }],
		search: { provider: "local" },
		outline: { level: [2, 3], label: "On this page" },
		docFooter: { prev: "Previous", next: "Next" },
		footer: {
			message: "Apache-2.0 licensed. NDI is a trademark of Vizrt NDI AB.",
			copyright: "Grandi documentation",
		},
	},
});
