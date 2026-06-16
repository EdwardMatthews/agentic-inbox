// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Input, Loader } from "@cloudflare/kumo";
import { ArrowLeftIcon, BookOpenIcon, CopyIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import api from "~/services/api";
import { queryKeys } from "~/queries/keys";

type AuthMode = "Session Cookie" | "API Key" | "Public" | "Advanced";

interface EndpointDoc {
	method: string;
	path: string;
	auth: AuthMode;
	title: string;
	description: string;
	headers?: string[];
	query?: string[];
	body?: string[];
}

interface ExampleGroup {
	title: string;
	description: string;
	examples: Array<{
		language: string;
		code: string;
	}>;
}

interface EndpointSection {
	id: string;
	title: string;
	description: string;
	endpoints: EndpointDoc[];
	examples?: ExampleGroup[];
}

const endpointSections: EndpointSection[] = [
	{
		id: "auth",
		title: "Auth Modes",
		description:
			"Agentic Inbox currently exposes three HTTP auth modes: Session Cookie for human/admin APIs, API key for machine transactional sends, and public endpoints for opens/clicks/unsubscribes.",
		endpoints: [
			{
				method: "AUTH",
				path: "agentic_inbox_session cookie",
				auth: "Session Cookie",
				title: "Protected application APIs",
				description: "Most mailbox, operations, and settings APIs require a valid signed session cookie created by the local login flow.",
				headers: ["Cookie: agentic_inbox_session=<session-token>"],
			},
			{
				method: "AUTH",
				path: "Authorization / X-Agentic-Inbox-Api-Key",
				auth: "API Key",
				title: "Machine transactional send",
				description: "External applications should use a managed API key for transactional mail.",
				headers: [
					"Authorization: Bearer <api-key>",
					"X-Agentic-Inbox-Api-Key: <api-key>",
				],
			},
			{
				method: "AUTH",
				path: "/ops/*",
				auth: "Public",
				title: "Recipient-facing tracking routes",
				description: "Open, click, and unsubscribe routes must be publicly accessible so recipients can trigger them from email clients.",
			},
		],
	},
	{
		id: "core",
		title: "Core Config And Mailboxes",
		description:
			"These APIs drive the mailbox UI itself. They are the right surface for mailbox provisioning and normal inbox browsing.",
		endpoints: [
			{
				method: "GET",
				path: "/api/v1/config",
				auth: "Session Cookie",
				title: "Get deployment configuration",
				description: "Returns configured domains, EMAIL_ADDRESSES, and operationsBaseUrl.",
			},
			{
				method: "GET",
				path: "/api/v1/mailboxes",
				auth: "Session Cookie",
				title: "List mailboxes",
				description: "Returns all provisioned mailboxes with inbox unread counts.",
			},
			{
				method: "POST",
				path: "/api/v1/mailboxes",
				auth: "Session Cookie",
				title: "Create mailbox",
				description: "Creates a mailbox configuration and initializes its folders.",
				body: ["email", "name", "settings?"],
			},
			{
				method: "GET",
				path: "/api/v1/mailboxes/:mailboxId",
				auth: "Session Cookie",
				title: "Get mailbox settings",
				description: "Returns mailbox metadata and saved settings.",
			},
			{
				method: "PUT",
				path: "/api/v1/mailboxes/:mailboxId",
				auth: "Session Cookie",
				title: "Update mailbox settings",
				description: "Updates mailbox-level settings such as fromName and agent prompt.",
				body: ["settings"],
			},
			{
				method: "DELETE",
				path: "/api/v1/mailboxes/:mailboxId",
				auth: "Session Cookie",
				title: "Delete mailbox",
				description: "Deletes the mailbox config. Existing email cleanup is not fully destructive yet.",
			},
		],
	},
	{
		id: "mail",
		title: "Mailbox Email APIs",
		description:
			"These APIs power the existing inbox and compose experience. They are mailbox-scoped and require the mailbox address in the path.",
		endpoints: [
			{
				method: "GET",
				path: "/api/v1/mailboxes/:mailboxId/emails",
				auth: "Session Cookie",
				title: "List emails",
				description: "Lists mailbox emails. Supports folder, thread_id, threaded, pagination, and sort query params.",
				query: ["folder", "thread_id", "threaded", "page", "limit", "sortColumn", "sortDirection"],
			},
			{
				method: "POST",
				path: "/api/v1/mailboxes/:mailboxId/emails",
				auth: "Session Cookie",
				title: "Send a new email",
				description: "Sends a new outbound email through a mailbox and stores it in Sent.",
				body: ["to", "from", "subject", "html? | text?", "cc?", "bcc?", "attachments?"],
			},
			{
				method: "POST",
				path: "/api/v1/mailboxes/:mailboxId/drafts",
				auth: "Session Cookie",
				title: "Save draft",
				description: "Creates or replaces a draft email in the Drafts folder.",
				body: ["to?", "cc?", "bcc?", "subject?", "body", "in_reply_to?", "thread_id?", "draft_id?"],
			},
			{
				method: "GET",
				path: "/api/v1/mailboxes/:mailboxId/emails/:id",
				auth: "Session Cookie",
				title: "Get email detail",
				description: "Returns a full email record with attachments.",
			},
			{
				method: "PUT",
				path: "/api/v1/mailboxes/:mailboxId/emails/:id",
				auth: "Session Cookie",
				title: "Update email flags",
				description: "Updates read and/or starred state.",
				body: ["read?", "starred?"],
			},
			{
				method: "DELETE",
				path: "/api/v1/mailboxes/:mailboxId/emails/:id",
				auth: "Session Cookie",
				title: "Delete email",
				description: "Deletes an email and its attachment blobs.",
			},
			{
				method: "POST",
				path: "/api/v1/mailboxes/:mailboxId/emails/:id/move",
				auth: "Session Cookie",
				title: "Move email to folder",
				description: "Moves an email to another folder by folderId.",
				body: ["folderId"],
			},
			{
				method: "GET",
				path: "/api/v1/mailboxes/:mailboxId/threads/:threadId",
				auth: "Session Cookie",
				title: "Get thread",
				description: "Returns all messages in the thread with full bodies and attachments.",
			},
			{
				method: "POST",
				path: "/api/v1/mailboxes/:mailboxId/threads/:threadId/read",
				auth: "Session Cookie",
				title: "Mark thread read",
				description: "Marks all unread messages in the thread as read.",
			},
			{
				method: "POST",
				path: "/api/v1/mailboxes/:mailboxId/emails/:id/reply",
				auth: "Session Cookie",
				title: "Reply to an email",
				description: "Sends a reply with threading preserved and stores it in Sent.",
				body: ["to", "from", "subject", "html? | text?", "cc?", "bcc?", "attachments?"],
			},
			{
				method: "POST",
				path: "/api/v1/mailboxes/:mailboxId/emails/:id/forward",
				auth: "Session Cookie",
				title: "Forward an email",
				description: "Forwards an email and stores the forwarded copy in Sent.",
				body: ["to", "from", "subject", "html? | text?", "cc?", "bcc?", "attachments?"],
			},
			{
				method: "GET",
				path: "/api/v1/mailboxes/:mailboxId/folders",
				auth: "Session Cookie",
				title: "List folders",
				description: "Returns mailbox folders with unread counts.",
			},
			{
				method: "POST",
				path: "/api/v1/mailboxes/:mailboxId/folders",
				auth: "Session Cookie",
				title: "Create custom folder",
				description: "Creates a custom folder using a slugified id.",
				body: ["name"],
			},
			{
				method: "PUT",
				path: "/api/v1/mailboxes/:mailboxId/folders/:id",
				auth: "Session Cookie",
				title: "Rename folder",
				description: "Updates a custom folder display name.",
				body: ["name"],
			},
			{
				method: "DELETE",
				path: "/api/v1/mailboxes/:mailboxId/folders/:id",
				auth: "Session Cookie",
				title: "Delete folder",
				description: "Deletes a deletable folder.",
			},
			{
				method: "GET",
				path: "/api/v1/mailboxes/:mailboxId/search",
				auth: "Session Cookie",
				title: "Search mailbox",
				description: "Searches by full-text query plus structured filters such as from, to, subject, has_attachment, and date range.",
				query: ["query", "folder", "from", "to", "subject", "date_start", "date_end", "is_read", "is_starred", "has_attachment", "page", "limit"],
			},
			{
				method: "GET",
				path: "/api/v1/mailboxes/:mailboxId/emails/:emailId/attachments/:attachmentId",
				auth: "Session Cookie",
				title: "Download attachment",
				description: "Returns the binary attachment stream with content type and download headers.",
			},
		],
		examples: [
			{
				title: "Mailbox send example",
				description: "Use this when a trusted backend or authenticated client needs to send a single email through a specific mailbox.",
				examples: [
					{
						language: "cURL",
						code: `curl -X POST "$BASE_URL/api/v1/mailboxes/noreply@example.com/emails" \\
  -H "Content-Type: application/json" \\
  -H "Cookie: agentic_inbox_session=$SESSION_COOKIE" \\
  -d '{
    "to": "user@example.com",
    "from": { "email": "noreply@example.com", "name": "Example App" },
    "subject": "Welcome",
    "html": "<p>Welcome to Example App.</p>",
    "text": "Welcome to Example App."
  }'`,
					},
					{
						language: "JavaScript / TypeScript",
						code: `await fetch(\`\${baseUrl}/api/v1/mailboxes/noreply@example.com/emails\`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Cookie: \`agentic_inbox_session=\${sessionCookie}\`,
  },
  body: JSON.stringify({
    to: "user@example.com",
    from: { email: "noreply@example.com", name: "Example App" },
    subject: "Welcome",
    html: "<p>Welcome to Example App.</p>",
    text: "Welcome to Example App.",
  }),
});`,
					},
					{
						language: "Python",
						code: `import requests

response = requests.post(
    f"{base_url}/api/v1/mailboxes/noreply@example.com/emails",
    headers={
        "Content-Type": "application/json",
        "Cookie": f"agentic_inbox_session={session_cookie}",
    },
    json={
        "to": "user@example.com",
        "from": {"email": "noreply@example.com", "name": "Example App"},
        "subject": "Welcome",
        "html": "<p>Welcome to Example App.</p>",
        "text": "Welcome to Example App.",
    },
)
response.raise_for_status()`,
					},
				],
			},
		],
	},
	{
		id: "transactional",
		title: "Transactional Email API",
		description:
			"Use the transactional endpoint for machine-to-machine sends like activation links, password resets, security alerts, and other app-driven notifications.",
		endpoints: [
			{
				method: "POST",
				path: "/api/v1/transactional/send",
				auth: "API Key",
				title: "Send transactional email",
				description: "Sends a single transactional email using an API key. Supports inline content or a saved template, attachments, and optional open/click tracking.",
				headers: [
					"Authorization: Bearer <api-key> OR X-Agentic-Inbox-Api-Key: <api-key>",
					"Content-Type: application/json",
				],
				body: [
					"mailboxId",
					"to",
					"subject? or templateId",
					"html? | text? | templateId",
					"fromName?",
					"cc?",
					"bcc?",
					"replyTo?",
					"variables?",
					"trackOpens?",
					"trackClicks?",
					"attachments?",
				],
			},
		],
		examples: [
			{
				title: "Activation email workflow",
				description: "A backend app can render an activation URL into variables and send immediately through the transactional endpoint.",
				examples: [
					{
						language: "cURL",
						code: `curl -X POST "$BASE_URL/api/v1/transactional/send" \\
  -H "Authorization: Bearer $AGENTIC_INBOX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "mailboxId": "noreply@example.com",
    "to": "new-user@example.com",
    "subject": "Activate your account",
    "html": "<p>Click <a href=\\"{{variables.activationUrl}}\\">here</a> to activate your account.</p>",
    "text": "Activate your account: {{variables.activationUrl}}",
    "variables": {
      "activationUrl": "https://app.example.com/activate?token=abc123"
    },
    "trackOpens": true,
    "trackClicks": true
  }'`,
					},
					{
						language: "Node.js",
						code: `await fetch(\`\${baseUrl}/api/v1/transactional/send\`, {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.AGENTIC_INBOX_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    mailboxId: "noreply@example.com",
    to: "new-user@example.com",
    subject: "Activate your account",
    html: "<p>Activate: <a href=\\"{{variables.activationUrl}}\\">link</a></p>",
    text: "Activate: {{variables.activationUrl}}",
    variables: {
      activationUrl: "https://app.example.com/activate?token=abc123",
    },
    trackOpens: true,
    trackClicks: true,
  }),
});`,
					},
					{
						language: "Python",
						code: `import requests

response = requests.post(
    f"{base_url}/api/v1/transactional/send",
    headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    },
    json={
        "mailboxId": "noreply@example.com",
        "to": "new-user@example.com",
        "subject": "Activate your account",
        "html": "<p>Activate: <a href=\\"{{variables.activationUrl}}\\">link</a></p>",
        "text": "Activate: {{variables.activationUrl}}",
        "variables": {
            "activationUrl": "https://app.example.com/activate?token=abc123"
        },
        "trackOpens": True,
        "trackClicks": True,
    },
)
response.raise_for_status()`,
					},
					{
						language: "Go",
						code: `payload := map[string]any{
  "mailboxId": "noreply@example.com",
  "to": "new-user@example.com",
  "subject": "Activate your account",
  "html": "<p>Activate: <a href=\\"{{variables.activationUrl}}\\">link</a></p>",
  "text": "Activate: {{variables.activationUrl}}",
  "variables": map[string]any{
    "activationUrl": "https://app.example.com/activate?token=abc123",
  },
  "trackOpens": true,
  "trackClicks": true,
}

body, _ := json.Marshal(payload)
req, _ := http.NewRequest("POST", baseURL+"/api/v1/transactional/send", bytes.NewReader(body))
req.Header.Set("Authorization", "Bearer "+apiKey)
req.Header.Set("Content-Type", "application/json")
resp, err := http.DefaultClient.Do(req)
if err != nil { panic(err) }
defer resp.Body.Close()`,
					},
				],
			},
		],
	},
	{
		id: "settings",
		title: "Global Settings And API Keys",
		description:
			"These APIs manage machine credentials for external applications. They remain behind the local session-authenticated admin surface and are intended for human administrators.",
		endpoints: [
			{
				method: "GET",
				path: "/api/v1/settings/api-keys",
				auth: "Session Cookie",
				title: "List API keys",
				description: "Returns API key metadata, prefixes, scopes, mailbox allowlists, and last-used timestamps.",
			},
			{
				method: "POST",
				path: "/api/v1/settings/api-keys",
				auth: "Session Cookie",
				title: "Create API key",
				description: "Creates a new machine key. The full secret is returned once at creation time only.",
				body: ["name", "scopes?", "allowedMailboxes?"],
			},
			{
				method: "DELETE",
				path: "/api/v1/settings/api-keys/:apiKeyId",
				auth: "Session Cookie",
				title: "Revoke API key",
				description: "Revokes an API key permanently.",
			},
		],
		examples: [
			{
				title: "Admin create API key",
				description: "Use this from a trusted admin environment to provision a transactional key for another service.",
				examples: [
					{
						language: "cURL",
						code: `curl -X POST "$BASE_URL/api/v1/settings/api-keys" \\
  -H "Content-Type: application/json" \\
  -H "Cookie: agentic_inbox_session=$SESSION_COOKIE" \\
  -d '{
    "name": "signup-service",
    "scopes": ["transactional:send"],
    "allowedMailboxes": ["noreply@example.com"]
  }'`,
					},
				],
			},
		],
	},
	{
		id: "operations",
		title: "Operations APIs",
		description:
			"These APIs power the operations console and campaign subsystem. They are best for list management, templates, scheduling, event telemetry, and webhook callbacks.",
		endpoints: [
			{ method: "GET", path: "/api/v1/operations/customers", auth: "Session Cookie", title: "List customers", description: "Supports query, status, tag, page, and limit." },
			{ method: "POST", path: "/api/v1/operations/customers", auth: "Session Cookie", title: "Create customer", description: "Creates a campaign recipient record.", body: ["email", "name?", "firstName?", "lastName?", "status?", "tags?", "metadata?"] },
			{ method: "GET", path: "/api/v1/operations/customers/:customerId", auth: "Session Cookie", title: "Get customer", description: "Returns a single customer." },
			{ method: "PUT", path: "/api/v1/operations/customers/:customerId", auth: "Session Cookie", title: "Update customer", description: "Updates lifecycle and segmentation fields.", body: ["email?", "name?", "firstName?", "lastName?", "status?", "tags?", "metadata?"] },
			{ method: "DELETE", path: "/api/v1/operations/customers/:customerId", auth: "Session Cookie", title: "Delete customer", description: "Deletes the customer and removes queued campaign recipient rows." },
			{ method: "GET", path: "/api/v1/operations/templates", auth: "Session Cookie", title: "List templates", description: "Lists all saved templates." },
			{ method: "POST", path: "/api/v1/operations/templates", auth: "Session Cookie", title: "Create template", description: "Creates a reusable subject/html/text template.", body: ["name", "description?", "subjectTemplate", "htmlTemplate", "textTemplate?", "previewData?"] },
			{ method: "GET", path: "/api/v1/operations/templates/:templateId", auth: "Session Cookie", title: "Get template", description: "Returns one template." },
			{ method: "PUT", path: "/api/v1/operations/templates/:templateId", auth: "Session Cookie", title: "Update template", description: "Updates a template.", body: ["name?", "description?", "subjectTemplate?", "htmlTemplate?", "textTemplate?", "previewData?"] },
			{ method: "DELETE", path: "/api/v1/operations/templates/:templateId", auth: "Session Cookie", title: "Delete template", description: "Deletes a template." },
			{ method: "POST", path: "/api/v1/operations/templates/preview", auth: "Session Cookie", title: "Render preview", description: "Renders a template with sample variables and optional tracking.", body: ["mailboxId", "templateId?", "customerId?", "subjectTemplate?", "htmlTemplate?", "textTemplate?", "previewData?", "trackOpens?", "trackClicks?"] },
			{ method: "GET", path: "/api/v1/operations/campaigns", auth: "Session Cookie", title: "List campaigns", description: "Returns all campaigns with live counters." },
			{ method: "POST", path: "/api/v1/operations/campaigns", auth: "Session Cookie", title: "Create campaign", description: "Creates a campaign draft.", body: ["name", "mailboxId", "templateId?", "subjectTemplate?", "htmlTemplate?", "textTemplate?", "audience?", "scheduledAt?", "throttlePerMinute?", "trackOpens?", "trackClicks?"] },
			{ method: "GET", path: "/api/v1/operations/campaigns/:campaignId", auth: "Session Cookie", title: "Get campaign", description: "Returns a campaign." },
			{ method: "PUT", path: "/api/v1/operations/campaigns/:campaignId", auth: "Session Cookie", title: "Update campaign", description: "Updates a campaign draft or scheduled send.", body: ["same fields as create"] },
			{ method: "POST", path: "/api/v1/operations/campaigns/:campaignId/start", auth: "Session Cookie", title: "Start / queue campaign", description: "Builds recipient rows and starts or schedules delivery.", body: ["scheduledAt?"] },
			{ method: "POST", path: "/api/v1/operations/campaigns/:campaignId/pause", auth: "Session Cookie", title: "Pause campaign", description: "Pauses queued sends." },
			{ method: "POST", path: "/api/v1/operations/campaigns/:campaignId/resume", auth: "Session Cookie", title: "Resume campaign", description: "Resumes paused sends." },
			{ method: "POST", path: "/api/v1/operations/campaigns/:campaignId/cancel", auth: "Session Cookie", title: "Cancel campaign", description: "Cancels unsent recipients." },
			{ method: "GET", path: "/api/v1/operations/campaigns/:campaignId/recipients", auth: "Session Cookie", title: "List campaign recipients", description: "Supports page and limit." },
			{ method: "GET", path: "/api/v1/operations/events", auth: "Session Cookie", title: "List events", description: "Supports campaignId, customerId, eventType, page, and limit." },
			{ method: "GET", path: "/api/v1/operations/webhooks", auth: "Session Cookie", title: "List webhooks", description: "Lists event callback subscriptions." },
			{ method: "POST", path: "/api/v1/operations/webhooks", auth: "Session Cookie", title: "Create webhook", description: "Creates a webhook subscription.", body: ["name", "url", "secret?", "eventTypes?", "enabled?"] },
			{ method: "PUT", path: "/api/v1/operations/webhooks/:webhookId", auth: "Session Cookie", title: "Update webhook", description: "Updates webhook config.", body: ["name?", "url?", "secret?", "eventTypes?", "enabled?"] },
			{ method: "DELETE", path: "/api/v1/operations/webhooks/:webhookId", auth: "Session Cookie", title: "Delete webhook", description: "Deletes a webhook subscription." },
			{ method: "POST", path: "/api/v1/operations/provider-receipts", auth: "Public", title: "Provider receipts", description: "Ingests delivery provider callbacks. Optional shared secret via x-operations-secret.", headers: ["x-operations-secret: <optional shared secret>"], body: ["campaignId?", "recipientId?", "customerId?", "mailboxId?", "email?", "eventType", "payload?"] },
		],
		examples: [
			{
				title: "Create and start a campaign",
				description: "This creates a scheduled campaign using a saved template and then queues it for delivery.",
				examples: [
					{
						language: "cURL",
						code: `# Create
curl -X POST "$BASE_URL/api/v1/operations/campaigns" \\
  -H "Content-Type: application/json" \\
  -H "Cookie: agentic_inbox_session=$SESSION_COOKIE" \\
  -d '{
    "name": "June welcome sequence",
    "mailboxId": "noreply@example.com",
    "templateId": "tpl_welcome_123",
    "audience": { "mode": "tag", "tag": "trial" },
    "scheduledAt": "2026-06-20T09:00:00.000Z",
    "throttlePerMinute": 20,
    "trackOpens": true,
    "trackClicks": true
  }'

# Start / queue
curl -X POST "$BASE_URL/api/v1/operations/campaigns/$CAMPAIGN_ID/start" \\
  -H "Content-Type: application/json" \\
  -H "Cookie: agentic_inbox_session=$SESSION_COOKIE" \\
  -d '{}'`,
					},
					{
						language: "JavaScript / TypeScript",
						code: `const create = await fetch(\`\${baseUrl}/api/v1/operations/campaigns\`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Cookie: \`agentic_inbox_session=\${sessionCookie}\`,
  },
  body: JSON.stringify({
    name: "June welcome sequence",
    mailboxId: "noreply@example.com",
    templateId: "tpl_welcome_123",
    audience: { mode: "tag", tag: "trial" },
    scheduledAt: "2026-06-20T09:00:00.000Z",
    throttlePerMinute: 20,
    trackOpens: true,
    trackClicks: true,
  }),
});

const campaign = await create.json();

await fetch(\`\${baseUrl}/api/v1/operations/campaigns/\${campaign.id}/start\`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Cookie: \`agentic_inbox_session=\${sessionCookie}\`,
  },
  body: JSON.stringify({}),
});`,
					},
				],
			},
		],
	},
	{
		id: "public",
		title: "Public Tracking And Recipient Routes",
		description:
			"These routes are intentionally public because they are triggered by email recipients and/or providers. They should not be used as admin APIs.",
		endpoints: [
			{ method: "GET", path: "/ops/open/:recipientId.gif", auth: "Public", title: "Open tracking pixel", description: "Marks a campaign recipient as opened and returns a 1x1 GIF." },
			{ method: "GET", path: "/ops/click/:recipientId?url=...", auth: "Public", title: "Tracked click redirect", description: "Records a click event and redirects to the target URL." },
			{ method: "GET", path: "/ops/unsubscribe/:token?customerId=...", auth: "Public", title: "Unsubscribe page", description: "Marks the customer unsubscribed and renders a simple confirmation page." },
		],
	},
	{
		id: "advanced",
		title: "Advanced Interfaces",
		description:
			"These integration surfaces are not part of the normal transactional/operations HTTP API, but they are still supported in the product.",
		endpoints: [
			{
				method: "POST/GET",
				path: "/mcp",
				auth: "Advanced",
				title: "MCP endpoint",
				description: "Model Context Protocol endpoint for tools such as Claude Code or Cursor. Use when integrating as an MCP server rather than plain REST.",
			},
			{
				method: "WS/HTTP",
				path: "/agents/*",
				auth: "Advanced",
				title: "Agent transport",
				description: "Used by the built-in EmailAgent UI for chat/agent workflows.",
			},
		],
	},
];

function copyText(value: string) {
	return navigator.clipboard.writeText(value);
}

function authBadgeVariant(auth: AuthMode): "primary" | "secondary" | "outline" {
	if (auth === "API Key") return "primary";
	if (auth === "Public") return "outline";
	return "secondary";
}

function SectionCard({ section, baseUrl }: { section: EndpointSection; baseUrl: string }) {
	return (
		<section id={section.id} className="rounded-xl border border-kumo-line bg-kumo-base p-5 scroll-mt-6">
			<div className="mb-5">
				<h2 className="text-xl font-semibold text-kumo-default">{section.title}</h2>
				<p className="mt-2 text-sm text-kumo-subtle max-w-3xl">{section.description}</p>
			</div>

			<div className="space-y-4">
				{section.endpoints.map((endpoint) => (
					<div key={`${endpoint.method}:${endpoint.path}`} className="rounded-lg border border-kumo-line bg-kumo-recessed p-4">
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant="primary">{endpoint.method}</Badge>
							<Badge variant={authBadgeVariant(endpoint.auth)}>{endpoint.auth}</Badge>
							<code className="rounded bg-kumo-base px-2 py-1 text-xs text-kumo-default">{endpoint.path}</code>
						</div>
						<div className="mt-3 text-sm font-semibold text-kumo-default">{endpoint.title}</div>
						<p className="mt-1 text-sm text-kumo-subtle">{endpoint.description}</p>
						{endpoint.headers && endpoint.headers.length > 0 && (
							<div className="mt-3 text-sm">
								<div className="font-medium text-kumo-strong">Headers</div>
								<ul className="mt-1 space-y-1 text-kumo-subtle">
									{endpoint.headers.map((header) => (
										<li key={header}><code>{header}</code></li>
									))}
								</ul>
							</div>
						)}
						{endpoint.query && endpoint.query.length > 0 && (
							<div className="mt-3 text-sm">
								<div className="font-medium text-kumo-strong">Query Params</div>
								<ul className="mt-1 space-y-1 text-kumo-subtle">
									{endpoint.query.map((query) => (
										<li key={query}><code>{query}</code></li>
									))}
								</ul>
							</div>
						)}
						{endpoint.body && endpoint.body.length > 0 && (
							<div className="mt-3 text-sm">
								<div className="font-medium text-kumo-strong">Body Fields</div>
								<ul className="mt-1 space-y-1 text-kumo-subtle">
									{endpoint.body.map((field) => (
										<li key={field}><code>{field}</code></li>
									))}
								</ul>
							</div>
						)}
					</div>
				))}
			</div>

			{section.examples && section.examples.length > 0 && (
				<div className="mt-6 space-y-5">
					{section.examples.map((group) => (
						<div key={group.title} className="rounded-lg border border-kumo-line bg-kumo-recessed p-4">
							<div className="text-base font-semibold text-kumo-default">{group.title}</div>
							<p className="mt-1 text-sm text-kumo-subtle">{group.description}</p>
							<div className="mt-4 space-y-4">
								{group.examples.map((example) => (
									<div key={example.language} className="rounded-md border border-kumo-line bg-kumo-base">
										<div className="flex items-center justify-between gap-3 border-b border-kumo-line px-3 py-2">
											<div className="text-sm font-medium text-kumo-default">{example.language}</div>
											<Button
												variant="ghost"
												size="sm"
												icon={<CopyIcon size={14} />}
												onClick={() => copyText(example.code)}
											>
												Copy
											</Button>
										</div>
										<pre className="overflow-x-auto p-3 text-xs text-kumo-strong whitespace-pre-wrap">
											{example.code.replaceAll("$BASE_URL", baseUrl)}
										</pre>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
			)}
		</section>
	);
}

export default function ApiDocsRoute() {
	const navigate = useNavigate();
	const [search, setSearch] = useState("");
	const { data: configData, isLoading } = useQuery({
		queryKey: queryKeys.config,
		queryFn: () => api.getConfig(),
		staleTime: Infinity,
	});

	const baseUrl = useMemo(() => {
		if (configData?.operationsBaseUrl) return configData.operationsBaseUrl;
		if (typeof window !== "undefined") return window.location.origin;
		return "https://your-agentic-inbox.example.com";
	}, [configData?.operationsBaseUrl]);

	const filteredSections = useMemo(() => {
		const needle = search.trim().toLowerCase();
		if (!needle) return endpointSections;
		return endpointSections
			.map((section) => ({
				...section,
				endpoints: section.endpoints.filter((endpoint) =>
					[
						endpoint.method,
						endpoint.path,
						endpoint.title,
						endpoint.description,
						endpoint.auth,
						...(endpoint.headers || []),
						...(endpoint.body || []),
						...(endpoint.query || []),
					].join(" ").toLowerCase().includes(needle),
				),
				examples: section.examples,
			}))
			.filter((section) => section.endpoints.length > 0);
	}, [search]);

	return (
		<div className="min-h-screen bg-kumo-recessed">
			<div className="mx-auto max-w-7xl px-4 py-8 md:px-6 md:py-12">
				<div className="mb-8 flex items-start justify-between gap-4">
					<div className="max-w-3xl">
						<Button variant="ghost" size="sm" icon={<ArrowLeftIcon size={16} />} onClick={() => navigate("/")}>
							Back
						</Button>
						<div className="mt-4 flex items-center gap-3">
							<BookOpenIcon size={24} className="text-kumo-subtle" />
							<h1 className="text-2xl font-bold text-kumo-default">API Docs</h1>
						</div>
						<p className="mt-3 text-sm text-kumo-subtle">
							Complete reference for Agentic Inbox HTTP APIs, including mailbox operations, transactional send, operations automation, API key management, and public tracking routes.
						</p>
						<div className="mt-3 rounded-lg border border-kumo-line bg-kumo-base p-4 text-sm text-kumo-subtle">
							<div className="font-medium text-kumo-strong">Resolved base URL</div>
							<code className="mt-2 block text-xs">{baseUrl}</code>
						</div>
					</div>
					<div className="w-full max-w-sm">
						<Input
							label="Search APIs"
							placeholder="Search by path, auth mode, or field"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
						/>
					</div>
				</div>

				<div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
					<aside className="h-fit rounded-xl border border-kumo-line bg-kumo-base p-4 lg:sticky lg:top-6">
						<div className="text-sm font-semibold text-kumo-default">On this page</div>
						<nav className="mt-3 space-y-2">
							{endpointSections.map((section) => (
								<a
									key={section.id}
									href={`#${section.id}`}
									className="block rounded-md px-3 py-2 text-sm text-kumo-strong hover:bg-kumo-tint"
								>
									{section.title}
								</a>
							))}
						</nav>
					</aside>

					<div className="space-y-6">
						{isLoading ? (
							<div className="flex justify-center py-20"><Loader size="lg" /></div>
						) : filteredSections.length > 0 ? (
							filteredSections.map((section) => (
								<SectionCard key={section.id} section={section} baseUrl={baseUrl} />
							))
						) : (
							<div className="rounded-xl border border-kumo-line bg-kumo-base p-8 text-sm text-kumo-subtle">
								No API endpoints matched <code>{search}</code>.
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
