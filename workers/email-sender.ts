// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Email sending via Cloudflare Email Service binding.
 *
 * Uses the `send_email` Worker binding (`env.EMAIL.send()`) to send emails.
 *
 * See: https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
 */

import type { OutboundSendLog } from "../shared/outbound-logs";
import { getOperationsStub } from "./lib/operations";
import type { Env } from "./types";

export interface SendEmailParams {
	to: string | string[];
	from: string | { email: string; name: string };
	subject: string;
	html?: string;
	text?: string;
	cc?: string | string[];
	bcc?: string | string[];
	replyTo?: string | { email: string; name: string };
	attachments?: {
		content: string; // base64 encoded
		filename: string;
		type: string;
		disposition: "attachment" | "inline";
		contentId?: string;
	}[];
	headers?: Record<string, string>;
}

type SendContext = Pick<OutboundSendLog, "id" | "mailboxId" | "source">;
type WriteLog = (entry: OutboundSendLog) => Promise<void>;

function logAddresses(addresses?: string | string[]): string[] {
	const list = typeof addresses === "string" ? [addresses] : addresses ?? [];
	return list.slice(0, 50).map((address) => address.slice(0, 254));
}

function errorCode(error: unknown): string {
	const code = typeof error === "object" && error && "code" in error ? error.code : null;
	return typeof code === "string" && /^E_[A-Z0-9_]{1,64}$/.test(code) ? code : "UNKNOWN";
}

/**
 * Record the provider attempt separately from the mailbox's Sent copy.
 */
export async function sendEmail(
	env: Env,
	params: SendEmailParams,
	context: SendContext,
	writeLog: WriteLog = (entry) => getOperationsStub(env).writeOutboundSendLog(entry),
): Promise<{ messageId: string }> {
	const message: Record<string, unknown> = {
		to: params.to,
		from: params.from,
		subject: params.subject,
	};

	if (params.html) message.html = params.html;
	if (params.text) message.text = params.text;
	if (params.cc) message.cc = params.cc;
	if (params.bcc) message.bcc = params.bcc;
	if (params.replyTo) message.replyTo = params.replyTo;

	if (params.headers && Object.keys(params.headers).length > 0) {
		message.headers = params.headers;
	}

	if (params.attachments && params.attachments.length > 0) {
		message.attachments = params.attachments.map((att) => ({
			content: att.content,
			filename: att.filename,
			type: att.type,
			disposition: att.disposition,
			...(att.contentId ? { contentId: att.contentId } : {}),
		}));
	}

	const entry: OutboundSendLog = {
		...context,
		mailboxId: context.mailboxId.toLowerCase(),
		to: logAddresses(params.to),
		cc: logAddresses(params.cc),
		bcc: logAddresses(params.bcc),
		status: "pending",
		startedAt: new Date().toISOString(),
		completedAt: null,
		providerMessageId: null,
		errorCode: null,
	};
	const persist = async (log: OutboundSendLog) => {
		try {
			await writeLog(log);
		} catch {
			// Logging must not turn an accepted send into a retryable error.
			console.warn("Outbound send log write failed", { id: log.id, source: log.source, status: log.status });
		}
	};

	await persist(entry);
	let providerMessageId: string;
	try {
		const result = await env.EMAIL.send(message as any);
		if (!result?.messageId) {
			throw Object.assign(new Error("Email provider did not return a message ID"), {
				code: "E_MISSING_PROVIDER_MESSAGE_ID",
			});
		}
		providerMessageId = result.messageId;
	} catch (error) {
		await persist({ ...entry, status: "failed", completedAt: new Date().toISOString(), errorCode: errorCode(error) });
		throw error;
	}
	await persist({
		...entry,
		status: "accepted",
		completedAt: new Date().toISOString(),
		providerMessageId,
	});
	return { messageId: providerMessageId };
}
