// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";
import { getOperationsStub } from "../lib/operations";

const apiKeySchema = z.object({
	name: z.string().min(1),
	scopes: z.array(z.string()).min(1).optional(),
	allowedMailboxes: z.array(z.string().email()).optional(),
});

const userSchema = z.object({
	email: z.string().email(),
	name: z.string().min(1),
	password: z.string().min(12),
	globalRole: z.enum(["admin", "member"]).optional(),
	status: z.enum(["active", "disabled"]).optional(),
});

const userUpdateSchema = z.object({
	name: z.string().min(1).optional(),
	password: z.string().min(12).optional(),
	globalRole: z.enum(["admin", "member"]).optional(),
	status: z.enum(["active", "disabled"]).optional(),
});

const membershipSchema = z.object({
	userId: z.string().min(1),
	mailboxId: z.string().email(),
	role: z.enum(["viewer", "editor", "owner"]),
});

type SettingsStub = {
	listApiKeys: () => Promise<unknown>;
	createApiKey: (input: { name: string; scopes?: string[]; allowedMailboxes?: string[] }) => Promise<unknown>;
	revokeApiKey: (apiKeyId: string) => Promise<unknown>;
	listUsers: () => Promise<unknown>;
	createUser: (input: { email: string; name: string; password: string; globalRole?: "admin" | "member"; status?: "active" | "disabled" }) => Promise<unknown>;
	updateUser: (userId: string, input: { name?: string; password?: string; globalRole?: "admin" | "member"; status?: "active" | "disabled" }) => Promise<unknown>;
	setMailboxMembership: (input: { userId: string; mailboxId: string; role: "viewer" | "editor" | "owner" }) => Promise<unknown>;
	removeMailboxMembership: (userId: string, mailboxId: string) => Promise<unknown>;
};

function settingsOps(env: Env): SettingsStub {
	return getOperationsStub(env) as unknown as SettingsStub;
}

export const globalSettingsRouter = new Hono<{ Bindings: Env }>();

globalSettingsRouter.get("/api-keys", async (c) => {
	return c.json(await settingsOps(c.env).listApiKeys());
});

globalSettingsRouter.post("/api-keys", async (c) => {
	const body = apiKeySchema.parse(await c.req.json());
	return c.json(await settingsOps(c.env).createApiKey(body), 201);
});

globalSettingsRouter.delete("/api-keys/:apiKeyId", async (c) => {
	await settingsOps(c.env).revokeApiKey(c.req.param("apiKeyId"));
	return c.body(null, 204);
});

globalSettingsRouter.get("/users", async (c) => {
	return c.json(await settingsOps(c.env).listUsers());
});

globalSettingsRouter.post("/users", async (c) => {
	const body = userSchema.parse(await c.req.json());
	return c.json(await settingsOps(c.env).createUser(body), 201);
});

globalSettingsRouter.put("/users/:userId", async (c) => {
	const user = await settingsOps(c.env).updateUser(
		c.req.param("userId"),
		userUpdateSchema.parse(await c.req.json()),
	);
	if (!user) return c.json({ error: "User not found" }, 404);
	return c.json(user);
});

globalSettingsRouter.put("/users/:userId/memberships", async (c) => {
	const body = membershipSchema.parse(await c.req.json());
	if (body.userId !== c.req.param("userId")) {
		return c.json({ error: "User mismatch" }, 400);
	}
	return c.json(await settingsOps(c.env).setMailboxMembership(body));
});

globalSettingsRouter.delete("/users/:userId/memberships/:mailboxId", async (c) => {
	await settingsOps(c.env).removeMailboxMembership(c.req.param("userId"), decodeURIComponent(c.req.param("mailboxId")));
	return c.body(null, 204);
});
