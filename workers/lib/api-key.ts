/**
 * Explicit credentials take precedence over a browser session. Conflicting
 * headers must never silently select the more privileged credential.
 */
export function hasApiKeyCredentials(request: Request) {
	return request.headers.has("authorization") || request.headers.has("x-agentic-inbox-api-key");
}

export function extractApiKey(request: Request): string | null {
	const direct = request.headers.get("x-agentic-inbox-api-key");
	const authorization = request.headers.get("authorization");
	const bearer = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
	if (authorization !== null && !bearer) return null;
	if (direct !== null && !direct.trim()) return null;
	if (direct !== null && bearer && direct.trim() !== bearer) return null;
	return direct?.trim() || bearer || null;
}
