/**
 * Elite X Gamers - Single Sign-On (SSO) Module
 * Exchanges short-lived, single-use SSO handoff tokens for authenticated Firebase Web sessions.
 *
 * Primary verification: Firebase Cloud Function (verifySsoToken)
 * Secondary verification: Backend REST API (/api/sso/verify-token)
 *
 * Security guarantees:
 * - Tokens are single-use and atomically consumed/deleted.
 * - Authenticated strictly via Firebase Admin custom token generation.
 * - Never trusts plain UID query parameters.
 */

import { auth, functions, httpsCallable, signInWithCustomToken } from "./firebase.js";

const BACKEND_BASE = window.location.origin;

/**
 * Sanitizes browser URL to remove single-use token from history and address bar.
 */
function sanitizeAddressBar() {
    try {
        const cleanUrl = window.location.pathname + (window.location.hash ? window.location.hash.split("?")[0] : "");
        window.history.replaceState(null, "", cleanUrl);
    } catch (_) {}
}

/**
 * Exchanges a one-time SSO token for a Firebase Custom Token,
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
    let lastError = null;

    // 1. Primary path: Firebase Cloud Function (verifySsoToken)
    try {
        const verifyFn = httpsCallable(functions, "verifySsoToken");
        const res = await verifyFn({ token: cleanToken });
        const data = res.data || {};

        if (data.success && data.customToken) {
            const userCredential = await signInWithCustomToken(auth, data.customToken);
            sanitizeAddressBar();

            return {
                success: true,
                uid: userCredential.user?.uid,
                destination: data.destination || "/wallet"
            };
        }
    } catch (fnErr) {
        const msg = fnErr?.message || "";
        // If Cloud Function returned a specific business error (e.g. expired or not-found), keep it
        if (msg.includes("expired") || msg.includes("Invalid")) {
            lastError = msg;
        }
    }

    // 2. Secondary path: Backend REST endpoint (/api/sso/verify-token)
    try {
        const response = await fetch(`${BACKEND_BASE}/api/sso/verify-token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ token: cleanToken })
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok && data.success && data.customToken) {
            const userCredential = await signInWithCustomToken(auth, data.customToken);
            sanitizeAddressBar();

            return {
                success: true,
                uid: userCredential.user?.uid,
                destination: data.destination || "/wallet"
            };
        }

        if (data.error) {
            lastError = data.error;
        }
    } catch (restErr) {
        // Ignored, proceed to report error
    }

    return {
        success: false,
        error: lastError || "Unable to verify single sign-on token. Please deploy Cloud Functions or launch from the mobile app again."
    };
}
