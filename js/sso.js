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

    // Fast-path: If user is already authenticated in this browser, proceed immediately
    if (auth.currentUser) {
        return {
            success: true,
            uid: auth.currentUser.uid,
            destination: "/wallet"
        };
    }

    const cleanToken = token.trim();

    // 1. Call backend verify-token with 3s timeout
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(`${BACKEND_BASE}/api/sso/verify-token`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ token: cleanToken }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

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
        error: "Single sign-on is not available. Please log in directly with your email and password."
    };
}
