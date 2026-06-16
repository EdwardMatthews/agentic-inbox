// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Empty, Input, Loader, Pagination, Select } from "@cloudflare/kumo";
import { EnvelopeSimpleOpenIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useOperationsEvents } from "~/queries/operations";

const PAGE_SIZE = 50;

export default function OperationsEventsRoute() {
	const [campaignId, setCampaignId] = useState("");
	const [eventType, setEventType] = useState("");
	const [page, setPage] = useState(1);

	const params = useMemo(() => ({
		...(campaignId ? { campaignId } : {}),
		...(eventType ? { eventType } : {}),
		page: String(page),
		limit: String(PAGE_SIZE),
	}), [campaignId, eventType, page]);

	const { data, isLoading } = useOperationsEvents(params);

	return (
		<div className="space-y-5">
			<div>
				<h2 className="text-xl font-semibold text-kumo-default">Events</h2>
				<p className="text-sm text-kumo-subtle mt-1">
					Inspect send attempts, opens, clicks, unsubscribes, rate limiting, and callback ingestion.
				</p>
			</div>

			<div className="grid gap-3 md:grid-cols-2">
				<Input label="Campaign ID" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} />
				<Select
					label="Event type"
					value={eventType}
					onValueChange={(value) => setEventType(value || "")}
				>
					<Select.Option value="">All events</Select.Option>
					<Select.Option value="campaign_queued">campaign_queued</Select.Option>
					<Select.Option value="send_attempted">send_attempted</Select.Option>
					<Select.Option value="send_succeeded">send_succeeded</Select.Option>
					<Select.Option value="send_failed">send_failed</Select.Option>
					<Select.Option value="opened">opened</Select.Option>
					<Select.Option value="clicked">clicked</Select.Option>
					<Select.Option value="customer_unsubscribed">customer_unsubscribed</Select.Option>
				</Select>
			</div>

			{isLoading ? (
				<div className="flex justify-center py-16"><Loader size="lg" /></div>
			) : data && data.events.length > 0 ? (
				<div className="rounded-xl border border-kumo-line bg-kumo-base overflow-hidden">
					{data.events.map((event, idx) => (
						<div key={event.id} className={`grid gap-4 px-5 py-4 md:grid-cols-[180px_minmax(0,1fr)_240px] ${idx > 0 ? "border-t border-kumo-line" : ""}`}>
							<div>
								<div className="text-xs uppercase tracking-wider text-kumo-subtle font-semibold">Type</div>
								<div className="text-sm font-medium text-kumo-default mt-1">{event.event_type}</div>
							</div>
							<div className="min-w-0">
								<div className="text-xs uppercase tracking-wider text-kumo-subtle font-semibold">Payload</div>
								<pre className="mt-1 rounded bg-kumo-recessed p-3 text-xs overflow-x-auto whitespace-pre-wrap">
									{JSON.stringify(event.payload, null, 2)}
								</pre>
							</div>
							<div className="text-sm text-kumo-subtle">
								<div><span className="font-medium text-kumo-strong">Email:</span> {event.email || "-"}</div>
								<div className="mt-1"><span className="font-medium text-kumo-strong">Campaign:</span> {event.campaign_id || "-"}</div>
								<div className="mt-1"><span className="font-medium text-kumo-strong">Created:</span> {event.created_at}</div>
							</div>
						</div>
					))}
					{data.totalCount > PAGE_SIZE && (
						<div className="border-t border-kumo-line py-3 flex justify-center">
							<Pagination page={page} setPage={setPage} perPage={PAGE_SIZE} totalCount={data.totalCount} />
						</div>
					)}
				</div>
			) : (
				<Empty
					icon={<EnvelopeSimpleOpenIcon size={48} className="text-kumo-subtle" />}
					title="No events yet"
					description="Events will appear here once campaigns are queued or recipients start interacting with tracked emails."
				/>
			)}
		</div>
	);
}
