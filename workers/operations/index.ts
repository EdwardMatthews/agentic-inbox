// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { DurableObject } from "cloudflare:workers";
import { sendEmail } from "../email-sender";
import { generateMessageId } from "../lib/email-helpers";
import { Folders } from "../../shared/folders";
import type { Env } from "../types";
import { applyMigrations, type Migration } from "../durableObject/migrations";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface OperationsCustomer {
	id: string;
	email: string;
	name: string;
	first_name: string | null;
	last_name: string | null;
	status: "active" | "paused" | "unsubscribed";
	tags: string[];
	metadata: Record<string, JsonValue>;
	unsubscribe_token: string;
	created_at: string;
	updated_at: string;
	last_activity_at: string | null;
}

export interface OperationsTemplate {
	id: string;
	name: string;
	description: string | null;
	subject_template: string;
	html_template: string;
	text_template: string;
	preview_data: Record<string, JsonValue>;
	created_at: string;
	updated_at: string;
}

export interface CampaignAudience {
	mode: "all" | "customerIds" | "tag";
	customerIds?: string[];
	tag?: string;
}

export interface OperationsCampaign {
	id: string;
	name: string;
	mailbox_id: string;
	template_id: string | null;
	status: "draft" | "scheduled" | "sending" | "paused" | "completed" | "cancelled" | "failed";
	subject_template: string | null;
	html_template: string | null;
	text_template: string | null;
	audience: CampaignAudience;
	scheduled_at: string | null;
	throttle_per_minute: number;
	track_opens: boolean;
	track_clicks: boolean;
	total_recipients: number;
	processed_recipients: number;
	sent_recipients: number;
	failed_recipients: number;
	open_events: number;
	click_events: number;
	last_error: string | null;
	created_at: string;
	updated_at: string;
}

export interface OperationsRecipient {
	id: string;
	campaign_id: string;
	customer_id: string;
	email: string;
	name: string;
	status: "scheduled" | "pending" | "sending" | "sent" | "failed" | "opened" | "clicked" | "unsubscribed" | "skipped";
	scheduled_at: string | null;
	sent_at: string | null;
	opened_at: string | null;
	clicked_at: string | null;
	provider_message_id: string | null;
	internal_message_id: string | null;
	error_message: string | null;
}

export interface OperationsEvent {
	id: string;
	campaign_id: string | null;
	recipient_id: string | null;
	customer_id: string | null;
	mailbox_id: string | null;
	event_type: string;
	email: string | null;
	payload: Record<string, JsonValue>;
	created_at: string;
}

export interface OperationsWebhook {
	id: string;
	name: string;
	url: string;
	secret: string | null;
	event_types: string[];
	enabled: boolean;
	created_at: string;
	updated_at: string;
}

const ONE_PIXEL_GIF = Uint8Array.from(
	atob("R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="),
	(c) => c.charCodeAt(0),
);

const operationsMigrations: Migration[] = [
	{
		name: "1_operations_initial_setup",
		sql: `
			CREATE TABLE customers (
				id TEXT PRIMARY KEY,
				email TEXT NOT NULL UNIQUE,
				name TEXT NOT NULL,
				first_name TEXT,
				last_name TEXT,
				status TEXT NOT NULL DEFAULT 'active',
				tags TEXT NOT NULL DEFAULT '[]',
				metadata TEXT NOT NULL DEFAULT '{}',
				unsubscribe_token TEXT NOT NULL UNIQUE,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				last_activity_at TEXT
			);

			CREATE TABLE templates (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL UNIQUE,
				description TEXT,
				subject_template TEXT NOT NULL,
				html_template TEXT NOT NULL,
				text_template TEXT NOT NULL DEFAULT '',
				preview_data TEXT NOT NULL DEFAULT '{}',
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);

			CREATE TABLE campaigns (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				mailbox_id TEXT NOT NULL,
				template_id TEXT,
				status TEXT NOT NULL DEFAULT 'draft',
				subject_template TEXT,
				html_template TEXT,
				text_template TEXT,
				audience_json TEXT NOT NULL DEFAULT '{"mode":"all"}',
				scheduled_at TEXT,
				throttle_per_minute INTEGER NOT NULL DEFAULT 10,
				track_opens INTEGER NOT NULL DEFAULT 1,
				track_clicks INTEGER NOT NULL DEFAULT 1,
				total_recipients INTEGER NOT NULL DEFAULT 0,
				processed_recipients INTEGER NOT NULL DEFAULT 0,
				sent_recipients INTEGER NOT NULL DEFAULT 0,
				failed_recipients INTEGER NOT NULL DEFAULT 0,
				open_events INTEGER NOT NULL DEFAULT 0,
				click_events INTEGER NOT NULL DEFAULT 0,
				last_error TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);

			CREATE TABLE campaign_recipients (
				id TEXT PRIMARY KEY,
				campaign_id TEXT NOT NULL,
				customer_id TEXT NOT NULL,
				email TEXT NOT NULL,
				name TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'scheduled',
				scheduled_at TEXT,
				sent_at TEXT,
				opened_at TEXT,
				clicked_at TEXT,
				provider_message_id TEXT,
				internal_message_id TEXT,
				error_message TEXT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				UNIQUE(campaign_id, customer_id)
			);

			CREATE TABLE events (
				id TEXT PRIMARY KEY,
				campaign_id TEXT,
				recipient_id TEXT,
				customer_id TEXT,
				mailbox_id TEXT,
				event_type TEXT NOT NULL,
				email TEXT,
				payload_json TEXT NOT NULL DEFAULT '{}',
				created_at TEXT NOT NULL
			);

			CREATE TABLE webhook_subscriptions (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				url TEXT NOT NULL,
				secret TEXT,
				event_types TEXT NOT NULL DEFAULT '[]',
				enabled INTEGER NOT NULL DEFAULT 1,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);

			CREATE INDEX idx_customers_status ON customers(status);
			CREATE INDEX idx_campaigns_status ON campaigns(status);
			CREATE INDEX idx_campaigns_scheduled_at ON campaigns(scheduled_at);
			CREATE INDEX idx_recipients_campaign ON campaign_recipients(campaign_id);
			CREATE INDEX idx_recipients_status_schedule ON campaign_recipients(status, scheduled_at);
			CREATE INDEX idx_events_campaign ON events(campaign_id);
			CREATE INDEX idx_events_created ON events(created_at DESC);
		`,
	},
];

function nowIso() {
	return new Date().toISOString();
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
	if (!value) return fallback;
	try {
		return JSON.parse(value) as T;
	} catch {
		return fallback;
	}
}

function normalizeTags(tags?: string[] | null): string[] {
	return [...new Set((tags || []).map((tag) => tag.trim()).filter(Boolean))];
}

function cleanBaseUrl(url: string | undefined): string | null {
	if (!url?.trim()) return null;
	return url.replace(/\/+$/, "");
}

function renderPathValue(path: string, source: Record<string, unknown>): string {
	const value = path.split(".").reduce<unknown>((acc, key) => {
		if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
			return (acc as Record<string, unknown>)[key];
		}
		return "";
	}, source);

	if (value === null || value === undefined) return "";
	return String(value);
}

function renderTemplateString(template: string | null | undefined, source: Record<string, unknown>): string {
	if (!template) return "";
	return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, path) =>
		renderPathValue(path, source),
	);
}

function rewriteTrackedLinks(html: string, baseUrl: string, recipientId: string): string {
	return html.replace(/<a\b([^>]*?)href=(["'])(.*?)\2([^>]*)>/gi, (_match, before, quote, href, after) => {
		if (!href || href.startsWith("#") || href.startsWith("mailto:")) {
			return `<a${before}href=${quote}${href}${quote}${after}>`;
		}
		const trackedUrl = `${baseUrl}/ops/click/${recipientId}?url=${encodeURIComponent(href)}`;
		return `<a${before}href=${quote}${trackedUrl}${quote}${after}>`;
	});
}

function appendTrackingPixel(html: string, baseUrl: string, recipientId: string): string {
	const pixel = `<img src="${baseUrl}/ops/open/${recipientId}.gif" alt="" width="1" height="1" style="display:none" />`;
	if (html.includes("</body>")) {
		return html.replace(/<\/body>/i, `${pixel}</body>`);
	}
	return `${html}${pixel}`;
}

type RecipientRow = {
	id: string;
	campaign_id: string;
	customer_id: string;
	email: string;
	name: string;
	status: OperationsRecipient["status"];
	scheduled_at: string | null;
	sent_at: string | null;
	opened_at: string | null;
	clicked_at: string | null;
	provider_message_id: string | null;
	internal_message_id: string | null;
	error_message: string | null;
};

export class OperationsDO extends DurableObject<Env> {
	declare __DURABLE_OBJECT_BRAND: never;

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		applyMigrations(this.ctx.storage.sql, operationsMigrations, this.ctx.storage);
	}

	private rows<T = Record<string, unknown>>(query: string, ...params: (string | number | null)[]) {
		return [...this.ctx.storage.sql.exec(query, ...params)] as T[];
	}

	private row<T = Record<string, unknown>>(query: string, ...params: (string | number | null)[]) {
		return this.rows<T>(query, ...params)[0] ?? null;
	}

	private run(query: string, ...params: (string | number | null)[]) {
		this.ctx.storage.sql.exec(query, ...params);
	}

	private mapCustomer(row: Record<string, unknown>): OperationsCustomer {
		return {
			id: String(row.id),
			email: String(row.email),
			name: String(row.name),
			first_name: row.first_name ? String(row.first_name) : null,
			last_name: row.last_name ? String(row.last_name) : null,
			status: String(row.status) as OperationsCustomer["status"],
			tags: parseJson<string[]>(String(row.tags || "[]"), []),
			metadata: parseJson<Record<string, JsonValue>>(String(row.metadata || "{}"), {}),
			unsubscribe_token: String(row.unsubscribe_token),
			created_at: String(row.created_at),
			updated_at: String(row.updated_at),
			last_activity_at: row.last_activity_at ? String(row.last_activity_at) : null,
		};
	}

	private mapTemplate(row: Record<string, unknown>): OperationsTemplate {
		return {
			id: String(row.id),
			name: String(row.name),
			description: row.description ? String(row.description) : null,
			subject_template: String(row.subject_template),
			html_template: String(row.html_template),
			text_template: String(row.text_template || ""),
			preview_data: parseJson<Record<string, JsonValue>>(String(row.preview_data || "{}"), {}),
			created_at: String(row.created_at),
			updated_at: String(row.updated_at),
		};
	}

	private mapCampaign(row: Record<string, unknown>): OperationsCampaign {
		return {
			id: String(row.id),
			name: String(row.name),
			mailbox_id: String(row.mailbox_id),
			template_id: row.template_id ? String(row.template_id) : null,
			status: String(row.status) as OperationsCampaign["status"],
			subject_template: row.subject_template ? String(row.subject_template) : null,
			html_template: row.html_template ? String(row.html_template) : null,
			text_template: row.text_template ? String(row.text_template) : null,
			audience: parseJson<CampaignAudience>(String(row.audience_json || '{"mode":"all"}'), { mode: "all" }),
			scheduled_at: row.scheduled_at ? String(row.scheduled_at) : null,
			throttle_per_minute: Number(row.throttle_per_minute || 10),
			track_opens: Boolean(row.track_opens),
			track_clicks: Boolean(row.track_clicks),
			total_recipients: Number(row.total_recipients || 0),
			processed_recipients: Number(row.processed_recipients || 0),
			sent_recipients: Number(row.sent_recipients || 0),
			failed_recipients: Number(row.failed_recipients || 0),
			open_events: Number(row.open_events || 0),
			click_events: Number(row.click_events || 0),
			last_error: row.last_error ? String(row.last_error) : null,
			created_at: String(row.created_at),
			updated_at: String(row.updated_at),
		};
	}

	private mapRecipient(row: RecipientRow): OperationsRecipient {
		return {
			id: row.id,
			campaign_id: row.campaign_id,
			customer_id: row.customer_id,
			email: row.email,
			name: row.name,
			status: row.status,
			scheduled_at: row.scheduled_at,
			sent_at: row.sent_at,
			opened_at: row.opened_at,
			clicked_at: row.clicked_at,
			provider_message_id: row.provider_message_id,
			internal_message_id: row.internal_message_id,
			error_message: row.error_message,
		};
	}

	private mapEvent(row: Record<string, unknown>): OperationsEvent {
		return {
			id: String(row.id),
			campaign_id: row.campaign_id ? String(row.campaign_id) : null,
			recipient_id: row.recipient_id ? String(row.recipient_id) : null,
			customer_id: row.customer_id ? String(row.customer_id) : null,
			mailbox_id: row.mailbox_id ? String(row.mailbox_id) : null,
			event_type: String(row.event_type),
			email: row.email ? String(row.email) : null,
			payload: parseJson<Record<string, JsonValue>>(String(row.payload_json || "{}"), {}),
			created_at: String(row.created_at),
		};
	}

	private mapWebhook(row: Record<string, unknown>): OperationsWebhook {
		return {
			id: String(row.id),
			name: String(row.name),
			url: String(row.url),
			secret: row.secret ? String(row.secret) : null,
			event_types: parseJson<string[]>(String(row.event_types || "[]"), []),
			enabled: Boolean(row.enabled),
			created_at: String(row.created_at),
			updated_at: String(row.updated_at),
		};
	}

	private async dispatchWebhookEvents(event: OperationsEvent) {
		const hooks = this.rows<Record<string, unknown>>(
			`SELECT * FROM webhook_subscriptions WHERE enabled = 1 ORDER BY created_at ASC`,
		).map((row) => this.mapWebhook(row));

		const matchingHooks = hooks.filter((hook) =>
			hook.event_types.length === 0 ||
			hook.event_types.includes("*") ||
			hook.event_types.includes(event.event_type),
		);

		for (const hook of matchingHooks) {
			this.ctx.waitUntil((async () => {
				try {
					await fetch(hook.url, {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							...(hook.secret ? { "X-Operations-Webhook-Secret": hook.secret } : {}),
						},
						body: JSON.stringify({ event }),
					});
				} catch (e) {
					console.error(`Operations webhook delivery failed for ${hook.url}:`, (e as Error).message);
				}
			})());
		}
	}

	private async recordEvent(input: {
		campaignId?: string | null;
		recipientId?: string | null;
		customerId?: string | null;
		mailboxId?: string | null;
		eventType: string;
		email?: string | null;
		payload?: Record<string, JsonValue>;
	}) {
		const event: OperationsEvent = {
			id: crypto.randomUUID(),
			campaign_id: input.campaignId ?? null,
			recipient_id: input.recipientId ?? null,
			customer_id: input.customerId ?? null,
			mailbox_id: input.mailboxId ?? null,
			event_type: input.eventType,
			email: input.email ?? null,
			payload: input.payload ?? {},
			created_at: nowIso(),
		};

		this.run(
			`INSERT INTO events (
				id, campaign_id, recipient_id, customer_id, mailbox_id, event_type, email, payload_json, created_at
			) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
			event.id,
			event.campaign_id,
			event.recipient_id,
			event.customer_id,
			event.mailbox_id,
			event.event_type,
			event.email,
			JSON.stringify(event.payload),
			event.created_at,
		);

		await this.dispatchWebhookEvents(event);
	}

	private async ensureMailboxExists(mailboxId: string) {
		const mailboxConfig = await this.env.BUCKET.head(`mailboxes/${mailboxId}.json`);
		if (!mailboxConfig) {
			throw new Error(`Mailbox "${mailboxId}" not found`);
		}
	}

	private async resolveCampaignTemplate(campaign: OperationsCampaign) {
		if (!campaign.template_id) return null;
		const row = this.row<Record<string, unknown>>(
			`SELECT * FROM templates WHERE id = ?1`,
			campaign.template_id,
		);
		return row ? this.mapTemplate(row) : null;
	}

	private async buildCampaignAudience(campaign: OperationsCampaign) {
		const audience = campaign.audience;
		if (audience.mode === "customerIds" && audience.customerIds?.length) {
			const placeholders = audience.customerIds.map((_id, index) => `?${index + 1}`).join(", ");
			return this.rows<Record<string, unknown>>(
				`SELECT * FROM customers
				 WHERE id IN (${placeholders}) AND status != 'unsubscribed'
				 ORDER BY created_at ASC`,
				...audience.customerIds,
			).map((row) => this.mapCustomer(row));
		}

		if (audience.mode === "tag" && audience.tag) {
			return this.rows<Record<string, unknown>>(
				`SELECT * FROM customers
				 WHERE status != 'unsubscribed'
				 ORDER BY created_at ASC`,
			)
				.map((row) => this.mapCustomer(row))
				.filter((customer) => customer.tags.includes(audience.tag as string));
		}

		return this.rows<Record<string, unknown>>(
			`SELECT * FROM customers WHERE status = 'active' ORDER BY created_at ASC`,
		).map((row) => this.mapCustomer(row));
	}

	private async resyncCampaignCounts(campaignId: string) {
		const row = this.row<Record<string, unknown>>(
			`SELECT
				COUNT(*) as total,
				SUM(CASE WHEN status IN ('sent', 'opened', 'clicked') THEN 1 ELSE 0 END) as sent_total,
				SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_total,
				SUM(CASE WHEN status IN ('sent', 'opened', 'clicked', 'failed', 'unsubscribed', 'skipped') THEN 1 ELSE 0 END) as processed_total,
				SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) as open_total,
				SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) as click_total
			FROM campaign_recipients
			WHERE campaign_id = ?1`,
			campaignId,
		);

		this.run(
			`UPDATE campaigns
			 SET total_recipients = ?2,
			     sent_recipients = ?3,
			     failed_recipients = ?4,
			     processed_recipients = ?5,
			     open_events = ?6,
			     click_events = ?7,
			     updated_at = ?8
			 WHERE id = ?1`,
			campaignId,
			Number(row?.total || 0),
			Number(row?.sent_total || 0),
			Number(row?.failed_total || 0),
			Number(row?.processed_total || 0),
			Number(row?.open_total || 0),
			Number(row?.click_total || 0),
			nowIso(),
		);
	}

	private async scheduleNextAlarm() {
		const nextRow = this.row<Record<string, unknown>>(
			`SELECT MIN(COALESCE(cr.scheduled_at, c.scheduled_at, c.created_at)) as next_due
			 FROM campaign_recipients cr
			 JOIN campaigns c ON c.id = cr.campaign_id
			 WHERE c.status IN ('scheduled', 'sending')
			   AND cr.status IN ('scheduled', 'pending')`,
		);

		const nextDue = nextRow?.next_due ? new Date(String(nextRow.next_due)).getTime() : null;
		if (!nextDue || Number.isNaN(nextDue)) {
			await this.ctx.storage.deleteAlarm();
			return;
		}

		await this.ctx.storage.setAlarm(Math.max(Date.now(), nextDue));
	}

	private async prepareCampaignRecipients(campaignId: string) {
		const campaignRow = this.row<Record<string, unknown>>(
			`SELECT * FROM campaigns WHERE id = ?1`,
			campaignId,
		);
		if (!campaignRow) {
			throw new Error("Campaign not found");
		}

		const campaign = this.mapCampaign(campaignRow);
		await this.ensureMailboxExists(campaign.mailbox_id);
		const customers = await this.buildCampaignAudience(campaign);
		const scheduledAt = campaign.scheduled_at || nowIso();

		this.run(`DELETE FROM campaign_recipients WHERE campaign_id = ?1`, campaignId);
		for (const customer of customers) {
			this.run(
				`INSERT INTO campaign_recipients (
					id, campaign_id, customer_id, email, name, status, scheduled_at, sent_at,
					opened_at, clicked_at, provider_message_id, internal_message_id,
					error_message, created_at, updated_at
				) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, NULL, NULL, NULL, NULL, NULL, ?8, ?8)`,
				crypto.randomUUID(),
				campaignId,
				customer.id,
				customer.email,
				customer.name,
				new Date(scheduledAt).getTime() > Date.now() ? "scheduled" : "pending",
				scheduledAt,
				nowIso(),
			);
		}

		await this.resyncCampaignCounts(campaignId);
		return customers.length;
	}

	private buildTrackedContent(
		campaign: OperationsCampaign,
		customer: OperationsCustomer,
		template: OperationsTemplate | null,
		recipientId: string,
	) {
		const baseUrl = cleanBaseUrl(this.env.PUBLIC_BASE_URL);
		const subjectTemplate = campaign.subject_template || template?.subject_template || "";
		const htmlTemplate = campaign.html_template || template?.html_template || "";
		const textTemplate = campaign.text_template || template?.text_template || "";
		const mailboxDisplay = {
			email: campaign.mailbox_id,
			name: campaign.mailbox_id.split("@")[0] || campaign.mailbox_id,
		};
		const unsubscribeUrl = baseUrl
			? `${baseUrl}/ops/unsubscribe/${customer.unsubscribe_token}?customerId=${encodeURIComponent(customer.id)}`
			: "";
		const data = {
			customer,
			campaign,
			mailbox: mailboxDisplay,
			unsubscribeUrl,
		};

		const subject = renderTemplateString(subjectTemplate, data);
		let html = renderTemplateString(htmlTemplate, data);
		const text = renderTemplateString(textTemplate || htmlTemplate.replace(/<[^>]+>/g, " "), data);

		if (baseUrl && html) {
			if (campaign.track_clicks) {
				html = rewriteTrackedLinks(html, baseUrl, recipientId);
			}
			if (campaign.track_opens) {
				html = appendTrackingPixel(html, baseUrl, recipientId);
			}
		}

		return { subject, html, text };
	}

	private async loadRecipientContext(recipient: RecipientRow) {
		const campaignRow = this.row<Record<string, unknown>>(
			`SELECT * FROM campaigns WHERE id = ?1`,
			recipient.campaign_id,
		);
		if (!campaignRow) {
			throw new Error("Campaign not found");
		}
		const campaign = this.mapCampaign(campaignRow);
		const customerRow = this.row<Record<string, unknown>>(
			`SELECT * FROM customers WHERE id = ?1`,
			recipient.customer_id,
		);
		if (!customerRow) {
			throw new Error("Customer not found");
		}
		const customer = this.mapCustomer(customerRow);
		const template = await this.resolveCampaignTemplate(campaign);
		return { campaign, customer, template };
	}

	private async sendRecipient(recipient: RecipientRow) {
		const { campaign, customer, template } = await this.loadRecipientContext(recipient);
		if (campaign.status === "paused" || campaign.status === "cancelled") {
			return;
		}

		if (customer.status === "unsubscribed") {
			this.run(
				`UPDATE campaign_recipients
				 SET status = 'unsubscribed', updated_at = ?2
				 WHERE id = ?1`,
				recipient.id,
				nowIso(),
			);
			await this.recordEvent({
				campaignId: campaign.id,
				recipientId: recipient.id,
				customerId: customer.id,
				mailboxId: campaign.mailbox_id,
				eventType: "recipient_skipped_unsubscribed",
				email: customer.email,
			});
			return;
		}

		const mailboxStub = this.env.MAILBOX.get(this.env.MAILBOX.idFromName(campaign.mailbox_id));
		const rateLimitError = await (mailboxStub as unknown as {
			checkSendRateLimit: () => Promise<string | null>;
		}).checkSendRateLimit();

		if (rateLimitError) {
			const retryAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
			this.run(
				`UPDATE campaign_recipients
				 SET status = 'scheduled',
				     scheduled_at = ?2,
				     error_message = ?3,
				     updated_at = ?4
				 WHERE id = ?1`,
				recipient.id,
				retryAt,
				rateLimitError,
				nowIso(),
			);
			await this.recordEvent({
				campaignId: campaign.id,
				recipientId: recipient.id,
				customerId: customer.id,
				mailboxId: campaign.mailbox_id,
				eventType: "send_rate_limited",
				email: customer.email,
				payload: { retryAt, reason: rateLimitError },
			});
			return;
		}

		const fromDomain = campaign.mailbox_id.split("@")[1];
		if (!fromDomain) {
			throw new Error(`Invalid mailbox address: ${campaign.mailbox_id}`);
		}

		const { subject, html, text } = this.buildTrackedContent(
			campaign,
			customer,
			template,
			recipient.id,
		);
		const { messageId, outgoingMessageId } = generateMessageId(fromDomain);
		const sendAt = nowIso();
		const mailboxConfig = await this.env.BUCKET.get(`mailboxes/${campaign.mailbox_id}.json`);
		const mailboxSettings: Record<string, unknown> = mailboxConfig
			? await mailboxConfig.json<Record<string, unknown>>().catch(() => ({}))
			: {};
		const fromName =
			typeof mailboxSettings.fromName === "string" && mailboxSettings.fromName.trim()
				? mailboxSettings.fromName.trim()
				: campaign.mailbox_id.split("@")[0];
		const from = fromName
			? {
				email: campaign.mailbox_id,
				name: fromName,
			}
			: campaign.mailbox_id;

		this.run(
			`UPDATE campaign_recipients
			 SET status = 'sending', updated_at = ?2
			 WHERE id = ?1`,
			recipient.id,
			sendAt,
		);

		await this.recordEvent({
			campaignId: campaign.id,
			recipientId: recipient.id,
			customerId: customer.id,
			mailboxId: campaign.mailbox_id,
			eventType: "send_attempted",
			email: customer.email,
		});

		try {
			const result = await sendEmail(this.env.EMAIL, {
				to: customer.email,
				from,
				subject,
				html,
				text,
			});

			await (mailboxStub as unknown as {
				createEmail: (
					folder: string,
					email: {
						id: string;
						subject: string;
						sender: string;
						recipient: string;
						date: string;
						body: string;
						in_reply_to: string | null;
						email_references: string | null;
						thread_id: string | null;
						message_id: string | null;
						raw_headers: string | null;
					},
					attachments: unknown[],
				) => Promise<void>;
			}).createEmail(
				Folders.SENT,
				{
					id: messageId,
					subject,
					sender: campaign.mailbox_id.toLowerCase(),
					recipient: customer.email.toLowerCase(),
					date: sendAt,
					body: html || text,
					in_reply_to: null,
					email_references: null,
					thread_id: messageId,
					message_id: outgoingMessageId,
					raw_headers: JSON.stringify([
						{ key: "from", value: typeof from === "string" ? from : `${from.name} <${from.email}>` },
						{ key: "to", value: customer.email },
						{ key: "subject", value: subject },
						{ key: "date", value: sendAt },
						{ key: "message-id", value: `<${outgoingMessageId}>` },
					]),
				},
				[],
			);

			this.run(
				`UPDATE campaign_recipients
				 SET status = 'sent',
				     sent_at = ?2,
				     provider_message_id = ?3,
				     internal_message_id = ?4,
				     error_message = NULL,
				     updated_at = ?2
				 WHERE id = ?1`,
				recipient.id,
				sendAt,
				result.messageId,
				messageId,
			);

			this.run(
				`UPDATE customers
				 SET last_activity_at = ?2, updated_at = ?2
				 WHERE id = ?1`,
				customer.id,
				sendAt,
			);

			await this.recordEvent({
				campaignId: campaign.id,
				recipientId: recipient.id,
				customerId: customer.id,
				mailboxId: campaign.mailbox_id,
				eventType: "send_succeeded",
				email: customer.email,
				payload: {
					providerMessageId: result.messageId,
					internalMessageId: messageId,
				},
			});
		} catch (e) {
			const errorMessage = (e as Error).message;
			this.run(
				`UPDATE campaign_recipients
				 SET status = 'failed',
				     error_message = ?2,
				     updated_at = ?3
				 WHERE id = ?1`,
				recipient.id,
				errorMessage,
				nowIso(),
			);

			this.run(
				`UPDATE campaigns
				 SET last_error = ?2, updated_at = ?3
				 WHERE id = ?1`,
				campaign.id,
				errorMessage,
				nowIso(),
			);

			await this.recordEvent({
				campaignId: campaign.id,
				recipientId: recipient.id,
				customerId: customer.id,
				mailboxId: campaign.mailbox_id,
				eventType: "send_failed",
				email: customer.email,
				payload: { error: errorMessage },
			});
		}
	}

	async listCustomers(options: {
		query?: string;
		status?: string;
		tag?: string;
		page?: number;
		limit?: number;
	} = {}) {
		const page = Math.max(1, options.page || 1);
		const limit = Math.min(100, Math.max(1, options.limit || 25));
		const offset = (page - 1) * limit;
		const conditions: string[] = [];
		const params: (string | number)[] = [];

		if (options.query) {
			params.push(`%${options.query}%`);
			const p = `?${params.length}`;
			conditions.push(`(email LIKE ${p} OR name LIKE ${p})`);
		}
		if (options.status) {
			params.push(options.status);
			conditions.push(`status = ?${params.length}`);
		}

		const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
		const allRows = this.rows<Record<string, unknown>>(
			`SELECT * FROM customers ${where} ORDER BY created_at DESC`,
			...params,
		)
			.map((row) => this.mapCustomer(row))
			.filter((customer) => !options.tag || customer.tags.includes(options.tag));

		const rows = allRows.slice(offset, offset + limit);

		return {
			customers: rows,
			totalCount: allRows.length,
		};
	}

	async getCustomer(customerId: string) {
		const row = this.row<Record<string, unknown>>(
			`SELECT * FROM customers WHERE id = ?1`,
			customerId,
		);
		return row ? this.mapCustomer(row) : null;
	}

	async createCustomer(input: {
		email: string;
		name?: string;
		firstName?: string;
		lastName?: string;
		status?: OperationsCustomer["status"];
		tags?: string[];
		metadata?: Record<string, JsonValue>;
	}) {
		const createdAt = nowIso();
		const email = input.email.trim().toLowerCase();
		const name = input.name?.trim() || `${input.firstName || ""} ${input.lastName || ""}`.trim() || email.split("@")[0];
		const id = crypto.randomUUID();
		this.run(
			`INSERT INTO customers (
				id, email, name, first_name, last_name, status, tags, metadata, unsubscribe_token,
				created_at, updated_at, last_activity_at
			) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10, NULL)`,
			id,
			email,
			name,
			input.firstName?.trim() || null,
			input.lastName?.trim() || null,
			input.status || "active",
			JSON.stringify(normalizeTags(input.tags)),
			JSON.stringify(input.metadata || {}),
			crypto.randomUUID(),
			createdAt,
		);
		return this.getCustomer(id);
	}

	async updateCustomer(customerId: string, input: {
		email?: string;
		name?: string;
		firstName?: string | null;
		lastName?: string | null;
		status?: OperationsCustomer["status"];
		tags?: string[];
		metadata?: Record<string, JsonValue>;
	}) {
		const existing = await this.getCustomer(customerId);
		if (!existing) return null;
		const updatedAt = nowIso();
		this.run(
			`UPDATE customers
			 SET email = ?2,
			     name = ?3,
			     first_name = ?4,
			     last_name = ?5,
			     status = ?6,
			     tags = ?7,
			     metadata = ?8,
			     updated_at = ?9
			 WHERE id = ?1`,
			customerId,
			(input.email || existing.email).trim().toLowerCase(),
			(input.name || existing.name).trim(),
			input.firstName === undefined ? existing.first_name : input.firstName,
			input.lastName === undefined ? existing.last_name : input.lastName,
			input.status || existing.status,
			JSON.stringify(input.tags ? normalizeTags(input.tags) : existing.tags),
			JSON.stringify(input.metadata || existing.metadata),
			updatedAt,
		);
		return this.getCustomer(customerId);
	}

	async deleteCustomer(customerId: string) {
		const affectedCampaigns = this.rows<Record<string, unknown>>(
			`SELECT DISTINCT campaign_id FROM campaign_recipients WHERE customer_id = ?1`,
			customerId,
		).map((row) => String(row.campaign_id));
		this.run(`DELETE FROM customers WHERE id = ?1`, customerId);
		this.run(`DELETE FROM campaign_recipients WHERE customer_id = ?1`, customerId);
		for (const campaignId of affectedCampaigns) {
			await this.resyncCampaignCounts(campaignId);
		}
		return { deleted: true };
	}

	async listTemplates() {
		return this.rows<Record<string, unknown>>(
			`SELECT * FROM templates ORDER BY updated_at DESC`,
		).map((row) => this.mapTemplate(row));
	}

	async getTemplate(templateId: string) {
		const row = this.row<Record<string, unknown>>(
			`SELECT * FROM templates WHERE id = ?1`,
			templateId,
		);
		return row ? this.mapTemplate(row) : null;
	}

	async createTemplate(input: {
		name: string;
		description?: string;
		subjectTemplate: string;
		htmlTemplate: string;
		textTemplate?: string;
		previewData?: Record<string, JsonValue>;
	}) {
		const id = crypto.randomUUID();
		const createdAt = nowIso();
		this.run(
			`INSERT INTO templates (
				id, name, description, subject_template, html_template, text_template, preview_data, created_at, updated_at
			) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`,
			id,
			input.name.trim(),
			input.description?.trim() || null,
			input.subjectTemplate,
			input.htmlTemplate,
			input.textTemplate || "",
			JSON.stringify(input.previewData || {}),
			createdAt,
		);
		return this.getTemplate(id);
	}

	async updateTemplate(templateId: string, input: {
		name?: string;
		description?: string | null;
		subjectTemplate?: string;
		htmlTemplate?: string;
		textTemplate?: string;
		previewData?: Record<string, JsonValue>;
	}) {
		const existing = await this.getTemplate(templateId);
		if (!existing) return null;
		this.run(
			`UPDATE templates
			 SET name = ?2,
			     description = ?3,
			     subject_template = ?4,
			     html_template = ?5,
			     text_template = ?6,
			     preview_data = ?7,
			     updated_at = ?8
			 WHERE id = ?1`,
			templateId,
			input.name?.trim() || existing.name,
			input.description === undefined ? existing.description : input.description,
			input.subjectTemplate ?? existing.subject_template,
			input.htmlTemplate ?? existing.html_template,
			input.textTemplate ?? existing.text_template,
			JSON.stringify(input.previewData || existing.preview_data),
			nowIso(),
		);
		return this.getTemplate(templateId);
	}

	async deleteTemplate(templateId: string) {
		this.run(`DELETE FROM templates WHERE id = ?1`, templateId);
		return { deleted: true };
	}

	async renderTemplatePreview(input: {
		templateId?: string;
		mailboxId: string;
		customerId?: string;
		subjectTemplate?: string;
		htmlTemplate?: string;
		textTemplate?: string;
		previewData?: Record<string, JsonValue>;
		trackOpens?: boolean;
		trackClicks?: boolean;
	}) {
		const customer = input.customerId
			? await this.getCustomer(input.customerId)
			: {
				id: "preview",
				email: "preview@example.com",
				name: "Preview Customer",
				first_name: "Preview",
				last_name: "Customer",
				status: "active" as const,
				tags: [],
				metadata: {},
				unsubscribe_token: crypto.randomUUID(),
				created_at: nowIso(),
				updated_at: nowIso(),
				last_activity_at: null,
			};
		if (!customer) {
			throw new Error("Customer not found");
		}
		const template = input.templateId ? await this.getTemplate(input.templateId) : null;
		const campaign = {
			id: "preview",
			name: "Preview Campaign",
			mailbox_id: input.mailboxId,
			template_id: input.templateId || null,
			status: "draft" as const,
			subject_template: input.subjectTemplate || null,
			html_template: input.htmlTemplate || null,
			text_template: input.textTemplate || null,
			audience: { mode: "all" as const },
			scheduled_at: null,
			throttle_per_minute: 10,
			track_opens: Boolean(input.trackOpens ?? true),
			track_clicks: Boolean(input.trackClicks ?? true),
			total_recipients: 0,
			processed_recipients: 0,
			sent_recipients: 0,
			failed_recipients: 0,
			open_events: 0,
			click_events: 0,
			last_error: null,
			created_at: nowIso(),
			updated_at: nowIso(),
		};
		const rendered = this.buildTrackedContent(
			campaign,
			{
				...customer,
				metadata: { ...customer.metadata, ...(input.previewData || {}) },
			},
			template,
			"preview-delivery",
		);
		return rendered;
	}

	async listCampaigns() {
		return this.rows<Record<string, unknown>>(
			`SELECT * FROM campaigns ORDER BY updated_at DESC`,
		).map((row) => this.mapCampaign(row));
	}

	async getCampaign(campaignId: string) {
		const row = this.row<Record<string, unknown>>(
			`SELECT * FROM campaigns WHERE id = ?1`,
			campaignId,
		);
		return row ? this.mapCampaign(row) : null;
	}

	async createCampaign(input: {
		name: string;
		mailboxId: string;
		templateId?: string | null;
		subjectTemplate?: string | null;
		htmlTemplate?: string | null;
		textTemplate?: string | null;
		audience?: CampaignAudience;
		scheduledAt?: string | null;
		throttlePerMinute?: number;
		trackOpens?: boolean;
		trackClicks?: boolean;
	}) {
		await this.ensureMailboxExists(input.mailboxId);
		if (!input.templateId && !input.htmlTemplate && !input.textTemplate) {
			throw new Error("Campaign requires either a linked template or inline HTML/text content");
		}
		const id = crypto.randomUUID();
		const createdAt = nowIso();
		this.run(
			`INSERT INTO campaigns (
				id, name, mailbox_id, template_id, status, subject_template, html_template, text_template,
				audience_json, scheduled_at, throttle_per_minute, track_opens, track_clicks,
				total_recipients, processed_recipients, sent_recipients, failed_recipients,
				open_events, click_events, last_error, created_at, updated_at
			) VALUES (
				?1, ?2, ?3, ?4, 'draft', ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
				0, 0, 0, 0, 0, 0, NULL, ?13, ?13
			)`,
			id,
			input.name.trim(),
			input.mailboxId,
			input.templateId || null,
			input.subjectTemplate || null,
			input.htmlTemplate || null,
			input.textTemplate || null,
			JSON.stringify(input.audience || { mode: "all" }),
			input.scheduledAt || null,
			Math.min(120, Math.max(1, input.throttlePerMinute || 10)),
			input.trackOpens === false ? 0 : 1,
			input.trackClicks === false ? 0 : 1,
			createdAt,
		);
		return this.getCampaign(id);
	}

	async updateCampaign(campaignId: string, input: {
		name?: string;
		mailboxId?: string;
		templateId?: string | null;
		subjectTemplate?: string | null;
		htmlTemplate?: string | null;
		textTemplate?: string | null;
		audience?: CampaignAudience;
		scheduledAt?: string | null;
		throttlePerMinute?: number;
		trackOpens?: boolean;
		trackClicks?: boolean;
	}) {
		const existing = await this.getCampaign(campaignId);
		if (!existing) return null;
		const mailboxId = input.mailboxId || existing.mailbox_id;
		await this.ensureMailboxExists(mailboxId);
		const nextTemplateId = input.templateId === undefined ? existing.template_id : input.templateId;
		const nextHtml = input.htmlTemplate === undefined ? existing.html_template : input.htmlTemplate;
		const nextText = input.textTemplate === undefined ? existing.text_template : input.textTemplate;
		if (!nextTemplateId && !nextHtml && !nextText) {
			throw new Error("Campaign requires either a linked template or inline HTML/text content");
		}
		this.run(
			`UPDATE campaigns
			 SET name = ?2,
			     mailbox_id = ?3,
			     template_id = ?4,
			     subject_template = ?5,
			     html_template = ?6,
			     text_template = ?7,
			     audience_json = ?8,
			     scheduled_at = ?9,
			     throttle_per_minute = ?10,
			     track_opens = ?11,
			     track_clicks = ?12,
			     updated_at = ?13
			 WHERE id = ?1`,
			campaignId,
			input.name?.trim() || existing.name,
			mailboxId,
			nextTemplateId,
			input.subjectTemplate === undefined ? existing.subject_template : input.subjectTemplate,
			nextHtml,
			nextText,
			JSON.stringify(input.audience || existing.audience),
			input.scheduledAt === undefined ? existing.scheduled_at : input.scheduledAt,
			Math.min(120, Math.max(1, input.throttlePerMinute || existing.throttle_per_minute)),
			input.trackOpens === undefined ? (existing.track_opens ? 1 : 0) : input.trackOpens ? 1 : 0,
			input.trackClicks === undefined ? (existing.track_clicks ? 1 : 0) : input.trackClicks ? 1 : 0,
			nowIso(),
		);
		return this.getCampaign(campaignId);
	}

	async startCampaign(campaignId: string, scheduledAt?: string | null) {
		const campaign = await this.getCampaign(campaignId);
		if (!campaign) throw new Error("Campaign not found");
		const targetSchedule = scheduledAt || campaign.scheduled_at || nowIso();
		this.run(
			`UPDATE campaigns
			 SET status = ?2,
			     scheduled_at = ?3,
			     last_error = NULL,
			     updated_at = ?4
			 WHERE id = ?1`,
			campaignId,
			new Date(targetSchedule).getTime() > Date.now() ? "scheduled" : "sending",
			targetSchedule,
			nowIso(),
		);
		const totalRecipients = await this.prepareCampaignRecipients(campaignId);
		await this.recordEvent({
			campaignId,
			mailboxId: campaign.mailbox_id,
			eventType: "campaign_queued",
			payload: { totalRecipients, scheduledAt: targetSchedule },
		});
		await this.scheduleNextAlarm();
		return this.getCampaign(campaignId);
	}

	async pauseCampaign(campaignId: string) {
		this.run(
			`UPDATE campaigns SET status = 'paused', updated_at = ?2 WHERE id = ?1`,
			campaignId,
			nowIso(),
		);
		await this.recordEvent({
			campaignId,
			eventType: "campaign_paused",
		});
		await this.scheduleNextAlarm();
		return this.getCampaign(campaignId);
	}

	async resumeCampaign(campaignId: string) {
		const campaign = await this.getCampaign(campaignId);
		if (!campaign) throw new Error("Campaign not found");
		const status = campaign.scheduled_at && new Date(campaign.scheduled_at).getTime() > Date.now()
			? "scheduled"
			: "sending";
		this.run(
			`UPDATE campaigns SET status = ?2, updated_at = ?3 WHERE id = ?1`,
			campaignId,
			status,
			nowIso(),
		);
		await this.recordEvent({
			campaignId,
			eventType: "campaign_resumed",
		});
		await this.scheduleNextAlarm();
		return this.getCampaign(campaignId);
	}

	async cancelCampaign(campaignId: string) {
		this.run(
			`UPDATE campaigns SET status = 'cancelled', updated_at = ?2 WHERE id = ?1`,
			campaignId,
			nowIso(),
		);
		this.run(
			`UPDATE campaign_recipients
			 SET status = CASE
				 WHEN status IN ('scheduled', 'pending', 'sending') THEN 'skipped'
				 ELSE status
			 END,
			     updated_at = ?2
			 WHERE campaign_id = ?1`,
			campaignId,
			nowIso(),
		);
		await this.recordEvent({
			campaignId,
			eventType: "campaign_cancelled",
		});
		await this.resyncCampaignCounts(campaignId);
		await this.scheduleNextAlarm();
		return this.getCampaign(campaignId);
	}

	async listCampaignRecipients(campaignId: string, options: { page?: number; limit?: number } = {}) {
		const page = Math.max(1, options.page || 1);
		const limit = Math.min(200, Math.max(1, options.limit || 50));
		const offset = (page - 1) * limit;
		const recipients = this.rows<RecipientRow>(
			`SELECT * FROM campaign_recipients
			 WHERE campaign_id = ?1
			 ORDER BY created_at ASC
			 LIMIT ?2 OFFSET ?3`,
			campaignId,
			limit,
			offset,
		).map((row) => this.mapRecipient(row));

		const totalRow = this.row<Record<string, unknown>>(
			`SELECT COUNT(*) as total FROM campaign_recipients WHERE campaign_id = ?1`,
			campaignId,
		);

		return {
			recipients,
			totalCount: Number(totalRow?.total || 0),
		};
	}

	async listEvents(options: {
		campaignId?: string;
		customerId?: string;
		eventType?: string;
		page?: number;
		limit?: number;
	} = {}) {
		const page = Math.max(1, options.page || 1);
		const limit = Math.min(200, Math.max(1, options.limit || 50));
		const offset = (page - 1) * limit;
		const conditions: string[] = [];
		const params: (string | number)[] = [];

		if (options.campaignId) {
			params.push(options.campaignId);
			conditions.push(`campaign_id = ?${params.length}`);
		}
		if (options.customerId) {
			params.push(options.customerId);
			conditions.push(`customer_id = ?${params.length}`);
		}
		if (options.eventType) {
			params.push(options.eventType);
			conditions.push(`event_type = ?${params.length}`);
		}

		const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
		const events = this.rows<Record<string, unknown>>(
			`SELECT * FROM events ${where}
			 ORDER BY created_at DESC
			 LIMIT ?${params.length + 1} OFFSET ?${params.length + 2}`,
			...params,
			limit,
			offset,
		).map((row) => this.mapEvent(row));

		const totalRow = this.row<Record<string, unknown>>(
			`SELECT COUNT(*) as total FROM events ${where}`,
			...params,
		);

		return {
			events,
			totalCount: Number(totalRow?.total || 0),
		};
	}

	async listWebhooks() {
		return this.rows<Record<string, unknown>>(
			`SELECT * FROM webhook_subscriptions ORDER BY created_at DESC`,
		).map((row) => this.mapWebhook(row));
	}

	async createWebhook(input: {
		name: string;
		url: string;
		secret?: string | null;
		eventTypes?: string[];
		enabled?: boolean;
	}) {
		const id = crypto.randomUUID();
		const createdAt = nowIso();
		this.run(
			`INSERT INTO webhook_subscriptions (
				id, name, url, secret, event_types, enabled, created_at, updated_at
			) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`,
			id,
			input.name.trim(),
			input.url.trim(),
			input.secret?.trim() || null,
			JSON.stringify(input.eventTypes || ["*"]),
			input.enabled === false ? 0 : 1,
			createdAt,
		);
		return this.listWebhooks();
	}

	async updateWebhook(webhookId: string, input: {
		name?: string;
		url?: string;
		secret?: string | null;
		eventTypes?: string[];
		enabled?: boolean;
	}) {
		const webhook = this.row<Record<string, unknown>>(
			`SELECT * FROM webhook_subscriptions WHERE id = ?1`,
			webhookId,
		);
		if (!webhook) return null;
		const existing = this.mapWebhook(webhook);
		this.run(
			`UPDATE webhook_subscriptions
			 SET name = ?2,
			     url = ?3,
			     secret = ?4,
			     event_types = ?5,
			     enabled = ?6,
			     updated_at = ?7
			 WHERE id = ?1`,
			webhookId,
			input.name?.trim() || existing.name,
			input.url?.trim() || existing.url,
			input.secret === undefined ? existing.secret : input.secret,
			JSON.stringify(input.eventTypes || existing.event_types),
			input.enabled === undefined ? (existing.enabled ? 1 : 0) : input.enabled ? 1 : 0,
			nowIso(),
		);
		return this.listWebhooks();
	}

	async deleteWebhook(webhookId: string) {
		this.run(`DELETE FROM webhook_subscriptions WHERE id = ?1`, webhookId);
		return { deleted: true };
	}

	async ingestProviderReceipt(input: {
		campaignId?: string | null;
		recipientId?: string | null;
		customerId?: string | null;
		mailboxId?: string | null;
		email?: string | null;
		eventType: string;
		payload?: Record<string, JsonValue>;
	}) {
		const normalizedEventType = input.eventType.trim().toLowerCase();
		const resolvedRecipient = input.recipientId
			? this.row<RecipientRow>(
				`SELECT * FROM campaign_recipients WHERE id = ?1`,
				input.recipientId,
			)
			: input.campaignId && input.email
				? this.row<RecipientRow>(
					`SELECT * FROM campaign_recipients WHERE campaign_id = ?1 AND email = ?2 ORDER BY created_at DESC LIMIT 1`,
					input.campaignId,
					input.email.toLowerCase(),
				)
				: null;

		if (resolvedRecipient) {
			const eventAt = nowIso();
			if (["delivered", "accepted", "processed", "sent"].includes(normalizedEventType)) {
				this.run(
					`UPDATE campaign_recipients
					 SET status = CASE
						 WHEN status IN ('opened', 'clicked') THEN status
						 ELSE 'sent'
					 END,
					     sent_at = COALESCE(sent_at, ?2),
					     updated_at = ?2
					 WHERE id = ?1`,
					resolvedRecipient.id,
					eventAt,
				);
			} else if (["opened", "open"].includes(normalizedEventType)) {
				this.run(
					`UPDATE campaign_recipients
					 SET status = CASE
						 WHEN status = 'clicked' THEN status
						 ELSE 'opened'
					 END,
					     sent_at = COALESCE(sent_at, ?2),
					     opened_at = COALESCE(opened_at, ?2),
					     updated_at = ?2
					 WHERE id = ?1`,
					resolvedRecipient.id,
					eventAt,
				);
			} else if (["clicked", "click"].includes(normalizedEventType)) {
				this.run(
					`UPDATE campaign_recipients
					 SET status = 'clicked',
					     sent_at = COALESCE(sent_at, ?2),
					     opened_at = COALESCE(opened_at, ?2),
					     clicked_at = COALESCE(clicked_at, ?2),
					     updated_at = ?2
					 WHERE id = ?1`,
					resolvedRecipient.id,
					eventAt,
				);
			} else if (["bounced", "bounce", "failed", "rejected", "dropped", "complained", "complaint"].includes(normalizedEventType)) {
				this.run(
					`UPDATE campaign_recipients
					 SET status = 'failed',
					     error_message = ?2,
					     updated_at = ?3
					 WHERE id = ?1`,
					resolvedRecipient.id,
					typeof input.payload?.error === "string" ? input.payload.error : normalizedEventType,
					eventAt,
				);
			} else if (["unsubscribed", "unsubscribe"].includes(normalizedEventType)) {
				this.run(
					`UPDATE campaign_recipients
					 SET status = 'unsubscribed',
					     updated_at = ?2
					 WHERE id = ?1`,
					resolvedRecipient.id,
					eventAt,
				);
				this.run(
					`UPDATE customers
					 SET status = 'unsubscribed', updated_at = ?2
					 WHERE id = ?1`,
					resolvedRecipient.customer_id,
					eventAt,
				);
			}

			await this.resyncCampaignCounts(resolvedRecipient.campaign_id);
		}

		await this.recordEvent({
			campaignId: input.campaignId || resolvedRecipient?.campaign_id || null,
			recipientId: input.recipientId || resolvedRecipient?.id || null,
			customerId: input.customerId || resolvedRecipient?.customer_id || null,
			mailboxId: input.mailboxId || null,
			eventType: normalizedEventType,
			email: input.email || resolvedRecipient?.email || null,
			payload: input.payload,
		});
		return { accepted: true };
	}

	async trackOpen(recipientId: string) {
		const recipient = this.row<RecipientRow>(
			`SELECT * FROM campaign_recipients WHERE id = ?1`,
			recipientId,
		);
		if (!recipient) {
			return { found: false };
		}

		const openedAt = recipient.opened_at || nowIso();
		this.run(
			`UPDATE campaign_recipients
			 SET opened_at = COALESCE(opened_at, ?2),
			     status = CASE
					 WHEN status = 'clicked' THEN status
					 ELSE 'opened'
				 END,
			     updated_at = ?2
			 WHERE id = ?1`,
			recipientId,
			openedAt,
		);
		await this.recordEvent({
			campaignId: recipient.campaign_id,
			recipientId: recipient.id,
			customerId: recipient.customer_id,
			eventType: "opened",
			email: recipient.email,
		});
		await this.resyncCampaignCounts(recipient.campaign_id);
		return { found: true };
	}

	async trackClick(recipientId: string, targetUrl: string) {
		const recipient = this.row<RecipientRow>(
			`SELECT * FROM campaign_recipients WHERE id = ?1`,
			recipientId,
		);
		if (!recipient) {
			return { found: false, targetUrl };
		}

		const clickedAt = recipient.clicked_at || nowIso();
		this.run(
			`UPDATE campaign_recipients
			 SET clicked_at = COALESCE(clicked_at, ?2),
			     opened_at = COALESCE(opened_at, ?2),
			     status = 'clicked',
			     updated_at = ?2
			 WHERE id = ?1`,
			recipientId,
			clickedAt,
		);
		await this.recordEvent({
			campaignId: recipient.campaign_id,
			recipientId: recipient.id,
			customerId: recipient.customer_id,
			eventType: "clicked",
			email: recipient.email,
			payload: { url: targetUrl },
		});
		await this.resyncCampaignCounts(recipient.campaign_id);
		return { found: true, targetUrl };
	}

	async unsubscribeByToken(token: string, customerId?: string) {
		const customer = customerId
			? this.row<Record<string, unknown>>(
				`SELECT * FROM customers WHERE id = ?1 AND unsubscribe_token = ?2`,
				customerId,
				token,
			)
			: this.row<Record<string, unknown>>(
				`SELECT * FROM customers WHERE unsubscribe_token = ?1`,
				token,
			);
		if (!customer) return { unsubscribed: false };

		const mapped = this.mapCustomer(customer);
		this.run(
			`UPDATE customers SET status = 'unsubscribed', updated_at = ?2 WHERE id = ?1`,
			mapped.id,
			nowIso(),
		);
		this.run(
			`UPDATE campaign_recipients
			 SET status = CASE
				 WHEN status IN ('sent', 'opened', 'clicked') THEN 'unsubscribed'
				 ELSE status
			 END,
			     updated_at = ?2
			 WHERE customer_id = ?1`,
			mapped.id,
			nowIso(),
		);
		await this.recordEvent({
			customerId: mapped.id,
			email: mapped.email,
			eventType: "customer_unsubscribed",
		});
		return { unsubscribed: true, customer: mapped };
	}

	async getPixelResponse() {
		return ONE_PIXEL_GIF;
	}

	async alarm() {
		const dueRecipients = this.rows<RecipientRow>(
			`SELECT cr.*
			 FROM campaign_recipients cr
			 JOIN campaigns c ON c.id = cr.campaign_id
			 WHERE c.status IN ('scheduled', 'sending')
			   AND cr.status IN ('scheduled', 'pending')
			   AND datetime(COALESCE(cr.scheduled_at, c.scheduled_at, c.created_at)) <= datetime('now')
			 ORDER BY COALESCE(cr.scheduled_at, c.scheduled_at, c.created_at) ASC
			 LIMIT 10`,
		);

		for (const recipient of dueRecipients) {
			try {
				await this.sendRecipient(recipient);
			} catch (e) {
				console.error(`Failed to process campaign recipient ${recipient.id}:`, (e as Error).message);
			}
		}

		const affectedCampaignIds = [...new Set(dueRecipients.map((recipient) => recipient.campaign_id))];
		for (const campaignId of affectedCampaignIds) {
			await this.resyncCampaignCounts(campaignId);
			const campaign = await this.getCampaign(campaignId);
			if (!campaign) continue;
			if (
				campaign.total_recipients > 0 &&
				campaign.processed_recipients >= campaign.total_recipients &&
				campaign.status !== "cancelled"
			) {
				this.run(
					`UPDATE campaigns SET status = 'completed', updated_at = ?2 WHERE id = ?1`,
					campaignId,
					nowIso(),
				);
				await this.recordEvent({
					campaignId,
					mailboxId: campaign.mailbox_id,
					eventType: "campaign_completed",
					payload: {
						totalRecipients: campaign.total_recipients,
						sentRecipients: campaign.sent_recipients,
						failedRecipients: campaign.failed_recipients,
					},
				});
			}
		}

		await this.scheduleNextAlarm();
	}
}
