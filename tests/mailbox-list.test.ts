import assert from "node:assert/strict";
import test from "node:test";
import { listMailboxes } from "../workers/lib/email-helpers";

test("mailbox listing follows R2 pagination instead of silently truncating at the first page", async () => {
	const requests: R2ListOptions[] = [];
	const bucket = {
		list: async (options: R2ListOptions) => {
			requests.push(options);
			return options.cursor
				? { objects: [{ key: "mailboxes/two@example.com.json" }], truncated: false }
				: { objects: [{ key: "mailboxes/one@example.com.json" }], truncated: true, cursor: "next" };
		},
	} as unknown as R2Bucket;
	assert.deepEqual(await listMailboxes(bucket), [
		{ id: "one@example.com", email: "one@example.com" },
		{ id: "two@example.com", email: "two@example.com" },
	]);
	assert.equal(requests.length, 2);
	assert.equal(requests[1].cursor, "next");
});
