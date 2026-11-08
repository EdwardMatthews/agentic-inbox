import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { Hono } from "hono";
import { authMiddleware, type AppAuthContext } from "../workers/lib/auth-middleware";
import { sha256 } from "../workers/lib/auth";
import { app } from "../workers/index";
import type { Env } from "../workers/types";
import { API_KEY_ENDPOINTS } from "../shared/api-permissions";

register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, nextResolve) {
	if (specifier === "cloudflare:workers") return {
		shortCircuit: true, url: "data:text/javascript,export class DurableObject {}"
	};
	return nextResolve(specifier, context);
}`)}`, import.meta.url);
const { OperationsDO } = await import("../workers/operations/index");

const a = "one@example.com";
const b = "two@example.com";
const mailboxPath = (address = a) => `/api/v1/mailboxes/${encodeURIComponent(address)}`;

async function setup(scopes = ["mailboxes:read", "emails:read", "emails:send", "transactional:send"], allowed: string[] = []) {
	const keyHash = await sha256("test-machine-key");
	const key = {
		id: "key-1", name: "Test", key_prefix: "test", key_hash: keyHash,
		scopes_json: JSON.stringify(scopes), allowed_mailboxes_json: JSON.stringify(allowed),
		created_at: new Date().toISOString(), revoked_at: null as string | null,
	};
	const logs: unknown[] = [];
	const sent: unknown[] = [];
	const accesses: string[] = [];
	const readThreads: string[] = [];
	const storedKeys: unknown[][] = [];
	const ops = Object.create(OperationsDO.prototype);
	const mailbox = {
		getMailboxSummary: async () => ({ inboxUnreadCount: 0 }),
		getFolders: async () => [{ id: "inbox", name: "Inbox" }],
		getEmails: async () => [{ id: "original", subject: "Hello" }],
		countEmails: async () => 1,
		getEmail: async () => ({
			id: "original", subject: "Hello", sender: "reader@example.com",
			date: new Date().toISOString(), body: "Original", thread_id: "original",
			message_id: "original@example.com", attachments: [],
		}),
		getThreadEmails: async () => [{ id: "original" }],
		searchEmails: async () => [{ id: "original" }],
		countSearchResults: async () => 1,
		getAttachment: async () => ({ email_id: "original", filename: "test.txt", mimetype: "text/plain" }),
		markThreadRead: async (id: string) => { readThreads.push(id); },
		createEmail: async (...args: unknown[]) => { sent.push(args); },
	};
	const env = {
		OPERATIONS: { idFromName: () => "global", get: () => ops },
		MAILBOX: { idFromName: (name: string) => name, get: (name: string) => { accesses.push(name); return mailbox; } },
		BUCKET: {
			head: async (name: string) => [`mailboxes/${a}.json`, `mailboxes/${b}.json`].includes(name) ? {} : null,
			list: async () => ({ objects: [a, b].map((email) => ({ key: `mailboxes/${email}.json` })), truncated: false }),
			get: async (name: string) => name.startsWith("attachments/")
				? { body: "Attachment content" }
				: { json: async () => ({ fromName: "Example" }) },
		},
		EMAIL: { send: async () => ({ messageId: "provider-id" }) },
	} as unknown as Env;
	Object.assign(ops, {
		env,
		countUsers: async () => 1,
		getSessionByToken: async (role: string) => ({
			user: { id: role, status: "active", globalRole: role === "admin" ? "admin" : "member" },
			session: { id: "session" },
		}),
		getAccessibleMailboxIds: async (_id: string, role: string) => role === "admin" ? null : [a],
		getMailboxRole: async (id: string, _role: string, mailboxId: string) => mailboxId !== a ? null : id === "viewer" ? "viewer" : "editor",
		row: (sql: string, value?: string) => {
			if (sql.includes("key_hash =") && value === keyHash && !key.revoked_at) return key;
			const created = storedKeys.at(-1);
			if (created && sql.includes("FROM api_keys WHERE id") && value === created[0]) {
				return { id: created[0], name: created[1], key_prefix: created[2], scopes_json: created[4], allowed_mailboxes_json: created[5], created_at: created[6] };
			}
			return null;
		},
		rows: () => [],
		run: (sql: string, ...params: unknown[]) => { if (sql.includes("INSERT INTO api_keys")) storedKeys.push(params); },
		writeOutboundSendLog: async (entry: unknown) => { logs.push(entry); },
	});
	const router = new Hono<AppAuthContext>();
	router.use("*", authMiddleware);
	router.route("/", app);
	const tasks: Promise<unknown>[] = [];
	const request = (path: string, options: { method?: string; payload?: unknown; header?: string; cookie?: string; token?: string; noKey?: boolean; origin?: string; headers?: Record<string, string> } = {}) => router.request(path, {
		method: options.method ?? "GET",
		headers: {
			...(!options.noKey ? { [options.header ?? "Authorization"]: options.header ? options.token ?? "test-machine-key" : `Bearer ${options.token ?? "test-machine-key"}` } : {}),
			...(options.cookie ? { Cookie: `agentic_inbox_session=${options.cookie}` } : {}),
			...(options.payload ? { "Content-Type": "application/json" } : {}),
			...(options.origin ? { Origin: options.origin } : {}),
			...options.headers,
		},
		body: options.payload ? JSON.stringify(options.payload) : undefined,
	}, env, { waitUntil: (task) => { tasks.push(task); }, passThroughOnException: () => {}, props: {} });
	return { request, key, accesses, tasks, sent, logs, storedKeys, ops, mailbox, env, readThreads };
}

test("API keys list all mailboxes or only allowlisted mailboxes", async () => {
	for (const [allowed, expected] of [[[], [a, b]], [[a], [a]]] as [string[], string[]][]) {
		const { request } = await setup(["mailboxes:read"], allowed);
		const response = await request("/api/v1/mailboxes");
		assert.equal(response.status, 200);
		assert.equal(response.headers.get("Cache-Control"), "private, no-store");
		const mailboxes = await response.json() as { id: string }[];
		assert.deepEqual(mailboxes.map((m) => m.id), expected);
	}
});

test("mailboxes:read permits metadata but not mail content", async () => {
	const { request } = await setup(["mailboxes:read"]);
	assert.equal((await request(mailboxPath())).status, 200);
	assert.equal((await request(mailboxPath() + "/emails")).status, 403);
});

test("emails:read covers list, detail, threads, search, folders and attachments without mutations", async () => {
	const { request } = await setup(["emails:read"]);
	for (const path of ["/emails?folder=inbox", "/emails/original", "/threads/original", "/search?query=Hello", "/folders", "/emails/original/attachments/file"]) {
		assert.equal((await request(mailboxPath() + path)).status, 200, path);
	}
	assert.equal((await request("/api/v1/mailboxes")).status, 403);
	for (const [method, path] of [["PUT", "/emails/original"], ["POST", "/threads/original/read"], ["DELETE", "/emails/original"]]) {
		assert.equal((await request(mailboxPath() + path, { method, payload: { read: true } })).status, 403);
	}
});

test("emails:send sends, replies and forwards without granting read or administrative permissions", async () => {
	const { request, tasks, sent, logs } = await setup(["emails:send"], [a]);
	for (const suffix of ["/emails", "/emails/original/reply", "/emails/original/forward"]) {
		const response = await request(mailboxPath() + suffix, {
			method: "POST", payload: { from: a, to: "reader@example.com", subject: "Hello", text: "Message" },
		});
		assert.equal(response.status, 202, await response.text());
	}
	await Promise.all(tasks);
	assert.equal(sent.length, 3);
	assert.equal(logs.length, 6);
	assert.equal((await request(mailboxPath() + "/emails")).status, 403);
	assert.equal((await request(mailboxPath(), { method: "DELETE" })).status, 403);
});

test("mailbox whitelist is enforced before R2 or DO access, including encoded mailbox IDs", async () => {
	const { request, accesses } = await setup(["emails:read", "emails:send", "mailboxes:read"], [a]);
	assert.equal((await request(mailboxPath(b) + "/emails")).status, 403);
	assert.equal((await request(mailboxPath(b))).status, 403);
	assert.equal((await request(mailboxPath(b) + "/emails", { method: "POST", payload: {} })).status, 403);
	assert.deepEqual(accesses, []);
});

test("literal percent escapes in a whitelisted mailbox are not decoded into a different mailbox", async () => {
	const allowed = "percent%2e@example.com";
	const { request, accesses, env } = await setup(["emails:read"], [allowed]);
	env.BUCKET.head = async () => ({}) as R2Object;
	assert.equal((await request(mailboxPath(allowed) + "/emails")).status, 200);
	assert.deepEqual(accesses, [allowed]);
});

test("unknown, revoked, missing and query-string keys cannot authenticate", async () => {
	const { request, key } = await setup();
	assert.equal((await request("/api/v1/mailboxes", { token: "wrong", cookie: "admin" })).status, 401);
	assert.equal((await request("/api/v1/mailboxes?api_key=test-machine-key", { noKey: true })).status, 401);
	key.revoked_at = new Date().toISOString();
	assert.equal((await request("/api/v1/mailboxes")).status, 401);
});

test("the direct API key header works and conflicting headers fail closed", async () => {
	const { request } = await setup();
	assert.equal((await request("/api/v1/mailboxes", { header: "X-Agentic-Inbox-Api-Key" })).status, 200);
	assert.equal((await request("/api/v1/mailboxes", { headers: { "X-Agentic-Inbox-Api-Key": "test-machine-key" } })).status, 200);
	const invalidHeaders: Record<string, string>[] = [
		{ "X-Agentic-Inbox-Api-Key": "wrong" },
		{ Authorization: "Basic invalid" },
		{ Authorization: "Bearer" },
		{ "X-Agentic-Inbox-Api-Key": "" },
	];
	for (const headers of invalidHeaders) {
		assert.equal((await request("/api/v1/mailboxes", { headers, cookie: "admin" })).status, 401);
	}
});

test("machine keys do not bypass session-only paths even alongside an admin cookie", async () => {
	const { request } = await setup();
	for (const [method, path] of [
		["GET", "/api/v1/settings/api-keys"], ["GET", "/api/v1/operations/send-logs"],
		["POST", "/api/v1/mailboxes"], ["DELETE", mailboxPath()], ["PUT", mailboxPath()],
		["POST", mailboxPath() + "/drafts"], ["POST", mailboxPath() + "/folders"],
		["POST", mailboxPath() + "/emails/original/move"], ["GET", "/mcp"],
	]) {
		assert.equal((await request(path, { method, cookie: "admin", payload: method === "GET" ? undefined : {} })).status, 403, path);
	}
});

test("all unlisted HTTP routes deny API keys instead of inheriting admin-cookie privileges", async () => {
	const { request } = await setup();
	const supported = new Set(API_KEY_ENDPOINTS.map((endpoint) => endpoint.method + " " + endpoint.path));
	for (const route of app.routes) {
		if (route.method === "ALL" || supported.has(route.method + " " + route.path)) continue;
		const response = await request(route.path, {
			method: route.method, cookie: "admin", payload: route.method === "GET" ? undefined : {},
		});
		assert.equal(response.status, 403, route.method + " " + route.path);
	}
});

test("existing sessions preserve read access, editor sends and CSRF checks", async () => {
	const { request } = await setup();
	assert.equal((await request(mailboxPath() + "/emails", { noKey: true, cookie: "viewer" })).status, 200);
	const payload = { from: a, to: "reader@example.com", subject: "Hello", text: "Message" };
	assert.equal((await request(mailboxPath() + "/emails", { noKey: true, cookie: "viewer", method: "POST", payload })).status, 403);
	assert.equal((await request(mailboxPath() + "/emails", { noKey: true, cookie: "editor", method: "POST", payload, origin: "https://foreign.example" })).status, 403);
	assert.equal((await request(mailboxPath() + "/emails", { noKey: true, cookie: "editor", method: "POST", payload })).status, 202);
});

test("transactional:send remains isolated and honors its mailbox allowlist", async () => {
	const { request } = await setup(["transactional:send"], [a]);
	assert.equal((await request("/api/v1/mailboxes")).status, 403);
	const payload = { mailboxId: a, to: "reader@example.com", subject: "Hello", text: "Message" };
	assert.equal((await request("/api/v1/transactional/send", { method: "POST", payload })).status, 202);
	assert.equal((await request("/api/v1/transactional/send", { method: "POST", payload: { ...payload, mailboxId: b } })).status, 401);
	const sendOnly = await setup(["emails:send"]);
	assert.equal((await sendOnly.request("/api/v1/transactional/send", { method: "POST", payload })).status, 401);
});

test("creation rejects unknown scopes and empty selection without persisting a key", async () => {
	const { request, storedKeys } = await setup();
	for (const scopes of [[], ["*"], ["emails:delete"], ["emails:read", "bogus"]]) {
		const response = await request("/api/v1/settings/api-keys", {
			noKey: true, cookie: "admin", method: "POST", payload: { name: "Invalid", scopes },
		});
		assert.equal(response.status, 400);
	}
	assert.equal(storedKeys.length, 0);
});

test("API key creation supports all four scopes, normalizes allowlists, and preserves the legacy default", async () => {
	const { request, storedKeys } = await setup();
	const scopes = ["mailboxes:read", "emails:read", "emails:send", "transactional:send"];
	for (const [extra, expectedScopes] of [
		[{ scopes, allowedMailboxes: [" ONE@example.com ", a] }, scopes],
		[{}, ["transactional:send"]],
	] as [Record<string, unknown>, string[]][]) {
		const response = await request("/api/v1/settings/api-keys", {
			noKey: true, cookie: "admin", method: "POST", payload: { name: "Example", ...extra },
		});
		assert.equal(response.status, 201, await response.text());
		assert.deepEqual(JSON.parse(String(storedKeys.at(-1)?.[4])), expectedScopes);
	}
	assert.deepEqual(JSON.parse(String(storedKeys[0][5])), [a]);
	assert.deepEqual(JSON.parse(String(storedKeys[1][5])), []);
});

test("read-only keys cannot request attachments under a different email ID", async () => {
	const { request } = await setup(["emails:read"]);
	assert.equal((await request(mailboxPath() + "/emails/wrong/attachments/file")).status, 404);
});

test("send keys do not need a browser Origin and cannot spoof a different sender", async () => {
	const { request, tasks } = await setup(["emails:send"], [a]);
	const payload = { from: a, to: "reader@example.com", subject: "Hello", text: "Message" };
	assert.equal((await request(mailboxPath() + "/emails", { method: "POST", origin: "https://other.example", payload })).status, 202);
	assert.equal((await request(mailboxPath() + "/emails", { method: "POST", payload: { ...payload, from: b } })).status, 400);
	await Promise.all(tasks);
});

test("API key replies do not mutate read flags while session replies preserve that behavior", async () => {
	const { request, tasks, readThreads } = await setup(["emails:send"], [a]);
	const path = mailboxPath() + "/emails/original/reply";
	const payload = { from: a, to: "reader@example.com", subject: "Reply", text: "Hello" };
	assert.equal((await request(path, { method: "POST", payload })).status, 202);
	assert.deepEqual(readThreads, []);
	assert.equal((await request(path, { method: "POST", payload, noKey: true, cookie: "editor" })).status, 202);
	assert.deepEqual(readThreads, ["original"]);
	await Promise.all(tasks);
});
