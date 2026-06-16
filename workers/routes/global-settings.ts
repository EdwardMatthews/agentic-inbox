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

type SettingsStub = {
	listApiKeys: () => Promise<unknown>;
	createApiKey: (input: { name: string; scopes?: string[]; allowedMailboxes?: string[] }) => Promise<unknown>;
	revokeApiKey: (apiKeyId: string) => Promise<unknown>;
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

