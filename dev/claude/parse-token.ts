// Shared token-parsing utilities for dev scripts.

const BEARER_RE = /["']?[Aa]uthorization["']?\s*:\s*["']Bearer\s+([^"']+)["']/;
const RAW_JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const FETCH_URL_RE = /fetch\s*\(\s*["']([^"']+)["']/;

export interface JwtPayload {
  exp?: number;
  iss?: string;
  [key: string]: unknown;
}

// Extracts bearer token from a fetch() string or raw JWT. Returns token string or null.
export function extractToken(content: string): string | null {
  const trimmed = (content || '').trim();
  const bearerMatch = trimmed.match(BEARER_RE);
  if (bearerMatch) return bearerMatch[1];
  if (RAW_JWT_RE.test(trimmed)) return trimmed;
  return null;
}

// Extracts the URL from a fetch() string, or null if not present.
export function extractUrl(content: string): string | null {
  const match = (content || '').match(FETCH_URL_RE);
  return match ? match[1] : null;
}

// Decodes a JWT payload (base64url). Returns parsed object or null.
export function decodeJwt(token: string): JwtPayload | null {
  const parts = (token || '').split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(
      Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
    );
  } catch {
    return null;
  }
}
