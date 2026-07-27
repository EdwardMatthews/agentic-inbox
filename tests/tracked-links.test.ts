import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

const cloudflareWorkersStub = `
export class DurableObject {
	constructor(ctx, env) {
		this.ctx = ctx;
		this.env = env;
	}
}
`;

const loader = `
export async function resolve(specifier, context, nextResolve) {
	if (specifier === "cloudflare:workers") {
		return {
			shortCircuit: true,
			url: ${JSON.stringify(`data:text/javascript,${encodeURIComponent(cloudflareWorkersStub)}`)}
		};
	}
	return nextResolve(specifier, context);
}
`;

register(`data:text/javascript,${encodeURIComponent(loader)}`, import.meta.url);

const { rewriteTrackedLinks } = await import("../workers/operations/index");

function readHref(html: string): string {
	const match = html.match(/\bhref=(["'])(.*?)\1/i);
	assert.ok(match, "expected rewritten anchor to contain an href");
	return match[2]
		.replaceAll("&quot;", '"')
		.replaceAll("&#39;", "'")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&amp;", "&");
}

test("tracked React Email links preserve callbackURL as a real query parameter", () => {
	const verificationUrl =
		"https://minecraft.example/api/auth/verify-email?token=verify-token&amp;callbackURL=%2Femail-verification-result%3FreturnTo%3D%252Fcreate%253Fmode%253Dtext-to-video";
	const rewritten = rewriteTrackedLinks(
		`<a href="${verificationUrl}">Verify email</a>`,
		"https://inbox.example",
		"recipient-1",
	);

	const trackingUrl = new URL(readHref(rewritten));
	assert.equal(trackingUrl.pathname, "/ops/click/recipient-1");

	const targetUrl = new URL(trackingUrl.searchParams.get("url")!);
	assert.equal(targetUrl.searchParams.get("token"), "verify-token");
	assert.equal(
		targetUrl.searchParams.get("callbackURL"),
		"/email-verification-result?returnTo=%2Fcreate%3Fmode%3Dtext-to-video",
	);
	assert.equal(targetUrl.searchParams.has("amp;callbackURL"), false);
});

test("tracked href attributes escape generated markup without corrupting the target URL", () => {
	const rewritten = rewriteTrackedLinks(
		'<a href="https://example.com/path?one=1&amp;two=2">Open</a>',
		'https://inbox.example/"unsafe"',
		"recipient-2",
	);

	assert.doesNotMatch(rewritten, /href="[^"]*"unsafe"/);
	assert.match(rewritten, /&quot;unsafe&quot;/);

	const trackingUrl = new URL(readHref(rewritten));
	assert.equal(trackingUrl.searchParams.get("url"), "https://example.com/path?one=1&two=2");
});

test("non-tracked anchors remain unchanged after decoded scheme checks", () => {
	const fragment = '<a class="jump" href="&#35;details">Details</a>';
	const mailto = '<a href="MAILTO&#58;team@example.com">Email us</a>';

	assert.equal(rewriteTrackedLinks(fragment, "https://inbox.example", "recipient-3"), fragment);
	assert.equal(rewriteTrackedLinks(mailto, "https://inbox.example", "recipient-3"), mailto);
});
