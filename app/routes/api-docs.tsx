// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Input, Loader } from "@cloudflare/kumo";
import { ArrowLeftIcon, BookOpenIcon, CopyIcon } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { API_KEY_ENDPOINTS, API_KEY_SCOPES, API_KEY_SCOPE_DETAILS, getApiKeyEndpoint } from "shared/api-permissions";
import { OUTBOUND_SEND_SOURCES, OUTBOUND_SEND_STATUSES } from "shared/outbound-logs";
import api from "~/services/api";
import { queryKeys } from "~/queries/keys";

type AuthMode = "Session Cookie" | "Admin Session Cookie" | "API Key" | "Public";

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

const mailboxKeyCreationJson = JSON.stringify({
	name: "mailbox-service",
	scopes: [...new Set(API_KEY_ENDPOINTS.filter((endpoint) => endpoint.mailboxRule !== "body").map((endpoint) => endpoint.scope))],
	allowedMailboxes: ["noreply@example.com"],
}, null, 2);

const endpointSections: EndpointSection[] = [
	{
		id: "auth",
		title: "Auth Modes",
		description:
			"Use a signed session cookie for the application and admin APIs, a scoped API key for supported mailbox and transactional APIs, or no application credentials for explicitly public routes. API keys never grant admin, UI, or MCP access; existing session roles and mailbox permissions are unchanged.",
		endpoints: [
			{
				method: "GET",
				path: "/api/v1/auth/bootstrap-status",
				auth: "Public",
				title: "Get bootstrap status",
				description: "Returns whether the first administrator still needs to be created.",
			},
			{
				method: "POST",
				path: "/api/v1/auth/bootstrap-admin",
				auth: "Public",
				title: "Create the first administrator",
				description: "Available only before any users exist. Creates the first admin and sets a session cookie.",
				body: ["email", "name", "password (at least 12 characters)"],
			},
			{
				method: "POST",
				path: "/api/v1/auth/login",
				auth: "Public",
				title: "Log in",
				description: "Validates local user credentials and sets the signed agentic_inbox_session cookie.",
				body: ["email", "password"],
			},
			{
				method: "POST",
				path: "/api/v1/auth/logout",
				auth: "Public",
				title: "Log out",
				description: "Revokes the session cookie when supplied and clears it. Safe to call without a session; API keys do not establish a session.",
				headers: ["Cookie: agentic_inbox_session=<session-token> (optional)"],
			},
			{
				method: "GET",
				path: "/api/v1/auth/session",
				auth: "Public",
				title: "Get current session",
				description: "Returns the cookie-authenticated user, or { user: null } when no valid session exists. API keys do not establish a session.",
				headers: ["Cookie: agentic_inbox_session=<session-token> (optional)"],
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
				description: "Returns accessible provisioned mailboxes with inbox unread counts. Session membership or the API key mailbox whitelist filters the result.",
			},
			{
				method: "POST",
				path: "/api/v1/mailboxes",
				auth: "Admin Session Cookie",
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
				description: "Updates mailbox-level settings such as fromName and agent prompt. Requires a mailbox owner or global admin session.",
				body: ["settings"],
			},
			{
				method: "DELETE",
				path: "/api/v1/mailboxes/:mailboxId",
				auth: "Admin Session Cookie",
				title: "Delete mailbox",
				description: "Deletes the mailbox config. Existing email cleanup is not fully destructive yet.",
			},
		],
		examples: [
			{
				title: "List allowed mailboxes",
				description: `Requires ${getApiKeyEndpoint("GET", "/api/v1/mailboxes")?.scope}. The response is an array filtered by the key's mailbox whitelist. Define BASE_URL/baseUrl/base_url and load your key from server-side environment variables.`,
				examples: [
					{ language: "cURL", code: `curl --fail-with-body "$BASE_URL/api/v1/mailboxes" \\
  -H "X-Agentic-Inbox-Api-Key: $AGENTIC_INBOX_API_KEY"` },
					{ language: "Node.js", code: `const response = await fetch(\`\${baseUrl}/api/v1/mailboxes\`, {
  headers: { Authorization: \`Bearer \${process.env.AGENTIC_INBOX_API_KEY}\` },
});
if (!response.ok) throw new Error(\`HTTP \${response.status}: \${await response.text()}\`);
const mailboxes = await response.json();
console.log(mailboxes);` },
					{ language: "Python", code: `import os
import requests

api_key = os.environ["AGENTIC_INBOX_API_KEY"]
response = requests.get(
    f"{base_url}/api/v1/mailboxes",
    headers={"Authorization": f"Bearer {api_key}"},
)
response.raise_for_status()
mailboxes = response.json()
print(mailboxes)` },
				],
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
				description: "Lists mailbox emails with pagination and sorting. With folder, returns { emails, totalCount }; without folder, returns an email array. Read scopes cover all existing email folders, including Drafts; saving drafts remains session-only.",
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
				description: "Returns a full email record with attachments, including existing draft records when the key has the required read scope.",
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
				title: "Page through emails and read a message",
				description: `Requires ${getApiKeyEndpoint("GET", "/api/v1/mailboxes/:mailboxId/emails")?.scope} and a whitelisted mailbox. Pages are 1-based. Specifying folder=inbox returns { emails, totalCount }; use the record's id for detail, reply, and forward paths. URL-encode mailbox addresses and IDs.`,
				examples: [
					{ language: "cURL", code: `# First page; request page=2 for the next page.
curl --fail-with-body "$BASE_URL/api/v1/mailboxes/noreply%40example.com/emails?folder=inbox&page=1&limit=20" \\
  -H "Authorization: Bearer $AGENTIC_INBOX_API_KEY"

# EMAIL_ID_URL_ENCODED is a URL-encoded id from the response's emails array.
curl --fail-with-body "$BASE_URL/api/v1/mailboxes/noreply%40example.com/emails/$EMAIL_ID_URL_ENCODED" \\
  -H "Authorization: Bearer $AGENTIC_INBOX_API_KEY"` },
					{ language: "Node.js", code: `const mailboxUrl = \`\${baseUrl}/api/v1/mailboxes/\${encodeURIComponent("noreply@example.com")}\`;
const headers = { Authorization: \`Bearer \${process.env.AGENTIC_INBOX_API_KEY}\` };
async function getJson(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(\`HTTP \${response.status}: \${await response.text()}\`);
  return response.json();
}
for (let page = 1; ; page++) {
  const { emails, totalCount } = await getJson(\`\${mailboxUrl}/emails?folder=inbox&page=\${page}&limit=20\`);
  for (const email of emails) {
    const detail = await getJson(\`\${mailboxUrl}/emails/\${encodeURIComponent(email.id)}\`);
    console.log(detail);
  }
  if (emails.length === 0 || page * 20 >= totalCount) break;
}` },
					{ language: "Python", code: `import os
from urllib.parse import quote
import requests

mailbox_url = f"{base_url}/api/v1/mailboxes/{quote('noreply@example.com', safe='')}"
headers = {"Authorization": f"Bearer {os.environ['AGENTIC_INBOX_API_KEY']}"}
page = 1
while True:
    response = requests.get(f"{mailbox_url}/emails", headers=headers,
                            params={"folder": "inbox", "page": page, "limit": 20})
    response.raise_for_status()
    result = response.json()
    for email in result["emails"]:
        detail = requests.get(f"{mailbox_url}/emails/{quote(email['id'], safe='')}", headers=headers)
        detail.raise_for_status()
        print(detail.json())
    if not result["emails"] or page * 20 >= result["totalCount"]:
        break
    page += 1` },
				],
			},
			{
				title: "Send, reply, and forward with an API key",
				description: `Requires ${getApiKeyEndpoint("POST", "/api/v1/mailboxes/:mailboxId/emails")?.scope} and a whitelisted mailbox. Use an existing email ID for reply/forward. These sends do not grant separate read/star/thread-read or draft mutation access. API key replies do not mark threads read; session-cookie sends retain existing editor/admin permissions and reply behavior.`,
				examples: [
					{
						language: "cURL",
						code: `curl --fail-with-body -X POST "$BASE_URL/api/v1/mailboxes/noreply%40example.com/emails" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer $AGENTIC_INBOX_API_KEY" \\
  -d '{
    "to": "user@example.com",
    "from": { "email": "noreply@example.com", "name": "Example App" },
    "subject": "Welcome",
    "html": "<p>Welcome to Example App.</p>",
    "text": "Welcome to Example App."
  }'

# EMAIL_ID_URL_ENCODED is an existing, URL-encoded email id.
curl --fail-with-body -X POST "$BASE_URL/api/v1/mailboxes/noreply%40example.com/emails/$EMAIL_ID_URL_ENCODED/reply" \\
  -H "Authorization: Bearer $AGENTIC_INBOX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"to":"user@example.com","from":"noreply@example.com","subject":"Re: Welcome","text":"Thanks for your message."}'

curl --fail-with-body -X POST "$BASE_URL/api/v1/mailboxes/noreply%40example.com/emails/$EMAIL_ID_URL_ENCODED/forward" \\
  -H "Authorization: Bearer $AGENTIC_INBOX_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"to":"colleague@example.com","from":"noreply@example.com","subject":"Fwd: Welcome","text":"Sharing this message."}'`,
					},
					{
						language: "Node.js",
						code: `const mailboxUrl = \`\${baseUrl}/api/v1/mailboxes/\${encodeURIComponent("noreply@example.com")}\`;
const emailId = "existing-email-id"; // Replace with a real email id.
async function send(path, to, subject, text) {
  const response = await fetch(\`\${mailboxUrl}/emails\${path}\`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: \`Bearer \${process.env.AGENTIC_INBOX_API_KEY}\`,
    },
    body: JSON.stringify({
      to,
      from: { email: "noreply@example.com", name: "Example App" },
      subject,
      text,
    }),
  });
  if (!response.ok) throw new Error(\`HTTP \${response.status}: \${await response.text()}\`);
  return response.json();
}
await send("", "user@example.com", "Welcome", "Welcome to Example App.");
await send(\`/\${encodeURIComponent(emailId)}/reply\`, "user@example.com", "Re: Welcome", "Thanks for your message.");
await send(\`/\${encodeURIComponent(emailId)}/forward\`, "colleague@example.com", "Fwd: Welcome", "Sharing this message.");`,
					},
					{
						language: "Python",
						code: `import os
from urllib.parse import quote
import requests

mailbox_url = f"{base_url}/api/v1/mailboxes/{quote('noreply@example.com', safe='')}"
email_id = "existing-email-id"  # Replace with a real email id.
headers = {"Authorization": f"Bearer {os.environ['AGENTIC_INBOX_API_KEY']}"}
for path, recipient, subject, body in [
    ("", "user@example.com", "Welcome", "Welcome to Example App."),
    (f"/{quote(email_id, safe='')}/reply", "user@example.com", "Re: Welcome", "Thanks for your message."),
    (f"/{quote(email_id, safe='')}/forward", "colleague@example.com", "Fwd: Welcome", "Sharing this message."),
]:
    response = requests.post(
        f"{mailbox_url}/emails{path}", headers=headers,
        json={"to": recipient, "from": "noreply@example.com", "subject": subject, "text": body},
    )
    response.raise_for_status()
    print(response.json())`,
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
				description: "Sends a single transactional email using an API key. Supports inline content or a saved template, attachments, and optional open/click tracking. Preserves legacy authentication: missing, invalid, or revoked keys, insufficient scope, and an out-of-whitelist mailbox all return 401, not the mailbox API's permission-denied 403.",
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
				auth: "Admin Session Cookie",
				title: "List API keys",
				description: "Returns API key metadata, prefixes, scopes, mailbox allowlists, and last-used timestamps.",
			},
			{
				method: "POST",
				path: "/api/v1/settings/api-keys",
				auth: "Admin Session Cookie",
				title: "Create API key",
				description: "Creates a new machine key. Supply a nonempty array of supported scopes; unknown scopes and an empty selection are rejected. Omitting scopes preserves the transactional-send default. An omitted or empty allowedMailboxes array permits all existing mailboxes within the selected scopes. The full secret is returned only once.",
				body: ["name", "scopes?", "allowedMailboxes?"],
			},
			{
				method: "DELETE",
				path: "/api/v1/settings/api-keys/:apiKeyId",
				auth: "Admin Session Cookie",
				title: "Revoke API key",
				description: "Revokes an API key permanently.",
			},
			{ method: "GET", path: "/api/v1/settings/users", auth: "Admin Session Cookie", title: "List users", description: "Returns local users and mailbox memberships." },
			{ method: "POST", path: "/api/v1/settings/users", auth: "Admin Session Cookie", title: "Create user", description: "Creates a local user.", body: ["email", "name", "password (at least 12 characters)", "globalRole? (admin | member)", "status? (active | disabled)"] },
			{ method: "PUT", path: "/api/v1/settings/users/:userId", auth: "Admin Session Cookie", title: "Update user", description: "Updates a user's name, password, global role, or status.", body: ["name?", "password?", "globalRole?", "status?"] },
			{ method: "PUT", path: "/api/v1/settings/users/:userId/memberships", auth: "Admin Session Cookie", title: "Grant mailbox access", description: "Sets the user's mailbox role. The body userId must match the path.", body: ["userId", "mailboxId", "role (viewer | editor | owner)"] },
			{ method: "DELETE", path: "/api/v1/settings/users/:userId/memberships/:mailboxId", auth: "Admin Session Cookie", title: "Remove mailbox access", description: "Removes the user's mailbox membership." },
		],
		examples: [
			{
				title: "Admin create API key",
				description: "Use a global admin session to provision a transactional-only key. Existing transactional credentials and payloads remain compatible; mailbox scopes are opt-in.",
				examples: [
					{
						language: "cURL",
						code: `curl -X POST "$BASE_URL/api/v1/settings/api-keys" \\
  -H "Content-Type: application/json" \\
  -H "Cookie: agentic_inbox_session=$SESSION_COOKIE" \\
  -d '{
    "name": "signup-service",
    "scopes": ${JSON.stringify([getApiKeyEndpoint("POST", "/api/v1/transactional/send")?.scope])},
    "allowedMailboxes": ["noreply@example.com"]
  }'`,
					},
				],
			},
			{
				title: "Admin create a mailbox API key",
				description: "This example selects the registry's mailbox read/send scopes, not transactional sending. Remove any scopes the service does not need; at least one supported scope is required. Only a global admin session can create keys. An API key cannot create another key, even with every scope selected. Use allowedMailboxes: [] only when all existing mailboxes should be accessible within those scopes.",
				examples: [
					{ language: "JSON", code: mailboxKeyCreationJson },
					{ language: "cURL", code: `curl --fail-with-body -X POST "$BASE_URL/api/v1/settings/api-keys" \\
  -H "Cookie: agentic_inbox_session=$SESSION_COOKIE" \\
  -H "Content-Type: application/json" \\
  -d '${mailboxKeyCreationJson}'` },
					{ language: "Node.js", code: `const response = await fetch(\`\${baseUrl}/api/v1/settings/api-keys\`, {
  method: "POST",
  headers: {
    Cookie: \`agentic_inbox_session=\${process.env.AGENTIC_INBOX_ADMIN_SESSION}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${mailboxKeyCreationJson}),
});
if (!response.ok) throw new Error(\`HTTP \${response.status}: \${await response.text()}\`);
const created = await response.json();
// Store created.apiKey securely now; it is returned only once. Do not log it.` },
					{ language: "Python", code: `import os
import requests

response = requests.post(
    f"{base_url}/api/v1/settings/api-keys",
    headers={"Cookie": f"agentic_inbox_session={os.environ['AGENTIC_INBOX_ADMIN_SESSION']}"},
    json=${mailboxKeyCreationJson},
)
response.raise_for_status()
created = response.json()
# Store created["apiKey"] securely now; it is returned only once. Do not log it.` },
				],
			},
		],
	},
	{
		id: "operations",
		title: "Operations APIs",
		description:
			"Operations management requires a global admin session, not an API key. These APIs manage customers, templates, campaigns, telemetry, and webhooks. The provider-receipts callback is the explicitly public exception, with optional shared-secret protection.",
		endpoints: [
			{ method: "GET", path: "/api/v1/operations/customers", auth: "Admin Session Cookie", title: "List customers", description: "Supports query, status, tag, page, and limit." },
			{ method: "POST", path: "/api/v1/operations/customers", auth: "Admin Session Cookie", title: "Create customer", description: "Creates a campaign recipient record.", body: ["email", "name?", "firstName?", "lastName?", "status?", "tags?", "metadata?"] },
			{ method: "GET", path: "/api/v1/operations/customers/:customerId", auth: "Admin Session Cookie", title: "Get customer", description: "Returns a single customer." },
			{ method: "PUT", path: "/api/v1/operations/customers/:customerId", auth: "Admin Session Cookie", title: "Update customer", description: "Updates lifecycle and segmentation fields.", body: ["email?", "name?", "firstName?", "lastName?", "status?", "tags?", "metadata?"] },
			{ method: "DELETE", path: "/api/v1/operations/customers/:customerId", auth: "Admin Session Cookie", title: "Delete customer", description: "Deletes the customer and removes queued campaign recipient rows." },
			{ method: "GET", path: "/api/v1/operations/templates", auth: "Admin Session Cookie", title: "List templates", description: "Lists all saved templates." },
			{ method: "POST", path: "/api/v1/operations/templates", auth: "Admin Session Cookie", title: "Create template", description: "Creates a reusable subject/html/text template.", body: ["name", "description?", "subjectTemplate", "htmlTemplate", "textTemplate?", "previewData?"] },
			{ method: "GET", path: "/api/v1/operations/templates/:templateId", auth: "Admin Session Cookie", title: "Get template", description: "Returns one template." },
			{ method: "PUT", path: "/api/v1/operations/templates/:templateId", auth: "Admin Session Cookie", title: "Update template", description: "Updates a template.", body: ["name?", "description?", "subjectTemplate?", "htmlTemplate?", "textTemplate?", "previewData?"] },
			{ method: "DELETE", path: "/api/v1/operations/templates/:templateId", auth: "Admin Session Cookie", title: "Delete template", description: "Deletes a template." },
			{ method: "POST", path: "/api/v1/operations/templates/preview", auth: "Admin Session Cookie", title: "Render preview", description: "Renders a template with sample variables and optional tracking.", body: ["mailboxId", "templateId?", "customerId?", "subjectTemplate?", "htmlTemplate?", "textTemplate?", "previewData?", "trackOpens?", "trackClicks?"] },
			{ method: "GET", path: "/api/v1/operations/campaigns", auth: "Admin Session Cookie", title: "List campaigns", description: "Returns all campaigns with live counters." },
			{ method: "POST", path: "/api/v1/operations/campaigns", auth: "Admin Session Cookie", title: "Create campaign", description: "Creates a campaign draft.", body: ["name", "mailboxId", "templateId?", "subjectTemplate?", "htmlTemplate?", "textTemplate?", "audience?", "scheduledAt?", "throttlePerMinute?", "trackOpens?", "trackClicks?"] },
			{ method: "GET", path: "/api/v1/operations/campaigns/:campaignId", auth: "Admin Session Cookie", title: "Get campaign", description: "Returns a campaign." },
			{ method: "PUT", path: "/api/v1/operations/campaigns/:campaignId", auth: "Admin Session Cookie", title: "Update campaign", description: "Updates a campaign draft or scheduled send.", body: ["same fields as create"] },
			{ method: "POST", path: "/api/v1/operations/campaigns/:campaignId/start", auth: "Admin Session Cookie", title: "Start / queue campaign", description: "Builds recipient rows and starts or schedules delivery.", body: ["scheduledAt?"] },
			{ method: "POST", path: "/api/v1/operations/campaigns/:campaignId/pause", auth: "Admin Session Cookie", title: "Pause campaign", description: "Pauses queued sends." },
			{ method: "POST", path: "/api/v1/operations/campaigns/:campaignId/resume", auth: "Admin Session Cookie", title: "Resume campaign", description: "Resumes paused sends." },
			{ method: "POST", path: "/api/v1/operations/campaigns/:campaignId/cancel", auth: "Admin Session Cookie", title: "Cancel campaign", description: "Cancels unsent recipients." },
			{ method: "GET", path: "/api/v1/operations/campaigns/:campaignId/recipients", auth: "Admin Session Cookie", title: "List campaign recipients", description: "Supports page and limit." },
			{ method: "GET", path: "/api/v1/operations/events", auth: "Admin Session Cookie", title: "List events", description: "Supports campaignId, customerId, eventType, page, and limit." },
			{
				method: "GET",
				path: "/api/v1/operations/send-logs",
				auth: "Admin Session Cookie",
				title: "List outbound send logs",
				description: "Returns { logs, totalCount } for outbound send attempts recorded since rollout, newest first. Each log includes the internal message ID, mailbox ID, source, To/Cc/Bcc recipients, status, start and completion times, provider message ID, and error code. No subject or body is returned. Accepted means the provider accepted the send, not that it was delivered. Pending means the outcome is not confirmed.",
				query: [
					"mailboxId? (email address; exact, case-insensitive match)",
					`status? (${OUTBOUND_SEND_STATUSES.join(" | ")})`,
					`source? (${OUTBOUND_SEND_SOURCES.join(" | ")})`,
					"page? (integer 1-1,000,000, default 1)",
					"limit? (integer 1-100, default 50)",
				],
			},
			{ method: "GET", path: "/api/v1/operations/webhooks", auth: "Admin Session Cookie", title: "List webhooks", description: "Lists event callback subscriptions." },
			{ method: "POST", path: "/api/v1/operations/webhooks", auth: "Admin Session Cookie", title: "Create webhook", description: "Creates a webhook subscription.", body: ["name", "url", "secret?", "eventTypes?", "enabled?"] },
			{ method: "PUT", path: "/api/v1/operations/webhooks/:webhookId", auth: "Admin Session Cookie", title: "Update webhook", description: "Updates webhook config.", body: ["name?", "url?", "secret?", "eventTypes?", "enabled?"] },
			{ method: "DELETE", path: "/api/v1/operations/webhooks/:webhookId", auth: "Admin Session Cookie", title: "Delete webhook", description: "Deletes a webhook subscription." },
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
				auth: "Session Cookie",
				title: "MCP endpoint",
				description: "Model Context Protocol endpoint for tools such as Claude Code or Cursor. Requires a session with the existing mailbox permissions; managed API keys cannot authenticate to MCP.",
			},
			{
				method: "WS/HTTP",
				path: "/agents/*",
				auth: "Session Cookie",
				title: "Agent transport",
				description: "Used by the built-in EmailAgent UI for chat/agent workflows. Session-only; managed API keys cannot authenticate to the UI or agent transport.",
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

const mailboxWhitelistRules = {
	list: "An empty allowedMailboxes whitelist includes all existing mailboxes. A nonempty whitelist filters the listing to those mailboxes only.",
	path: "An empty allowedMailboxes whitelist permits all existing mailboxes. Otherwise :mailboxId in the path must be whitelisted; other mailboxes return 403.",
	body: "An empty allowedMailboxes whitelist permits all existing mailboxes. Otherwise mailboxId in the JSON body must be whitelisted. This legacy transactional endpoint returns 401 for an out-of-whitelist mailbox or insufficient scope (not 403).",
} satisfies Record<(typeof API_KEY_ENDPOINTS)[number]["mailboxRule"], string>;

function getEndpointAccess(endpoint: EndpointDoc) {
	const keyEndpoint = getApiKeyEndpoint(endpoint.method, endpoint.path);
	return {
		auth: keyEndpoint
			? endpoint.auth === "API Key" ? "API Key" : `${endpoint.auth} or API Key`
			: endpoint.auth === "API Key" ? "Unavailable (API keys not supported)" : endpoint.auth,
		scope: keyEndpoint?.scope,
		whitelist: keyEndpoint
			? mailboxWhitelistRules[keyEndpoint.mailboxRule]
			: endpoint.auth === "Public"
				? "N/A - public route; no API key mailbox authorization."
				: "N/A - API keys are not accepted. Existing session roles and mailbox permissions apply.",
	};
}

function SectionCard({ section, baseUrl }: { section: EndpointSection; baseUrl: string }) {
	return (
		<section id={section.id} className="rounded-xl border border-kumo-line bg-kumo-base p-5 scroll-mt-6">
			<div className="mb-5">
				<h2 className="text-xl font-semibold text-kumo-default">{section.title}</h2>
				<p className="mt-2 text-sm text-kumo-subtle max-w-3xl">{section.description}</p>
			</div>
			{section.id === "auth" && (
				<div className="mb-5 space-y-3 rounded-lg border border-kumo-line bg-kumo-recessed p-4 text-sm text-kumo-subtle">
					<p>Session authentication: <code>Cookie: agentic_inbox_session=&lt;session-token&gt;</code>. Admin Session Cookie additionally requires the global admin role. Session mutations retain same-origin protections.</p>
					<p>API key authentication: <code>Authorization: Bearer &lt;api-key&gt;</code> or <code>X-Agentic-Inbox-Api-Key: &lt;api-key&gt;</code>. Use one header, keep keys server-side, and never put a key in a URL or query parameter.</p>
					<p><strong className="text-kumo-strong">401:</strong> Missing required credentials, malformed, invalid, or revoked keys, or conflicting key headers. An explicitly supplied invalid key never falls back to a session cookie. The legacy transactional send endpoint also returns 401 for a valid key with insufficient scope or an out-of-whitelist body mailboxId.</p>
					<p><strong className="text-kumo-strong">403:</strong> On mailbox APIs, a valid key lacks the required scope or targets a mailbox outside its whitelist. A valid key calling a session-only endpoint also receives 403. The legacy transactional permission-denial exception above remains unchanged.</p>
					<p>An empty <code>allowedMailboxes</code> array permits all existing mailboxes, within the selected scopes. A nonempty whitelist filters mailbox listings and restricts every mailbox path and the transactional body <code>mailboxId</code>. Scopes are independent: sending does not grant reading or mailbox listing.</p>
					<p>API keys do not grant draft creation/update or management, read/star changes, thread-read mutations, deletion, moves, folder configuration, users, settings, Operations management, MCP, agent transport, or UI access. Email read scopes can read existing messages in any folder, including Drafts.</p>
					<ul className="space-y-2">
						{API_KEY_SCOPES.map((scope) => (
							<li key={scope}><code className="text-kumo-strong">{scope}</code> - {API_KEY_SCOPE_DETAILS[scope].description}</li>
						))}
					</ul>
				</div>
			)}

			<div className="space-y-4">
				{section.endpoints.map((endpoint) => {
					const access = getEndpointAccess(endpoint);
					return (
					<div key={`${endpoint.method}:${endpoint.path}`} data-api-endpoint={`${endpoint.method} ${endpoint.path}`} className="rounded-lg border border-kumo-line bg-kumo-recessed p-4">
						<div className="flex flex-wrap items-center gap-2">
							<Badge variant="primary">{endpoint.method}</Badge>
							<Badge variant={authBadgeVariant(access.scope ? "API Key" : endpoint.auth)}>{access.auth}</Badge>
							<code className="break-all rounded bg-kumo-base px-2 py-1 text-xs text-kumo-default">{endpoint.path}</code>
						</div>
						<div className="mt-3 text-sm font-semibold text-kumo-default">{endpoint.title}</div>
						<p className="mt-1 text-sm text-kumo-subtle">{endpoint.description}</p>
						<dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
							<div>
								<dt className="font-medium text-kumo-strong">Authentication</dt>
								<dd className="mt-1 text-kumo-subtle">{access.auth}</dd>
							</div>
							<div>
								<dt className="font-medium text-kumo-strong">Required API key scope</dt>
								<dd className="mt-1 text-kumo-subtle"><code>{access.scope || "N/A - API keys not supported"}</code></dd>
							</div>
							<div className="sm:col-span-2">
								<dt className="font-medium text-kumo-strong">Mailbox whitelist</dt>
								<dd className="mt-1 text-kumo-subtle">{access.whitelist}</dd>
							</div>
						</dl>
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
				);
				})}
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
						...Object.values(getEndpointAccess(endpoint)),
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
				<div className="mb-8 flex flex-col items-start justify-between gap-4 md:flex-row">
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
							placeholder="Search by path, scope, auth mode, or field"
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

					<div className="min-w-0 space-y-6">
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
