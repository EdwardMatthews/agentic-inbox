// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export const SESSION_COOKIE_NAME = "agentic_inbox_session";
const PASSWORD_ITERATIONS = 310_000;
const PASSWORD_HASH_LENGTH = 32;
const PASSWORD_HASH_PREFIX = "pbkdf2_sha256";

export type GlobalRole = "admin" | "member";
export type UserStatus = "active" | "disabled";
export type MailboxRole = "viewer" | "editor" | "owner";

export interface AuthUser {
	id: string;
	email: string;
	name: string;
	globalRole: GlobalRole;
	status: UserStatus;
	createdAt: string;
	updatedAt: string;
	lastLoginAt: string | null;
}

export interface AuthSession {
	id: string;
	userId: string;
	expiresAt: string;
	createdAt: string;
	lastSeenAt: string | null;
	userAgent: string | null;
	ipAddress: string | null;
	revokedAt: string | null;
}

export interface AuthContext {
	method: "session" | "api_key";
	user: AuthUser | null;
	session: AuthSession | null;
	apiKeyId: string | null;
	allowedMailboxIds: string[] | null;
	scopes: string[];
}

export interface AuthVariables {
	auth: AuthContext;
}

export function nowIso() {
	return new Date().toISOString();
}

function bytesToBase64(bytes: Uint8Array) {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function base64ToBytes(value: string) {
	const binary = atob(value);
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function randomSecret(byteLength = 32) {
	const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function sha256(input: string): Promise<string> {
	const data = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		{ name: "PBKDF2" },
		false,
		["deriveBits"],
	);
	const derived = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			hash: "SHA-256",
			salt,
			iterations: PASSWORD_ITERATIONS,
		},
		keyMaterial,
		PASSWORD_HASH_LENGTH * 8,
	);
	const hashBytes = new Uint8Array(derived);
	return `${PASSWORD_HASH_PREFIX}$${PASSWORD_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hashBytes)}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
	const [scheme, iterationsText, saltBase64, hashBase64] = storedHash.split("$");
	if (scheme !== PASSWORD_HASH_PREFIX || !iterationsText || !saltBase64 || !hashBase64) {
		return false;
	}
	const iterations = Number(iterationsText);
	if (!Number.isFinite(iterations) || iterations <= 0) {
		return false;
	}

	const salt = base64ToBytes(saltBase64);
	const expectedHash = base64ToBytes(hashBase64);
	const keyMaterial = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(password),
		{ name: "PBKDF2" },
		false,
		["deriveBits"],
	);
	const derived = await crypto.subtle.deriveBits(
		{
			name: "PBKDF2",
			hash: "SHA-256",
			salt,
			iterations,
		},
		keyMaterial,
		expectedHash.byteLength * 8,
	);
	const actualHash = new Uint8Array(derived);
	if (actualHash.byteLength !== expectedHash.byteLength) return false;
	let diff = 0;
	for (let i = 0; i < actualHash.byteLength; i++) {
		diff |= actualHash[i] ^ expectedHash[i];
	}
	return diff === 0;
}

export async function createSessionRecord(options: {
	userId: string;
	userAgent?: string | null;
	ipAddress?: string | null;
	ttlDays?: number;
}) {
	const rawToken = randomSecret(32);
	const tokenHash = await sha256(rawToken);
	const createdAt = nowIso();
	const expiresAt = new Date(Date.now() + (options.ttlDays || 14) * 24 * 60 * 60 * 1000).toISOString();
	return {
		id: crypto.randomUUID(),
		rawToken,
		tokenHash,
		userId: options.userId,
		expiresAt,
		createdAt,
		lastSeenAt: createdAt,
		userAgent: options.userAgent || null,
		ipAddress: options.ipAddress || null,
	};
}

export function buildSessionCookie(sessionToken: string, expiresAt: string, secure = true) {
	const expires = new Date(expiresAt).toUTCString();
	return `${SESSION_COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Lax;${secure ? " Secure;" : ""} Expires=${expires}`;
}

export function buildClearedSessionCookie(secure = true) {
	return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax;${secure ? " Secure;" : ""} Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function getCookieValue(cookieHeader: string | null | undefined, name: string) {
	if (!cookieHeader) return null;
	const cookies = cookieHeader.split(";").map((part) => part.trim());
	for (const cookie of cookies) {
		const [cookieName, ...rest] = cookie.split("=");
		if (cookieName === name) {
			return rest.join("=") || null;
		}
	}
	return null;
}

export function extractSessionToken(request: Request) {
	return getCookieValue(request.headers.get("cookie"), SESSION_COOKIE_NAME);
}

export function wantsHtml(request: Request) {
	const accept = request.headers.get("accept") || "";
	return accept.includes("text/html");
}

export function isApiRequest(request: Request) {
	const url = new URL(request.url);
	return url.pathname.startsWith("/api/");
}

export function isMutationMethod(method: string) {
	return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

export function isSameOrigin(request: Request) {
	const origin = request.headers.get("origin");
	if (!origin) return true;
	return origin === new URL(request.url).origin;
}

const mailboxRoleRank: Record<MailboxRole, number> = {
	viewer: 1,
	editor: 2,
	owner: 3,
};

export function hasMailboxRole(currentRole: MailboxRole | null | undefined, minimumRole: MailboxRole) {
	if (!currentRole) return false;
	return mailboxRoleRank[currentRole] >= mailboxRoleRank[minimumRole];
}
