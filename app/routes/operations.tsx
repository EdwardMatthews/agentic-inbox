// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Button } from "@cloudflare/kumo";
import {
	ArrowsClockwiseIcon,
	BroadcastIcon,
	DatabaseIcon,
	EnvelopeSimpleOpenIcon,
	FilesIcon,
	HouseIcon,
	UsersIcon,
	WebhooksLogoIcon,
} from "@phosphor-icons/react";
import { NavLink, Outlet, useNavigate } from "react-router";

const NAV_ITEMS = [
	{ to: "/operations/campaigns", label: "Campaigns", icon: <BroadcastIcon size={16} /> },
	{ to: "/operations/customers", label: "Customers", icon: <UsersIcon size={16} /> },
	{ to: "/operations/templates", label: "Templates", icon: <FilesIcon size={16} /> },
	{ to: "/operations/events", label: "Events", icon: <EnvelopeSimpleOpenIcon size={16} /> },
	{ to: "/operations/webhooks", label: "Webhooks", icon: <WebhooksLogoIcon size={16} /> },
];

export default function OperationsRoute() {
	const navigate = useNavigate();

	return (
		<div className="flex min-h-screen bg-kumo-recessed">
			<aside className="flex min-h-screen w-72 shrink-0 flex-col border-r border-kumo-line bg-kumo-base">
				<div className="p-5 border-b border-kumo-line">
					<div className="flex items-center justify-between gap-3">
						<div>
							<div className="text-xs uppercase tracking-wider text-kumo-subtle font-semibold">
								Operations
							</div>
							<h1 className="text-xl font-semibold text-kumo-default mt-1">
								Email Ops
							</h1>
						</div>
						<DatabaseIcon size={20} className="text-kumo-subtle" />
					</div>
					<p className="text-sm text-kumo-subtle mt-3">
						Manage customers, templates, campaigns, scheduling, delivery events, and callbacks without affecting mailbox workflows.
					</p>
				</div>

				<div className="p-3 space-y-1">
					{NAV_ITEMS.map((item) => (
						<NavLink
							key={item.to}
							to={item.to}
							className={({ isActive }) =>
								`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
									isActive
										? "bg-kumo-fill text-kumo-default font-semibold"
										: "text-kumo-strong hover:bg-kumo-tint"
								}`
							}
						>
							<span className="shrink-0">{item.icon}</span>
							<span>{item.label}</span>
						</NavLink>
					))}
				</div>

				<div className="mt-auto p-3 border-t border-kumo-line">
					<div className="space-y-2">
						<Button
							variant="secondary"
							size="sm"
							className="w-full"
							onClick={() => navigate("/settings")}
						>
							Global Settings
						</Button>
						<Button
							variant="secondary"
							size="sm"
							className="w-full"
							icon={<HouseIcon size={16} />}
							onClick={() => navigate("/")}
						>
							Back to Mailboxes
						</Button>
					</div>
				</div>
			</aside>

			<div className="flex-1 min-w-0">
				<header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-kumo-line bg-kumo-base px-6 py-4">
					<div>
						<div className="text-sm font-medium text-kumo-default">
							Operations Console
						</div>
						<div className="text-xs text-kumo-subtle mt-0.5">
							Campaign scheduling, template rendering, customer lifecycle, and delivery telemetry
						</div>
					</div>
					<Button
						variant="ghost"
						size="sm"
						icon={<ArrowsClockwiseIcon size={16} />}
						onClick={() => window.location.reload()}
					>
						Refresh
					</Button>
				</header>
				<main className="p-6">
					<Outlet />
				</main>
			</div>
		</div>
	);
}
