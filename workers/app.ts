// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { routeAgentRequest } from "agents";
import { Hono } from "hono";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { createRequestHandler } from "react-router";
import { app as apiApp, receiveEmail } from "./index";
import { EmailMCP } from "./mcp";
import { OperationsDO } from "./operations";
import { getOperationsStub } from "./lib/operations";
import type { Env } from "./types";

export { MailboxDO } from "./durableObject";
export { EmailAgent } from "./agent";
export { EmailMCP } from "./mcp";
export { OperationsDO } from "./operations";

declare module "react-router" {
	export interface AppLoadContext {
		cloudflare: {
			env: Env;
			ctx: ExecutionContext;
		};
	}
}

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	import.meta.env.MODE,
);

const PUBLIC_OPERATION_PATH_PREFIXES = [
	"/ops/open/",
	"/ops/click/",
	"/ops/unsubscribe/",
	"/api/v1/operations/provider-receipts",
	"/api/v1/transactional/send",
];

type PublicOperationsStub = {
	trackOpen: (recipientId: string) => Promise<unknown>;
	getPixelResponse: () => Promise<Uint8Array>;
	trackClick: (recipientId: string, targetUrl: string) => Promise<unknown>;
	unsubscribeByToken: (token: string, customerId?: string) => Promise<{ unsubscribed?: boolean; customer?: { email: string } | null }>;
};

function publicOperationsStub(env: Env): PublicOperationsStub {
	return getOperationsStub(env) as unknown as PublicOperationsStub;
}

function getAccessUrls(teamDomain: string) {
	const certsPath = "/cdn-cgi/access/certs";
	const teamUrl = new URL(teamDomain);
	const issuer = teamUrl.origin;
	const certsUrl = teamUrl.pathname.endsWith(certsPath)
		? teamUrl
		: new URL(certsPath, issuer);

	return { issuer, certsUrl };
}

// Main app that wraps the API and adds React Router fallback
const app = new Hono<{ Bindings: Env }>();

// Cloudflare Access JWT validation middleware (production only)
app.use("*", async (c, next) => {
	if (PUBLIC_OPERATION_PATH_PREFIXES.some((prefix) => c.req.path.startsWith(prefix))) {
		return next();
	}

	// Skip validation in development
	if (import.meta.env.DEV) {
		return next();
	}

	const { POLICY_AUD, TEAM_DOMAIN } = c.env;

	// Fail closed in production if Access is not configured.
	if (!POLICY_AUD || !TEAM_DOMAIN) {
		return c.text(
			"Cloudflare Access must be configured in production. Set POLICY_AUD and TEAM_DOMAIN.",
			500,
		);
	}

	const token = c.req.header("cf-access-jwt-assertion");
	if (!token) {
		return c.text("Missing required CF Access JWT", 403);
	}

	try {
		const { issuer, certsUrl } = getAccessUrls(TEAM_DOMAIN);
		const JWKS = createRemoteJWKSet(certsUrl);
		await jwtVerify(token, JWKS, {
			issuer,
			audience: POLICY_AUD,
		});
	} catch {
		return c.text("Invalid or expired Access token", 403);
	}

	// Authorization model note: once a teammate passes the shared Cloudflare
	// Access policy, they can access all mailboxes in this app by design.
	return next();
});

app.get("/ops/open/:recipientId.gif", async (c) => {
	const stub = publicOperationsStub(c.env);
	const recipientId = c.req.param("recipientId");
	if (!recipientId) return c.text("Missing recipient id", 400);
	await stub.trackOpen(recipientId);
	const gifBytes = await stub.getPixelResponse();
	const gifCopy = Uint8Array.from(gifBytes);
	return new Response(new Blob([gifCopy], { type: "image/gif" }), {
		headers: {
			"Content-Type": "image/gif",
			"Cache-Control": "no-store, no-cache, must-revalidate, private",
		},
	});
});

app.get("/ops/click/:recipientId", async (c) => {
	const targetUrl = c.req.query("url");
	if (!targetUrl) {
		return c.text("Missing target URL", 400);
	}
	const stub = publicOperationsStub(c.env);
	await stub.trackClick(c.req.param("recipientId"), targetUrl);
	return c.redirect(targetUrl, 302);
});

app.get("/ops/unsubscribe/:token", async (c) => {
	const stub = publicOperationsStub(c.env);
	const token = c.req.param("token");
	if (!token) return c.text("Missing unsubscribe token", 400);
	const result = await stub.unsubscribeByToken(token, c.req.query("customerId"));
	const unsubscribedCustomer = result.customer;
	if (!result.unsubscribed || !unsubscribedCustomer) {
		return c.html(`<!doctype html><html><body style="font-family: sans-serif; padding: 2rem;"><h1>Unsubscribe link invalid</h1><p>This link is invalid or has already expired.</p></body></html>`, 404);
	}
	return c.html(`<!doctype html><html><body style="font-family: sans-serif; padding: 2rem;"><h1>You're unsubscribed</h1><p>${unsubscribedCustomer.email} will no longer receive operational campaigns from this inbox.</p></body></html>`);
});

// MCP server endpoint — used by AI coding tools (ProtoAgent, Claude Code, Cursor, etc.)
// Must be before API routes and React Router catch-all
const mcpHandler = EmailMCP.serve("/mcp", { binding: "EMAIL_MCP" });
app.all("/mcp", async (c) => {
	return mcpHandler.fetch(c.req.raw, c.env, c.executionCtx as ExecutionContext);
});
app.all("/mcp/*", async (c) => {
	return mcpHandler.fetch(c.req.raw, c.env, c.executionCtx as ExecutionContext);
});

// Mount the API routes
app.route("/", apiApp);

// Agent WebSocket routing - must be before React Router catch-all
app.all("/agents/*", async (c) => {
	const response = await routeAgentRequest(c.req.raw, c.env);
	if (response) return response;
	return c.text("Agent not found", 404);
});

// React Router catch-all: serves the SPA for all non-API routes
app.all("*", (c) => {
	return requestHandler(c.req.raw, {
		cloudflare: { env: c.env, ctx: c.executionCtx as ExecutionContext },
	});
});

// Export the Hono app as the default export with an email handler
export default {
	fetch: app.fetch,
	async email(
		event: { raw: ReadableStream; rawSize: number },
		env: Env,
		ctx: ExecutionContext,
	) {
		try {
			await receiveEmail(event, env, ctx);
		} catch (e) {
			console.error("Failed to process incoming email:", (e as Error).message, (e as Error).stack);
			// Re-throw so Cloudflare's email routing can retry delivery or bounce the message.
			// Swallowing the error would silently drop the email.
			throw e;
		}
	},
};
