// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/** Centralised query key factories for cache invalidation. */
export const queryKeys = {
	mailboxes: {
		all: ["mailboxes"] as const,
		detail: (id: string) => ["mailboxes", id] as const,
	},
	emails: {
		list: (mailboxId: string, params: Record<string, string>) =>
			["emails", mailboxId, params] as const,
		detail: (mailboxId: string, emailId: string) =>
			["emails", mailboxId, emailId] as const,
		thread: (mailboxId: string, threadId: string) =>
			["emails", mailboxId, "thread", threadId] as const,
	},
	folders: {
		list: (mailboxId: string) => ["folders", mailboxId] as const,
	},
	search: {
		results: (mailboxId: string, query: string, page: number) =>
			["search", mailboxId, query, page] as const,
	},
	operations: {
		customers: ["operations", "customers"] as const,
		customer: (customerId: string) => ["operations", "customers", customerId] as const,
		templates: ["operations", "templates"] as const,
		template: (templateId: string) => ["operations", "templates", templateId] as const,
		campaigns: ["operations", "campaigns"] as const,
		campaign: (campaignId: string) => ["operations", "campaigns", campaignId] as const,
		recipients: (campaignId: string, page: number) => ["operations", "campaigns", campaignId, "recipients", page] as const,
		events: (filters: Record<string, string | number | undefined>) => ["operations", "events", filters] as const,
		webhooks: ["operations", "webhooks"] as const,
	},
	config: ["config"] as const,
};
