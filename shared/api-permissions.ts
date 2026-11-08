export const API_KEY_SCOPES = ["mailboxes:read", "emails:read", "emails:send", "transactional:send"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const API_KEY_SCOPE_DETAILS: Record<ApiKeyScope, { label: string; description: string }> = {
	"mailboxes:read": { label: "Read mailboxes", description: "List allowed mailboxes and read their metadata and settings." },
	"emails:read": { label: "Read emails", description: "Read email lists, details, threads, folders, search results, and attachments." },
	"emails:send": { label: "Send emails", description: "Send new emails, replies, and forwards. Does not grant email management permissions." },
	"transactional:send": { label: "Send transactional emails", description: "Use the existing transactional send API, including saved templates." },
};

type ApiKeyEndpoint = { method: string; path: string; scope: ApiKeyScope; mailboxRule: "list" | "path" | "body" };

export const API_KEY_ENDPOINTS: readonly ApiKeyEndpoint[] = [
	{ method: "GET", path: "/api/v1/mailboxes", scope: "mailboxes:read", mailboxRule: "list" },
	{ method: "GET", path: "/api/v1/mailboxes/:mailboxId", scope: "mailboxes:read", mailboxRule: "path" },
	{ method: "GET", path: "/api/v1/mailboxes/:mailboxId/folders", scope: "emails:read", mailboxRule: "path" },
	{ method: "GET", path: "/api/v1/mailboxes/:mailboxId/emails", scope: "emails:read", mailboxRule: "path" },
	{ method: "GET", path: "/api/v1/mailboxes/:mailboxId/emails/:id", scope: "emails:read", mailboxRule: "path" },
	{ method: "GET", path: "/api/v1/mailboxes/:mailboxId/threads/:threadId", scope: "emails:read", mailboxRule: "path" },
	{ method: "GET", path: "/api/v1/mailboxes/:mailboxId/search", scope: "emails:read", mailboxRule: "path" },
	{ method: "GET", path: "/api/v1/mailboxes/:mailboxId/emails/:emailId/attachments/:attachmentId", scope: "emails:read", mailboxRule: "path" },
	{ method: "POST", path: "/api/v1/mailboxes/:mailboxId/emails", scope: "emails:send", mailboxRule: "path" },
	{ method: "POST", path: "/api/v1/mailboxes/:mailboxId/emails/:id/reply", scope: "emails:send", mailboxRule: "path" },
	{ method: "POST", path: "/api/v1/mailboxes/:mailboxId/emails/:id/forward", scope: "emails:send", mailboxRule: "path" },
	{ method: "POST", path: "/api/v1/transactional/send", scope: "transactional:send", mailboxRule: "body" },
];

export function getApiKeyEndpoint(method: string, pathTemplate: string) {
	return API_KEY_ENDPOINTS.find((endpoint) => endpoint.method === method && endpoint.path === pathTemplate);
}

export function matchApiKeyEndpoint(method: string, path: string) {
	const segments = path.split("/");
	for (const endpoint of API_KEY_ENDPOINTS) {
		if (endpoint.method !== method) continue;
		const template = endpoint.path.split("/");
		if (template.length !== segments.length) continue;
		if (!template.every((part, i) => part.startsWith(":") ? Boolean(segments[i]) : part === segments[i])) continue;
		const mailboxIndex = template.indexOf(":mailboxId");
		let mailboxId: string | undefined;
		if (mailboxIndex >= 0) {
			try {
				mailboxId = decodeURIComponent(segments[mailboxIndex]).toLowerCase();
			} catch {
				return null;
			}
		}
		return { ...endpoint, mailboxId };
	}
	return null;
}
