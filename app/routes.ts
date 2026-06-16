// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import {
	index,
	type RouteConfig,
	route,
} from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("api-docs", "routes/api-docs.tsx"),
	route("settings", "routes/global-settings.tsx"),
	route("operations", "routes/operations.tsx", [
		index("routes/operations-index.tsx"),
		route("campaigns", "routes/operations-campaigns.tsx"),
		route("customers", "routes/operations-customers.tsx"),
		route("templates", "routes/operations-templates.tsx"),
		route("events", "routes/operations-events.tsx"),
		route("webhooks", "routes/operations-webhooks.tsx"),
	]),
	route("mailbox/:mailboxId", "routes/mailbox.tsx", [
		index("routes/mailbox-index.tsx"),
		route("emails/:folder", "routes/email-list.tsx"),
		route("settings", "routes/settings.tsx"),
		route("search", "routes/search-results.tsx"),
	]),
	route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
