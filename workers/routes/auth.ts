// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Hono } from "hono";
import { z } from "zod";
import { buildClearedSessionCookie, buildSessionCookie, extractSessionToken } from "../lib/auth";
import { getOperationsStub } from "../lib/operations";
import type { Env } from "../types";

const bootstrapSchema = z.object({
	email: z.string().email(),
	name: z.string().min(1),
	password: z.string().min(12),
});

const loginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(1),
});

type AuthRouteStub = {
	countUsers: () => Promise<number>;
	bootstrapAdmin: (input: { email: string; name: string; password: string }) => Promise<unknown>;
	createSession: (input: {
		email: string;
		password: string;
		userAgent?: string | null;
		ipAddress?: string | null;
	}) => Promise<{ user: unknown; session: { expiresAt: string }; rawToken: string } | null>;
	getSessionByToken: (rawToken: string) => Promise<{ user: unknown; session: unknown } | null>;
	revokeSessionByToken: (rawToken: string) => Promise<unknown>;
};

function authOps(env: Env): AuthRouteStub {
	return getOperationsStub(env) as unknown as AuthRouteStub;
}

function getClientIp(request: Request) {
	return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || null;
}

function isSecureRequest(request: Request) {
	return new URL(request.url).protocol === "https:";
}

export const authRouter = new Hono<{ Bindings: Env }>();

authRouter.get("/bootstrap-status", async (c) => {
	const userCount = await authOps(c.env).countUsers();
	return c.json({ bootstrapRequired: userCount === 0 });
});

authRouter.post("/bootstrap-admin", async (c) => {
	const body = bootstrapSchema.parse(await c.req.json());
	await authOps(c.env).bootstrapAdmin(body);
	const loginResult = await authOps(c.env).createSession({
		email: body.email,
		password: body.password,
		userAgent: c.req.header("user-agent"),
		ipAddress: getClientIp(c.req.raw),
	});
	if (!loginResult) {
		return c.json({ error: "Failed to create bootstrap session" }, 500);
	}
	c.header("Set-Cookie", buildSessionCookie(loginResult.rawToken, loginResult.session.expiresAt, isSecureRequest(c.req.raw)));
	return c.json({ user: loginResult.user }, 201);
});

authRouter.post("/login", async (c) => {
	const body = loginSchema.parse(await c.req.json());
	const result = await authOps(c.env).createSession({
		email: body.email,
		password: body.password,
		userAgent: c.req.header("user-agent"),
		ipAddress: getClientIp(c.req.raw),
	});
	if (!result) {
		return c.json({ error: "Invalid email or password" }, 401);
	}
	c.header("Set-Cookie", buildSessionCookie(result.rawToken, result.session.expiresAt, isSecureRequest(c.req.raw)));
	return c.json({ user: result.user });
});

authRouter.post("/logout", async (c) => {
	const token = extractSessionToken(c.req.raw);
	if (token) {
		await authOps(c.env).revokeSessionByToken(token);
	}
	c.header("Set-Cookie", buildClearedSessionCookie(isSecureRequest(c.req.raw)));
	return c.json({ loggedOut: true });
});

authRouter.get("/session", async (c) => {
	const token = extractSessionToken(c.req.raw);
	if (!token) {
		return c.json({ user: null });
	}
	const session = await authOps(c.env).getSessionByToken(token);
	return c.json({ user: session?.user || null });
});
