// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Banner, Button, Empty, Input, Loader, Pagination, Select } from "@cloudflare/kumo";
import { PaperPlaneTiltIcon } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";
import {
	OUTBOUND_SEND_SOURCES,
	OUTBOUND_SEND_STATUSES,
	type OutboundSendLog,
	type OutboundSendSource,
	type OutboundSendStatus,
} from "shared/outbound-logs";
import { useOperationsSendLogs } from "~/queries/operations";
import { ApiError } from "~/services/api";

const PAGE_SIZE = 50;

const SOURCE_LABELS: Record<OutboundSendSource, string> = {
	compose: "Compose",
	reply: "Reply",
	forward: "Forward",
	mcp_send: "MCP Send",
	mcp_reply: "MCP Reply",
	transactional: "Transactional",
	campaign: "Campaign",
};

const STATUS_DETAILS = {
	pending: { label: "Pending", variant: "outline" },
	accepted: { label: "Accepted", variant: "secondary" },
	failed: { label: "Failed", variant: "destructive" },
} as const satisfies Record<OutboundSendStatus, { label: string; variant: string }>;

const timestampFormat = new Intl.DateTimeFormat("en", {
	dateStyle: "medium",
	timeStyle: "medium",
	timeZone: "UTC",
});

function Timestamp({ value }: { value: string | null }) {
	return value ? <time dateTime={value}>{timestampFormat.format(new Date(value))}</time> : "Not recorded";
}

function LogField({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div>
			<dt className="text-xs font-semibold text-kumo-subtle">{label}</dt>
			<dd className="mt-0.5 text-sm text-kumo-default [overflow-wrap:anywhere]">{children}</dd>
		</div>
	);
}

function SendLogRow({ log }: { log: OutboundSendLog }) {
	const status = STATUS_DETAILS[log.status];
	return (
		<li className="px-4 py-4 sm:px-5">
			<div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
				<Badge variant={status.variant}>{status.label}</Badge>
				<span className="text-sm font-medium text-kumo-strong">{SOURCE_LABELS[log.source]}</span>
			</div>
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
				<dl className="space-y-2">
					<LogField label="Mailbox ID">{log.mailboxId}</LogField>
					<LogField label="To">{log.to.join(", ") || "None"}</LogField>
					<LogField label="Cc">{log.cc.join(", ") || "None"}</LogField>
					<LogField label="Bcc">{log.bcc.join(", ") || "None"}</LogField>
				</dl>
				<dl className="space-y-2">
					<LogField label="Started (UTC)"><Timestamp value={log.startedAt} /></LogField>
					<LogField label="Completed (UTC)"><Timestamp value={log.completedAt} /></LogField>
				</dl>
				<dl className="space-y-2">
					<LogField label="Internal message ID"><code>{log.id}</code></LogField>
					<LogField label="Provider message ID">{log.providerMessageId ? <code>{log.providerMessageId}</code> : "Not recorded"}</LogField>
					<LogField label="Error code">{log.errorCode ? <code>{log.errorCode}</code> : "None"}</LogField>
				</dl>
			</div>
		</li>
	);
}

export default function OperationsSendLogsRoute() {
	const [mailboxDraft, setMailboxDraft] = useState("");
	const [mailboxFilter, setMailboxFilter] = useState("");
	const [status, setStatus] = useState<OutboundSendStatus | "">("");
	const [source, setSource] = useState<OutboundSendSource | "">("");
	const [page, setPage] = useState(1);
	const { data, error, isPending, isError, refetch } = useOperationsSendLogs({
		...(mailboxFilter ? { mailboxId: mailboxFilter } : {}),
		...(status ? { status } : {}),
		...(source ? { source } : {}),
		page: String(page),
		limit: String(PAGE_SIZE),
	});
	const hasFilters = Boolean(mailboxFilter || status || source);
	const errorStatus = error instanceof ApiError ? error.status : undefined;

	return (
		<div className="space-y-5">
			<div>
				<h2 className="text-xl font-semibold text-kumo-default">Send Logs</h2>
				<p className="mt-1 text-sm text-kumo-subtle">
					Outbound send attempts, newest first. Only attempts made since send logging was enabled appear here.
				</p>
				<p className="mt-2 text-sm text-kumo-subtle">
					<strong>Accepted</strong> means the provider accepted the send, not that it was delivered. <strong>Pending</strong> means the outcome is not confirmed.
				</p>
			</div>

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))]">
				<form className="sm:col-span-2 lg:col-span-1" onSubmit={(event) => {
					event.preventDefault();
					setMailboxFilter(mailboxDraft.trim());
					setPage(1);
				}}>
					<div className="flex items-end gap-2">
						<div className="min-w-0 flex-1">
							<Input
								label="Mailbox ID"
								type="email"
								placeholder="Exact mailbox address"
								className="min-w-0 w-full"
								value={mailboxDraft}
								onChange={(event) => setMailboxDraft(event.target.value)}
							/>
						</div>
						<Button type="submit" variant="secondary">Apply</Button>
						<Button type="button" variant="ghost" disabled={!mailboxDraft && !mailboxFilter} onClick={() => {
							setMailboxDraft("");
							setMailboxFilter("");
							setPage(1);
						}}>Clear</Button>
					</div>
					{mailboxFilter && <p className="mt-1 text-xs text-kumo-subtle [overflow-wrap:anywhere]">Applied mailbox: {mailboxFilter}</p>}
				</form>
				<Select
					label="Status"
					className="w-full"
					value={status}
					renderValue={(value) => value ? STATUS_DETAILS[value].label : "All statuses"}
					onValueChange={(value) => {
						setStatus(value ?? "");
						setPage(1);
					}}
				>
					<Select.Option value="">All statuses</Select.Option>
					{OUTBOUND_SEND_STATUSES.map((value) => (
						<Select.Option key={value} value={value}>{STATUS_DETAILS[value].label}</Select.Option>
					))}
				</Select>
				<Select
					label="Source"
					className="w-full"
					value={source}
					renderValue={(value) => value ? SOURCE_LABELS[value] : "All sources"}
					onValueChange={(value) => {
						setSource(value ?? "");
						setPage(1);
					}}
				>
					<Select.Option value="">All sources</Select.Option>
					{OUTBOUND_SEND_SOURCES.map((value) => (
						<Select.Option key={value} value={value}>{SOURCE_LABELS[value]}</Select.Option>
					))}
				</Select>
			</div>

			{isPending ? (
				<div role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-kumo-subtle">
					<span aria-hidden="true"><Loader size="sm" /></span>
					Loading send logs...
				</div>
			) : isError ? (
				<div className="space-y-3">
					<div role="alert">
						<Banner variant="error" title="Could not load send logs" description={
							errorStatus === 401 || errorStatus === 403
								? "An active admin session is required to view send logs."
								: errorStatus === 400
									? "Check the filters and enter a complete mailbox address."
									: "Try again to reload the current results."
						} />
					</div>
					{errorStatus !== 400 && <Button variant="secondary" size="sm" onClick={() => void refetch()}>Retry</Button>}
				</div>
			) : data.logs.length > 0 ? (
				<div className="rounded-xl border border-kumo-line bg-kumo-base">
					<ul aria-label="Outbound send attempts" className="divide-y divide-kumo-line">
						{data.logs.map((log) => <SendLogRow key={log.id} log={log} />)}
					</ul>
					<div className="border-t border-kumo-line px-3 py-3">
						<Pagination page={page} setPage={setPage} perPage={PAGE_SIZE} totalCount={data.totalCount} className="flex-wrap">
							<Pagination.Info className="text-sm" />
							{data.totalCount > PAGE_SIZE && <Pagination.Controls controls="simple" />}
						</Pagination>
					</div>
				</div>
			) : (
				<div role="status">
					<Empty
						icon={<PaperPlaneTiltIcon size={48} className="text-kumo-subtle" />}
						title={page > 1 ? "No send logs on this page" : hasFilters ? "No matching send logs" : "No send logs yet"}
						description={page > 1
							? "The results may have changed. Return to page 1 to see the latest matches."
							: hasFilters ? "Try changing or clearing the filters." : "New send attempts will appear here. Earlier attempts are not backfilled."}
						contents={page > 1 && <Button variant="secondary" size="sm" onClick={() => setPage(1)}>Back to page 1</Button>}
					/>
				</div>
			)}
		</div>
	);
}
