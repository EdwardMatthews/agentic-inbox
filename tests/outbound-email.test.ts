import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";
import { Hono } from "hono";
import { Folders } from "../shared/folders";
import type { OutboundSendLog } from "../shared/outbound-logs";
import { app } from "../workers/index";
import { authMiddleware, type AppAuthContext } from "../workers/lib/auth-middleware";
import type { MailboxContext } from "../workers/lib/mailbox";
import { toolSendEmail, toolSendReply } from "../workers/lib/tools";
import type { Env } from "../workers/types";

const loader = `
export async function resolve(specifier, context, nextResolve) {
	if (specifier === "cloudflare:workers") {
		return { shortCircuit: true, url: "data:text/javascript,export class DurableObject {}" };
	}
	return nextResolve(specifier, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(loader)}`, import.meta.url);
const { OperationsDO } = await import("../workers/operations/index");

const mailboxId = "sender@example.com";
const to = "recipient@example.com";
const bodyHtml = "<p>Hello!</p>";

function setup({ providerError, failLogWrites = false, omitProviderMessageId = false }: {
	providerError?: Error;
	failLogWrites?: boolean;
	omitProviderMessageId?: boolean;
} = {}) {
	const sent = Array<string>(100).fill(Folders.SENT);
	const deliveries: Array<{ from: string | { email: string }; to: string }> = [];
	const logs: OutboundSendLog[] = [];
	const statusesAtSend: string[] = [];
	const mailbox = {
		checkSendRateLimit: async () => sent.length >= 20 ? "Rate limit exceeded" : null,
		getEmail: async () => ({
			id: "original",
			thread_id: "original",
			message_id: "original@example.com",
			sender: to,
			date: new Date().toISOString(),
			body: "Original message",
		}),
		createEmail: async (folder: string) => { sent.push(folder); },
		markThreadRead: async () => {},
	};
	const operations = Object.create(OperationsDO.prototype) as {
		sendRecipient: (recipient: { id: string }) => Promise<void>;
	};
	const env = {
		BUCKET: { head: async () => ({}), get: async () => null },
		MAILBOX: { idFromName: (name: string) => name, get: () => mailbox },
		OPERATIONS: { idFromName: (name: string) => name, get: () => operations },
		EMAIL: {
			send: async (email: (typeof deliveries)[number]) => {
				deliveries.push(email);
				statusesAtSend.push(logs.at(-1)?.status ?? "missing");
				if (providerError) throw providerError;
				return omitProviderMessageId ? undefined : { messageId: "provider-message" };
			},
		},
	} as unknown as Env;
	Object.assign(operations, {
		env,
		verifyApiKey: async () => ({ id: "test-key" }),
		writeOutboundSendLog: async (entry: OutboundSendLog) => {
			if (failLogWrites) throw new Error("Storage unavailable");
			logs.push(entry);
		},
		run: () => {},
		rows: () => [],
		loadRecipientContext: async () => ({
			campaign: { id: "campaign", mailbox_id: mailboxId, status: "sending", subject_template: "Update", html_template: bodyHtml },
			customer: { id: "customer", email: to, status: "active", tags: [] },
			template: null,
		}),
	});

	const tasks: Promise<unknown>[] = [];
	const router = new Hono<MailboxContext>();
	router.use("*", async (c, next) => {
		c.set("mailboxRole", "editor");
		c.set("auth", {
			method: "session", user: null, session: null, apiKeyId: null,
			allowedMailboxIds: [mailboxId], scopes: [],
		});
		await next();
	});
	router.route("/", app);
	function post(path: string, body: unknown) {
		return router.request(path, {
			method: "POST",
			headers: { "content-type": "application/json", authorization: "Bearer test-key" },
			body: JSON.stringify(body),
		}, env, {
			waitUntil: (task) => { tasks.push(task); },
			passThroughOnException: () => {},
			props: {},
		});
	}
	return { env, deliveries, sent, tasks, post, operations, logs, statusesAtSend };
}

const mailboxSendPath = `/api/v1/mailboxes/${mailboxId}/emails`;
for (const [label, path] of [
	["compose", mailboxSendPath],
	["reply", `${mailboxSendPath}/original/reply`],
	["forward", `${mailboxSendPath}/original/forward`],
]) {
	test(`mailbox ${label} sends after 100 previously sent emails`, async () => {
		const { post, tasks, deliveries, sent, logs, statusesAtSend } = setup();
		const response = await post(path, { from: mailboxId, to, subject: "Hello", html: bodyHtml });
		assert.equal(response.status, 202, await response.text());
		await Promise.all(tasks);
		assert.equal(deliveries.length, 1);
		assert.equal(sent.length, 101);
		assert.deepEqual(statusesAtSend, ["pending"]);
		assert.deepEqual(logs.map((log) => [log.source, log.status]), [[label, "pending"], [label, "accepted"]]);
		assert.equal(logs[0].id, logs[1].id);
		assert.equal(logs[1].mailboxId, mailboxId);
	});
}

test("transactional API sends after 100 previously sent emails", async () => {
	const { post, deliveries, sent, logs } = setup();
	const cc = "cc@example.com";
	const bcc = "bcc@example.com";
	const response = await post("/api/v1/transactional/send", { mailboxId, to, cc, bcc, subject: "Private subject", html: bodyHtml });
	assert.equal(response.status, 202);
	const result = await response.json();
	assert.ok(result && typeof result === "object" && "id" in result);
	assert.equal(deliveries.length, 1);
	assert.equal(sent.length, 101);
	assert.deepEqual(logs.map((log) => log.status), ["pending", "accepted"]);
	const log = logs[1];
	assert.equal(log.id, result.id);
	assert.equal(log.source, "transactional");
	assert.deepEqual([log.to, log.cc, log.bcc], [[to], [cc], [bcc]]);
	assert.equal(log.providerMessageId, "provider-message");
	assert.ok(log.completedAt);
	assert.doesNotMatch(JSON.stringify(logs), /Private subject|<p>|test-key/);
});

test("transactional API still reports a rate limit from the provider", async () => {
	const providerError = Object.assign(new Error("Provider rate limit exceeded: private diagnostic"), { code: "E_RATE_LIMIT_EXCEEDED" });
	const { post, deliveries, sent, logs } = setup({ providerError });
	const response = await post("/api/v1/transactional/send", { mailboxId, to, subject: "Hello", html: bodyHtml });
	assert.equal(response.status, 429);
	assert.deepEqual(await response.json(), { error: providerError.message });
	assert.equal(deliveries.length, 1);
	assert.equal(sent.length, 100);
	assert.deepEqual(logs.map((log) => log.status), ["pending", "failed"]);
	assert.equal(logs[1].errorCode, "E_RATE_LIMIT_EXCEEDED");
	assert.doesNotMatch(JSON.stringify(logs), /private diagnostic/);
});

test("a provider response without a message ID records a failure instead of a stuck pending log", async () => {
	const { post, deliveries, sent, logs } = setup({ omitProviderMessageId: true });
	const response = await post("/api/v1/transactional/send", { mailboxId, to, subject: "Hello", html: bodyHtml });
	assert.equal(response.status, 400);
	assert.equal(deliveries.length, 1);
	assert.equal(sent.length, 100);
	assert.deepEqual(logs.map((log) => log.status), ["pending", "failed"]);
	assert.equal(logs[1].errorCode, "E_MISSING_PROVIDER_MESSAGE_ID");
});

test("MCP sends and replies after 100 previously sent emails", async () => {
	const { env, deliveries, sent, logs } = setup();
	const message = { to, subject: "Hello", bodyHtml };
	const send = await toolSendEmail(env, mailboxId, message);
	const reply = await toolSendReply(env, mailboxId, { ...message, originalEmailId: "original" });
	assert.equal("status" in send && send.status, "sent", JSON.stringify(send));
	assert.equal("status" in reply && reply.status, "sent", JSON.stringify(reply));
	assert.equal(deliveries.length, 2);
	assert.equal(sent.length, 102);
	assert.deepEqual(logs.filter((log) => log.status === "accepted").map((log) => log.source), ["mcp_send", "mcp_reply"]);
});

test("campaign sends a due recipient after 100 previously sent emails", async () => {
	const { operations, deliveries, sent, logs } = setup();
	await operations.sendRecipient({ id: "recipient" });
	assert.equal(deliveries.length, 1);
	assert.equal(sent.length, 101);
	assert.deepEqual(logs.map((log) => [log.source, log.status]), [["campaign", "pending"], ["campaign", "accepted"]]);
});

test("a failed log write does not fail an accepted send or resend it", async (t) => {
	const warning = t.mock.method(console, "warn", () => {});
	const { post, deliveries, sent } = setup({ failLogWrites: true });
	const response = await post("/api/v1/transactional/send", { mailboxId, to, subject: "Hello", html: bodyHtml });
	assert.equal(response.status, 202);
	assert.equal(deliveries.length, 1);
	assert.equal(sent.length, 101);
	assert.equal(warning.mock.callCount(), 2);
});

test("outbound send log endpoint requires an admin session and validates filters", async () => {
	const queries: unknown[] = [];
	const operations = {
		countUsers: async () => 2,
		getSessionByToken: async (role: string) => ({
			user: { id: role, status: "active", globalRole: role },
			session: { id: "session" },
		}),
		getAccessibleMailboxIds: async () => null,
		listOutboundSendLogs: async (filters: unknown) => {
			queries.push(filters);
			return { logs: [], totalCount: 0 };
		},
	};
	const env = { OPERATIONS: { idFromName: () => "global", get: () => operations } } as unknown as Env;
	const router = new Hono<AppAuthContext>();
	router.use("*", authMiddleware);
	router.route("/", app);
	const path = "/api/v1/operations/send-logs";
	const request = (query = "", role?: string) => router.request(
		`${path}${query}`, { headers: role ? { cookie: `agentic_inbox_session=${role}` } : {} }, env,
	);

	assert.equal((await request()).status, 401);
	assert.equal((await request("", "member")).status, 403);
	assert.equal((await request("?status=delivered", "admin")).status, 400);
	assert.equal((await request("?limit=101", "admin")).status, 400);
	const response = await request("?mailboxId=Sender%40Example.com&status=accepted&source=compose&page=2&limit=25", "admin");
	assert.equal(response.status, 200);
	assert.equal(response.headers.get("Cache-Control"), "private, no-store");
	assert.deepEqual(await response.json(), { logs: [], totalCount: 0 });
	assert.deepEqual(queries, [{ mailboxId, status: "accepted", source: "compose", page: 2, limit: 25 }]);
});
