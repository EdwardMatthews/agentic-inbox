// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../types";

const customerSchema = z.object({
	email: z.string().email(),
	name: z.string().optional(),
	firstName: z.string().optional(),
	lastName: z.string().optional(),
	status: z.enum(["active", "paused", "unsubscribed"]).optional(),
	tags: z.array(z.string()).optional(),
	metadata: z.record(z.any()).optional(),
});

const templateSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	subjectTemplate: z.string().min(1),
	htmlTemplate: z.string().min(1),
	textTemplate: z.string().optional(),
	previewData: z.record(z.any()).optional(),
});

const audienceSchema = z.object({
	mode: z.enum(["all", "customerIds", "tag"]),
	customerIds: z.array(z.string()).optional(),
	tag: z.string().optional(),
});

const campaignSchema = z.object({
	name: z.string().min(1),
	mailboxId: z.string().email(),
	templateId: z.string().optional().nullable(),
	subjectTemplate: z.string().optional().nullable(),
	htmlTemplate: z.string().optional().nullable(),
	textTemplate: z.string().optional().nullable(),
	audience: audienceSchema.optional(),
	scheduledAt: z.string().optional().nullable(),
	throttlePerMinute: z.number().int().min(1).max(120).optional(),
	trackOpens: z.boolean().optional(),
	trackClicks: z.boolean().optional(),
});

const webhookSchema = z.object({
	name: z.string().min(1),
	url: z.string().url(),
	secret: z.string().optional().nullable(),
	eventTypes: z.array(z.string()).optional(),
	enabled: z.boolean().optional(),
});

const providerReceiptSchema = z.object({
	campaignId: z.string().optional().nullable(),
	recipientId: z.string().optional().nullable(),
	customerId: z.string().optional().nullable(),
	mailboxId: z.string().optional().nullable(),
	email: z.string().email().optional().nullable(),
	eventType: z.string().min(1),
	payload: z.record(z.any()).optional(),
});

const templatePreviewSchema = z.object({
	templateId: z.string().optional(),
	mailboxId: z.string().email(),
	customerId: z.string().optional(),
	subjectTemplate: z.string().optional(),
	htmlTemplate: z.string().optional(),
	textTemplate: z.string().optional(),
	previewData: z.record(z.any()).optional(),
	trackOpens: z.boolean().optional(),
	trackClicks: z.boolean().optional(),
});

function operationsStub(env: Env) {
	return env.OPERATIONS.get(env.OPERATIONS.idFromName("global"));
}

type OperationsRouterStub = {
	listCustomers: (options: {
		query?: string;
		status?: string;
		tag?: string;
		page?: number;
		limit?: number;
	}) => Promise<{ customers: unknown[]; totalCount: number }>;
	createCustomer: (body: unknown) => Promise<unknown>;
	getCustomer: (customerId: string) => Promise<unknown | null>;
	updateCustomer: (customerId: string, body: unknown) => Promise<unknown | null>;
	deleteCustomer: (customerId: string) => Promise<unknown>;
	listTemplates: () => Promise<unknown[]>;
	createTemplate: (body: unknown) => Promise<unknown>;
	getTemplate: (templateId: string) => Promise<unknown | null>;
	updateTemplate: (templateId: string, body: unknown) => Promise<unknown | null>;
	deleteTemplate: (templateId: string) => Promise<unknown>;
	renderTemplatePreview: (body: unknown) => Promise<unknown>;
	listCampaigns: () => Promise<unknown[]>;
	createCampaign: (body: unknown) => Promise<unknown>;
	getCampaign: (campaignId: string) => Promise<unknown | null>;
	updateCampaign: (campaignId: string, body: unknown) => Promise<unknown | null>;
	startCampaign: (campaignId: string, scheduledAt?: string | null) => Promise<unknown>;
	pauseCampaign: (campaignId: string) => Promise<unknown>;
	resumeCampaign: (campaignId: string) => Promise<unknown>;
	cancelCampaign: (campaignId: string) => Promise<unknown>;
	listCampaignRecipients: (campaignId: string, options: { page?: number; limit?: number }) => Promise<unknown>;
	listEvents: (options: { campaignId?: string; customerId?: string; eventType?: string; page?: number; limit?: number }) => Promise<unknown>;
	listWebhooks: () => Promise<unknown>;
	createWebhook: (body: unknown) => Promise<unknown>;
	updateWebhook: (webhookId: string, body: unknown) => Promise<unknown | null>;
	deleteWebhook: (webhookId: string) => Promise<unknown>;
	ingestProviderReceipt: (body: unknown) => Promise<unknown>;
};

function ops(env: Env): OperationsRouterStub {
	return operationsStub(env) as unknown as OperationsRouterStub;
}

function intQuery(value: string | undefined, fallback: number) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}

export const operationsRouter = new Hono<{ Bindings: Env }>();

operationsRouter.get("/customers", async (c) => {
	const result = await ops(c.env).listCustomers({
		query: c.req.query("query"),
		status: c.req.query("status"),
		tag: c.req.query("tag"),
		page: intQuery(c.req.query("page"), 1),
		limit: intQuery(c.req.query("limit"), 25),
	});
	return new Response(JSON.stringify(result), {
		headers: { "Content-Type": "application/json" },
	});
});

operationsRouter.post("/customers", async (c) => {
	const body = customerSchema.parse(await c.req.json());
	return c.json(await ops(c.env).createCustomer(body), 201);
});

operationsRouter.get("/customers/:customerId", async (c) => {
	const customer = await ops(c.env).getCustomer(c.req.param("customerId"));
	if (!customer) return c.json({ error: "Customer not found" }, 404);
	return c.json(customer);
});

operationsRouter.put("/customers/:customerId", async (c) => {
	const customer = await ops(c.env).updateCustomer(
		c.req.param("customerId"),
		customerSchema.partial().parse(await c.req.json()),
	);
	if (!customer) return c.json({ error: "Customer not found" }, 404);
	return c.json(customer);
});

operationsRouter.delete("/customers/:customerId", async (c) => {
	await ops(c.env).deleteCustomer(c.req.param("customerId"));
	return c.body(null, 204);
});

operationsRouter.get("/templates", async (c) => {
	return c.json(await ops(c.env).listTemplates());
});

operationsRouter.post("/templates", async (c) => {
	return c.json(await ops(c.env).createTemplate(templateSchema.parse(await c.req.json())), 201);
});

operationsRouter.get("/templates/:templateId", async (c) => {
	const template = await ops(c.env).getTemplate(c.req.param("templateId"));
	if (!template) return c.json({ error: "Template not found" }, 404);
	return c.json(template);
});

operationsRouter.put("/templates/:templateId", async (c) => {
	const template = await ops(c.env).updateTemplate(
		c.req.param("templateId"),
		templateSchema.partial().parse(await c.req.json()),
	);
	if (!template) return c.json({ error: "Template not found" }, 404);
	return c.json(template);
});

operationsRouter.delete("/templates/:templateId", async (c) => {
	await ops(c.env).deleteTemplate(c.req.param("templateId"));
	return c.body(null, 204);
});

operationsRouter.post("/templates/preview", async (c) => {
	const body = templatePreviewSchema.parse(await c.req.json());

	return c.json(await ops(c.env).renderTemplatePreview(body));
});

operationsRouter.get("/campaigns", async (c) => {
	return c.json(await ops(c.env).listCampaigns());
});

operationsRouter.post("/campaigns", async (c) => {
	return c.json(await ops(c.env).createCampaign(campaignSchema.parse(await c.req.json())), 201);
});

operationsRouter.get("/campaigns/:campaignId", async (c) => {
	const campaign = await ops(c.env).getCampaign(c.req.param("campaignId"));
	if (!campaign) return c.json({ error: "Campaign not found" }, 404);
	return c.json(campaign);
});

operationsRouter.put("/campaigns/:campaignId", async (c) => {
	const campaign = await ops(c.env).updateCampaign(
		c.req.param("campaignId"),
		campaignSchema.partial().parse(await c.req.json()),
	);
	if (!campaign) return c.json({ error: "Campaign not found" }, 404);
	return c.json(campaign);
});

operationsRouter.post("/campaigns/:campaignId/start", async (c) => {
	const body = z.object({ scheduledAt: z.string().optional().nullable() }).parse(await c.req.json().catch(() => ({})));
	return c.json(await ops(c.env).startCampaign(c.req.param("campaignId"), body.scheduledAt));
});

operationsRouter.post("/campaigns/:campaignId/pause", async (c) => {
	return c.json(await ops(c.env).pauseCampaign(c.req.param("campaignId")));
});

operationsRouter.post("/campaigns/:campaignId/resume", async (c) => {
	return c.json(await ops(c.env).resumeCampaign(c.req.param("campaignId")));
});

operationsRouter.post("/campaigns/:campaignId/cancel", async (c) => {
	return c.json(await ops(c.env).cancelCampaign(c.req.param("campaignId")));
});

operationsRouter.get("/campaigns/:campaignId/recipients", async (c) => {
	return c.json(await ops(c.env).listCampaignRecipients(
		c.req.param("campaignId"),
		{
			page: intQuery(c.req.query("page"), 1),
			limit: intQuery(c.req.query("limit"), 50),
		},
	));
});

operationsRouter.get("/events", async (c) => {
	return c.json(await ops(c.env).listEvents({
		campaignId: c.req.query("campaignId"),
		customerId: c.req.query("customerId"),
		eventType: c.req.query("eventType"),
		page: intQuery(c.req.query("page"), 1),
		limit: intQuery(c.req.query("limit"), 50),
	}));
});

operationsRouter.get("/webhooks", async (c) => {
	return c.json(await ops(c.env).listWebhooks());
});

operationsRouter.post("/webhooks", async (c) => {
	return c.json(await ops(c.env).createWebhook(webhookSchema.parse(await c.req.json())), 201);
});

operationsRouter.put("/webhooks/:webhookId", async (c) => {
	const hooks = await ops(c.env).updateWebhook(
		c.req.param("webhookId"),
		webhookSchema.partial().parse(await c.req.json()),
	);
	if (!hooks) return c.json({ error: "Webhook not found" }, 404);
	return c.json(hooks);
});

operationsRouter.delete("/webhooks/:webhookId", async (c) => {
	await ops(c.env).deleteWebhook(c.req.param("webhookId"));
	return c.body(null, 204);
});

operationsRouter.post("/provider-receipts", async (c) => {
	const secret = c.env.OPERATIONS_WEBHOOK_SECRET;
	if (secret && c.req.header("x-operations-secret") !== secret) {
		return c.json({ error: "Unauthorized" }, 401);
	}

	return c.json(await ops(c.env).ingestProviderReceipt(providerReceiptSchema.parse(await c.req.json())));
});
