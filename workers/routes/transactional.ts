// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";
import { getOperationsStub } from "../lib/operations";

const recipientFieldSchema = z.union([
	z.string().email(),
	z.array(z.string().email()).min(1),
]);

const transactionalSendSchema = z.object({
	mailboxId: z.string().email(),
	to: recipientFieldSchema,
	cc: recipientFieldSchema.optional(),
	bcc: recipientFieldSchema.optional(),
	replyTo: z.union([
		z.string().email(),
		z.object({ email: z.string().email(), name: z.string().optional() }),
	]).optional(),
	fromName: z.string().optional(),
	subject: z.string().optional(),
	html: z.string().optional(),
	text: z.string().optional(),
	templateId: z.string().optional(),
	variables: z.record(z.any()).optional(),
	trackOpens: z.boolean().optional(),
	trackClicks: z.boolean().optional(),
	attachments: z.array(
		z.object({
			content: z.string(),
			filename: z.string(),
			type: z.string(),
			disposition: z.enum(["attachment", "inline"]),
			contentId: z.string().optional(),
		}),
	).optional(),
}).refine((data) => data.templateId || data.subject, {
	message: "Either templateId or subject must be provided",
}).refine((data) => data.templateId || data.html || data.text, {
	message: "Either templateId or html/text content must be provided",
});

type TransactionalStub = {
	sendTransactionalEmail: (rawApiKey: string, payload: unknown) => Promise<unknown>;
};

function transactionalOps(env: Env): TransactionalStub {
	return getOperationsStub(env) as unknown as TransactionalStub;
}

function extractApiKey(request: Request) {
	const direct = request.headers.get("x-agentic-inbox-api-key");
	if (direct?.trim()) return direct.trim();
	const auth = request.headers.get("authorization");
	if (auth?.toLowerCase().startsWith("bearer ")) {
		return auth.slice(7).trim();
	}
	return null;
}

export const transactionalRouter = new Hono<{ Bindings: Env }>();

transactionalRouter.post("/send", async (c) => {
	const apiKey = extractApiKey(c.req.raw);
	if (!apiKey) {
		return c.json({ error: "Missing API key" }, 401);
	}

	const payload = transactionalSendSchema.parse(await c.req.json());
	try {
		return c.json(await transactionalOps(c.env).sendTransactionalEmail(apiKey, payload), 202);
	} catch (e) {
		const message = (e as Error).message;
		const status = /api key|unauthorized/i.test(message) ? 401 : /rate limit/i.test(message) ? 429 : 400;
		return c.json({ error: message }, status);
	}
});

