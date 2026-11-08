import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isValidElement, type ReactElement } from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import { app } from "../workers/index";
import { authRouter } from "../workers/routes/auth";

// Exercise the route's real rendering and event handlers without a browser or API calls.
function loadRoute(file: string, permissions?: unknown) {
	const states: unknown[] = [];
	const requests: unknown[] = [];
	const toasts: unknown[] = [];
	let stateIndex = 0;
	const mutation = { isPending: false, mutateAsync: async (body: unknown) => {
		requests.push(body);
		return { apiKey: "test-only-placeholder" };
	} };
	const query = () => ({ data: [], isLoading: false });
	const source = ts.transpileModule(readFileSync(new URL(`../app/routes/${file}.tsx`, import.meta.url), "utf8"), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
	}).outputText;
	const mocks: Record<string, unknown> = {
		"react/jsx-runtime": jsxRuntime,
		react: {
			useMemo: (fn: () => unknown) => fn(),
			useState: (initial: unknown) => {
				const index = stateIndex++;
				if (!(index in states)) states[index] = initial;
				return [states[index], (value: unknown) => {
					states[index] = typeof value === "function" ? value(states[index]) : value;
				}];
			},
		},
		"@cloudflare/kumo": {
			Badge: "badge", Button: "button", Input: "input", Loader: "loader", Empty: "empty",
			Dialog: Object.assign("dialog", { Root: "dialog-root", Title: "dialog-title" }),
			useKumoToastManager: () => ({ add: (toast: unknown) => toasts.push(toast) }),
		},
		"@phosphor-icons/react": new Proxy({}, { get: () => "icon" }),
		"react-router": { useNavigate: () => () => {} },
		"@tanstack/react-query": { useQuery: () => ({ data: {}, isLoading: false }) },
		"~/queries/auth": { useLogout: () => mutation },
		"~/queries/mailboxes": { useMailboxes: query },
		"~/queries/global-settings": { useApiKeys: query, useCreateApiKey: () => mutation, useRevokeApiKey: () => mutation },
		"~/queries/user-management": new Proxy({}, { get: (_, name) => name === "useUsers" ? query : () => mutation }),
		"~/queries/keys": { queryKeys: { config: ["config"] } },
		"~/services/api": { default: {} },
		"shared/outbound-logs": { OUTBOUND_SEND_SOURCES: [], OUTBOUND_SEND_STATUSES: [] },
		"shared/api-permissions": permissions,
	};
	const exports: Record<string, any> = {};
	new Function("require", "exports", source)((name: string) => {
		assert.ok(name in mocks, `Unexpected route dependency: ${name}`);
		return mocks[name];
	}, exports);
	return {
		requests, toasts,
		render: () => {
			stateIndex = 0;
			return expand(exports.default());
		},
	};
}

function expand(node: any): any {
	if (Array.isArray(node)) return node.map(expand);
	if (!isValidElement(node)) return node;
	const element = node as ReactElement<Record<string, any>>;
	if (typeof element.type === "function") return expand((element.type as Function)(element.props));
	return { type: element.type, props: { ...element.props, children: expand(element.props.children) } };
}

function findAll(node: any, predicate: (node: any) => boolean): any[] {
	if (Array.isArray(node)) return node.flatMap((child) => findAll(child, predicate));
	if (!node || typeof node !== "object") return [];
	return [...(predicate(node) ? [node] : []), ...findAll(node.props?.children, predicate)];
}

function text(node: any): string {
	if (Array.isArray(node)) return node.map(text).join(" ");
	if (node == null || typeof node === "boolean") return "";
	if (typeof node !== "object") return String(node);
	return text(node.props?.children);
}

async function registry() {
	return import("../shared/api-permissions");
}

test("API key scopes are selectable, default to transactional only, and reject empty selection before requesting", async () => {
	const permissions = await registry();
	const route = loadRoute("global-settings", permissions);
	let tree = route.render();
	const checkboxes = () => findAll(tree, (node) => node.type === "input" && node.props.type === "checkbox");
	assert.equal(checkboxes().length, permissions.API_KEY_SCOPES.length);
	assert.deepEqual(checkboxes().filter((node) => node.props.checked).map((node) => node.props.value), ["transactional:send"]);
	for (const scope of permissions.API_KEY_SCOPES) {
		assert.ok(text(tree).includes(permissions.API_KEY_SCOPE_DETAILS[scope].description));
	}
	checkboxes().find((node) => node.props.value === "transactional:send").props.onChange({ target: { checked: false } });
	tree = route.render();
	await findAll(tree, (node) => node.type === "button" && text(node) === "Create key")[0].props.onClick();
	assert.equal(route.requests.length, 0);
	tree = route.render();
	assert.ok(findAll(tree, (node) => node.props.role === "alert").length > 0);
	checkboxes().find((node) => node.props.value === "emails:read").props.onChange({ target: { checked: true } });
	tree = route.render();
	findAll(tree, (node) => node.props.label === "Allowed mailboxes")[0].props.onChange({ target: { value: " one@example.com, , two@example.com " } });
	tree = route.render();
	await findAll(tree, (node) => node.type === "button" && text(node) === "Create key")[0].props.onClick();
	assert.deepEqual(route.requests[0], { name: "", scopes: ["emails:read"], allowedMailboxes: ["one@example.com", "two@example.com"] });
	tree = route.render();
	assert.deepEqual(checkboxes().filter((node) => node.props.checked).map((node) => node.props.value), ["transactional:send"]);
});

test("every documented endpoint renders registry-derived auth, required scope and whitelist rules", async () => {
	const permissions = await registry();
	const tree = loadRoute("api-docs", permissions).render();
	const cards = findAll(tree, (node) => node.props["data-api-endpoint"]);
	assert.ok(cards.length > permissions.API_KEY_ENDPOINTS.length);
	for (const card of cards) {
		const [method, path] = card.props["data-api-endpoint"].split(" ");
		const endpoint = permissions.getApiKeyEndpoint(method, path);
		const content = text(card);
		assert.match(content, /Authentication/);
		assert.match(content, /Required API key scope/);
		assert.match(content, /Mailbox whitelist/);
		if (endpoint) {
			assert.ok(content.includes(endpoint.scope), `${method} ${path}`);
			assert.match(content, /API Key/);
			assert.match(content, /empty/i);
			if (endpoint.mailboxRule === "body") {
				assert.match(content, /401/);
				assert.match(content, /legacy/i);
			} else if (endpoint.mailboxRule === "path") {
				assert.match(content, /403/);
			}
		} else {
			assert.match(content, /N\/A/);
		}
		if (path.startsWith("/api/v1/settings/") || (path.startsWith("/api/v1/operations/") && !path.endsWith("provider-receipts"))) {
			assert.match(content, /Admin Session Cookie/);
		}
	}
	for (const endpoint of permissions.API_KEY_ENDPOINTS) {
		assert.ok(cards.some((card) => card.props["data-api-endpoint"] === `${endpoint.method} ${endpoint.path}`), `Missing docs for ${endpoint.path}`);
	}
	const documented = new Set(cards.map((card) => card.props["data-api-endpoint"]));
	const httpRoutes = [...app.routes, ...authRouter.routes.map((route) => ({ ...route, path: `/api/v1/auth${route.path}` }))];
	for (const route of httpRoutes.filter((route) => route.method !== "ALL")) {
		assert.ok(documented.has(`${route.method} ${route.path}`), `Missing docs for ${route.method} ${route.path}`);
	}
	const exampleText = findAll(tree, (node) => node.type === "pre").map(text).join("\n");
	assert.match(exampleText, /page=1/);
	assert.match(exampleText, /\/reply/);
	assert.match(exampleText, /\/forward/);
	assert.match(exampleText, /"scopes"/);
	assert.match(exampleText, /X-Agentic-Inbox-Api-Key/);
	assert.match(text(tree), /including Drafts/);
	assert.doesNotMatch(text(tree), /cannot access drafts|cannot access draft records|do not grant draft access|non-draft/i);
	const creationJson = findAll(tree, (node) => node.type === "pre")
		.map(text).find((code) => code.startsWith('{\n  "name": "mailbox-service"'));
	assert.ok(creationJson);
	assert.deepEqual(JSON.parse(creationJson).scopes,
		[...new Set(permissions.API_KEY_ENDPOINTS.filter((endpoint) => endpoint.mailboxRule !== "body").map((endpoint) => endpoint.scope))]);
});

test("docs search matches registry-derived scope and authentication labels", async () => {
	const permissions = await registry();
	const route = loadRoute("api-docs", permissions);
	let tree = route.render();
	findAll(tree, (node) => node.props.label === "Search APIs")[0].props.onChange({ target: { value: "emails:read" } });
	tree = route.render();
	const cards = findAll(tree, (node) => node.props["data-api-endpoint"]);
	assert.equal(cards.length, permissions.API_KEY_ENDPOINTS.filter((endpoint) => endpoint.scope === "emails:read").length);
	for (const card of cards) assert.match(text(card), /Session Cookie or API Key/);
});
