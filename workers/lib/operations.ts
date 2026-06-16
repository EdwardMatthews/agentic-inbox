// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { OperationsDO } from "../operations";
import type { Env } from "../types";

export function getOperationsStub(env: Env): DurableObjectStub<OperationsDO> {
	return env.OPERATIONS.get(env.OPERATIONS.idFromName("global"));
}

