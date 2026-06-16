// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { MiddlewareHandler } from "hono";
import {
	extractSessionToken,
	isApiRequest,
	isMutationMethod,
	isSameOrigin,
	type AuthContext,
	type AuthSession,
	type AuthUser,
	type GlobalRole,
	type MailboxRole,
	wantsHtml,
} from "./auth";
import { getOperationsStub } from "./operations";
import type { Env } from "../types";

type AuthStub = {
	countUsers: () => Promise<number>;
	getSessionByToken: (rawToken: string) => Promise<{ user: AuthUser; session: AuthSession } | null>;
	getMailboxRole: (userId: string, globalRole: GlobalRole, mailboxId: string) => Promise<MailboxRole | null>;
	getAccessibleMailboxIds: (userId: string, globalRole: GlobalRole) => Promise<string[] | null>;
};

function authStub(env: Env): AuthStub {
	return getOperationsStub(env) as unknown as AuthStub;
}

function unauthorizedResponse(request: Request, bootstrapRequired: boolean) {
	if (isApiRequest(request)) {
		return new Response(
			JSON.stringify({
				error: bootstrapRequired ? "Bootstrap required" : "Authentication required",
			}),
			{
				status: bootstrapRequired ? 428 : 401,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	if (wantsHtml(request)) {
		const target = bootstrapRequired ? "/setup-admin" : "/login";
		return Response.redirect(new URL(target, request.url).toString(), 302);
	}

	return new Response("Authentication required", { status: 401 });
}

function forbiddenResponse(request: Request) {
	if (isApiRequest(request)) {
		return new Response(JSON.stringify({ error: "Forbidden" }), {
			status: 403,
			headers: { "Content-Type": "application/json" },
		});
	}
	if (wantsHtml(request)) {
		return Response.redirect(new URL("/", request.url).toString(), 302);
	}
	return new Response("Forbidden", { status: 403 });
}

function isPublicPath(path: string) {
	return path === "/login" ||
		path === "/setup-admin" ||
		path.startsWith("/api/v1/auth/") ||
		path.startsWith("/ops/open/") ||
		path.startsWith("/ops/click/") ||
		path.startsWith("/ops/unsubscribe/") ||
		path === "/api/v1/transactional/send" ||
		path === "/api/v1/operations/provider-receipts";
}

function isAdminOnlyPath(path: string) {
	return path === "/settings" ||
		path.startsWith("/operations") ||
		path.startsWith("/api/v1/settings/") ||
		path.startsWith("/api/v1/operations");
}

function extractMailboxIdFromPath(path: string) {
	const apiMatch = path.match(/^\/api\/v1\/mailboxes\/([^/]+)/);
	if (apiMatch?.[1]) return decodeURIComponent(apiMatch[1]);
	const htmlMatch = path.match(/^\/mailbox\/([^/]+)/);
	if (htmlMatch?.[1]) return decodeURIComponent(htmlMatch[1]);
	return null;
}

export type AppAuthContext = {
	Bindings: Env;
	Variables: {
		auth: AuthContext;
		mailboxRole?: MailboxRole | null;
	};
};

export const authMiddleware: MiddlewareHandler<AppAuthContext> = async (c, next) => {
	const path = c.req.path;
	const stub = authStub(c.env);
	const bootstrapRequired = (await stub.countUsers()) === 0;
	const sessionToken = extractSessionToken(c.req.raw);
	const sessionResult = sessionToken ? await stub.getSessionByToken(sessionToken) : null;

	const auth: AuthContext = {
		method: "session",
		user: sessionResult?.user || null,
		session: sessionResult?.session || null,
		apiKeyId: null,
		allowedMailboxIds: sessionResult?.user
			? await stub.getAccessibleMailboxIds(sessionResult.user.id, sessionResult.user.globalRole)
			: null,
		scopes: [],
	};
	c.set("auth", auth);

	if (isPublicPath(path)) {
		return next();
	}

	if (!auth.user) {
		return unauthorizedResponse(c.req.raw, bootstrapRequired);
	}

	if (auth.user.status !== "active") {
		return forbiddenResponse(c.req.raw);
	}

	if (auth.method === "session" && isApiRequest(c.req.raw) && isMutationMethod(c.req.method) && !isSameOrigin(c.req.raw)) {
		return new Response(JSON.stringify({ error: "Cross-origin mutations are not allowed" }), {
			status: 403,
			headers: { "Content-Type": "application/json" },
		});
	}

	if (isAdminOnlyPath(path) && auth.user.globalRole !== "admin") {
		return forbiddenResponse(c.req.raw);
	}

	const mailboxId = extractMailboxIdFromPath(path);
	if (mailboxId) {
		const role = await stub.getMailboxRole(auth.user.id, auth.user.globalRole, mailboxId);
		if (!role) {
			return forbiddenResponse(c.req.raw);
		}
		c.set("mailboxRole", role);
	}

	return next();
};

export function requireGlobalAdmin(c: { var: { auth: AuthContext } }) {
	return c.var.auth.user?.globalRole === "admin";
}
