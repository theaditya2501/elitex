/**
 * Elite X Gamers - Single Sign-On (SSO) Module
 * Exchanges short-lived, single-use SSO handoff tokens for authenticated Firebase Web sessions.
 *
 * Primary verification: Backend REST API (/api/sso/verify-token)
 *
 * Security guarantees:
 * - Tokens are single-use and atomically consumed/deleted.
 * - Authenticated strictly via Firebase Admin custom token generation.
 * - Never trusts plain UID query parameters.
 */

import { auth, signInWithCustomToken } from "./firebase.js";

const BACKEND_BASE = window.location.origin;

export async function processSsoToken(token) {
    if (!token || typeof token !== "string" || token.trim().length === 0) {
        return {
            success: false,
            error: "Single sign-on token is missing or invalid."
        };
    }

    const cleanToken = token.trim();

    // 1. Direct call to Python Backend on AWS (responds in ~10ms!)
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

            return {
                success: true,
                uid: userCredential.user?.uid,
                destination: data.destination || "/wallet"
            };
        }

        if (data.error) {
            return { success: false, error: data.error };
        }
    } catch (restErr) {
        console.warn("Backend SSO error:", restErr);
    }

    return {
        success: false,
        error: "Unable to verify single sign-on token. Please try again."
    };
}
