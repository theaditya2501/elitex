/**
 * Elite X Gamers - Single Sign-On (SSO) Module
 * Exchanges short-lived, single-use SSO handoff tokens for authenticated Firebase Web sessions.
 *
 * Security guarantees:
 * - Tokens are single-use and atomically consumed/deleted.
 * - Authenticated strictly via Firebase Admin custom token generation.
 * - Never trusts plain UID query parameters.
 */

import { auth, signInWithCustomToken } from "./firebase.js";

const BACKEND_BASE = window.location.origin;

/**
 * Exchanges a one-time SSO token with the backend for a Firebase Custom Token,
 * then establishes an authenticated session in the web browser.
 *
 * @param {string} token - The 32-byte hex token issued by the mobile app handoff.
 * @returns {Promise<{success: boolean, destination?: string, error?: string}>}
 */
export async function processSsoToken(token) {
    if (!token || typeof token !== "string" || token.trim().length === 0) {
        return {
            success: false,
            error: "Single sign-on token is missing or invalid."
        };
    }

    const cleanToken = token.trim();

    try {
        const response = await fetch(`${BACKEND_BASE}/api/sso/verify-token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ token: cleanToken })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success || !data.customToken) {
            const errorMsg = data.error || (response.status === 410 ? "Token expired." : "Authentication failed.");
            return {
                success: false,
                error: errorMsg
            };
        }

        // Establish the web Firebase session with the custom token minted by Admin SDK
        const userCredential = await signInWithCustomToken(auth, data.customToken);

        // Sanitize the URL to remove the single-use token from browser history/address bar
        try {
            const cleanUrl = window.location.pathname + (window.location.hash ? window.location.hash.split("?")[0] : "");
            window.history.replaceState(null, "", cleanUrl);
        } catch (_) {}

        return {
            success: true,
            uid: userCredential.user?.uid,
            destination: data.destination || "/wallet"
        };
    } catch (e) {
        return {
            success: false,
            error: e.message || "Network error connecting to authentication server."
        };
    }
}
