import assert from "node:assert/strict";
import test from "node:test";
import {
	buildClearedSessionCookie,
	buildSessionCookie,
	extractSessionToken,
	hasMailboxRole,
	hashPassword,
	isApiRequest,
	isMutationMethod,
	isSameOrigin,
	verifyPassword,
} from "../workers/lib/auth";

test("hashPassword and verifyPassword roundtrip correctly", async () => {
	const password = "correct horse battery staple";
	const hash = await hashPassword(password);
	assert.ok(hash.startsWith("pbkdf2_sha256$"));
	assert.equal(await verifyPassword(password, hash), true);
	assert.equal(await verifyPassword("wrong-password", hash), false);
});

test("session cookie helpers set and clear secure cookies", () => {
	const cookie = buildSessionCookie("session-token", "2030-01-01T00:00:00.000Z");
	assert.match(cookie, /agentic_inbox_session=session-token/);
	assert.match(cookie, /HttpOnly/);
	assert.match(cookie, /SameSite=Lax/);
	assert.match(cookie, /Secure/);

	const cleared = buildClearedSessionCookie();
	assert.match(cleared, /Max-Age=0/);
	assert.match(cleared, /agentic_inbox_session=/);
});

test("extractSessionToken reads cookie values", () => {
	const request = new Request("https://example.com", {
		headers: {
			cookie: "foo=bar; agentic_inbox_session=my-session; baz=qux",
		},
	});
	assert.equal(extractSessionToken(request), "my-session");
});

test("mailbox role comparison follows viewer < editor < owner", () => {
	assert.equal(hasMailboxRole("viewer", "viewer"), true);
	assert.equal(hasMailboxRole("viewer", "editor"), false);
	assert.equal(hasMailboxRole("editor", "viewer"), true);
	assert.equal(hasMailboxRole("editor", "owner"), false);
	assert.equal(hasMailboxRole("owner", "editor"), true);
});

test("request helpers distinguish API and same-origin mutation requests", () => {
	const apiRequest = new Request("https://mail.example.com/api/v1/mailboxes");
	assert.equal(isApiRequest(apiRequest), true);
	assert.equal(isMutationMethod("POST"), true);
	assert.equal(isMutationMethod("GET"), false);

	const sameOriginRequest = new Request("https://mail.example.com/api/v1/mailboxes", {
		headers: { origin: "https://mail.example.com" },
		method: "POST",
	});
	assert.equal(isSameOrigin(sameOriginRequest), true);

	const crossOriginRequest = new Request("https://mail.example.com/api/v1/mailboxes", {
		headers: { origin: "https://evil.example.com" },
		method: "POST",
	});
	assert.equal(isSameOrigin(crossOriginRequest), false);
});
