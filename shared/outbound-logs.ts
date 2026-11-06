export const OUTBOUND_SEND_SOURCES = [
	"compose", "reply", "forward", "mcp_send", "mcp_reply", "transactional", "campaign",
] as const;
export const OUTBOUND_SEND_STATUSES = ["pending", "accepted", "failed"] as const;

export type OutboundSendSource = (typeof OUTBOUND_SEND_SOURCES)[number];
export type OutboundSendStatus = (typeof OUTBOUND_SEND_STATUSES)[number];

export interface OutboundSendLog {
	id: string;
	mailboxId: string;
	source: OutboundSendSource;
	to: string[];
	cc: string[];
	bcc: string[];
	status: OutboundSendStatus;
	startedAt: string;
	completedAt: string | null;
	providerMessageId: string | null;
	errorCode: string | null;
}

export interface OutboundSendLogPage {
	logs: OutboundSendLog[];
	totalCount: number;
}
