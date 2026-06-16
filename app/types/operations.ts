// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export interface OperationsCustomer {
	id: string;
	email: string;
	name: string;
	first_name?: string | null;
	last_name?: string | null;
	status: "active" | "paused" | "unsubscribed";
	tags: string[];
	metadata: Record<string, unknown>;
	unsubscribe_token: string;
	created_at: string;
	updated_at: string;
	last_activity_at?: string | null;
}

export interface OperationsTemplate {
	id: string;
	name: string;
	description?: string | null;
	subject_template: string;
	html_template: string;
	text_template: string;
	preview_data: Record<string, unknown>;
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
	template_id?: string | null;
	status: "draft" | "scheduled" | "sending" | "paused" | "completed" | "cancelled" | "failed";
	subject_template?: string | null;
	html_template?: string | null;
	text_template?: string | null;
	audience: CampaignAudience;
	scheduled_at?: string | null;
	throttle_per_minute: number;
	track_opens: boolean;
	track_clicks: boolean;
	total_recipients: number;
	processed_recipients: number;
	sent_recipients: number;
	failed_recipients: number;
	open_events: number;
	click_events: number;
	last_error?: string | null;
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
	scheduled_at?: string | null;
	sent_at?: string | null;
	opened_at?: string | null;
	clicked_at?: string | null;
	provider_message_id?: string | null;
	internal_message_id?: string | null;
	error_message?: string | null;
}

export interface OperationsEvent {
	id: string;
	campaign_id?: string | null;
	recipient_id?: string | null;
	customer_id?: string | null;
	mailbox_id?: string | null;
	event_type: string;
	email?: string | null;
	payload: Record<string, unknown>;
	created_at: string;
}

export interface OperationsWebhook {
	id: string;
	name: string;
	url: string;
	secret?: string | null;
	event_types: string[];
	enabled: boolean;
	created_at: string;
	updated_at: string;
}

export interface ManagedApiKey {
	id: string;
	name: string;
	key_prefix: string;
	scopes: string[];
	allowed_mailboxes: string[];
	last_used_at?: string | null;
	created_at: string;
	revoked_at?: string | null;
}

export interface ManagedApiKeyCreateResult {
	apiKey: string;
	record: ManagedApiKey;
}

export interface AuthenticatedUser {
	id: string;
	email: string;
	name: string;
	globalRole: "admin" | "member";
	status: "active" | "disabled";
	createdAt: string;
	updatedAt: string;
	lastLoginAt?: string | null;
}

export interface MailboxMembership {
	id: string;
	user_id: string;
	mailbox_id: string;
	role: "viewer" | "editor" | "owner";
	created_at: string;
	updated_at: string;
}

export interface UserWithMemberships extends AuthenticatedUser {
	memberships: MailboxMembership[];
}
