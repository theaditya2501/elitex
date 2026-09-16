/**
 * Elite X Gamers - Centralized Authentication Bootstrap
 * Project: elitexgamers-17353
 *
 * Provides centralized session management, route protection via requireAuth(),
 * and asynchronous auth state synchronization.
 */

import {
    auth,
    db,
    onAuthStateChanged,
    signOut,
    signInWithCustomToken,
    doc,
    getDoc
} from "./firebase.js";

let authReadyResolved = false;
let authReadyResolver = null;
export const authReadyPromise = new Promise(resolve => {
    authReadyResolver = resolve;
});

export const authState = {
    currentUser: null,
    userProfile: null,
    isReady: false
};

const authListeners = [];

export function onAuthChange(listener) {
    if (typeof listener === "function") {
        authListeners.push(listener);
        if (authState.isReady) {
            listener(authState.currentUser, authState.userProfile);
        }
    }
}

/**
 * Waits until the initial Firebase Auth check has completed.
 * Prevents flashing or premature redirection on page refreshes.
 */
export async function waitForAuthReady() {
    if (authReadyResolved) return authState.currentUser;
    await authReadyPromise;
    return authState.currentUser;
}

/**
 * Returns currently authenticated Firebase user or null.
 */
export function getCurrentUser() {
    return auth.currentUser || authState.currentUser;
}

/**
 * Route protection guard.
 * Call this at the start of any authenticated view (e.g. /wallet, /profile).
 *
 * If the user is authenticated, returns the Firebase User.
 * If unauthenticated, safely redirects to /login while preserving destination.
 */
export async function requireAuth(targetRoute = window.location.hash.replace(/^#/, "") || "/wallet") {
    await waitForAuthReady();
    const user = getCurrentUser();

    if (!user) {
        try {
            sessionStorage.setItem("exg_redirect_after_login", targetRoute);
        } catch (_) {}

        // Fallback to login view
        if (window.location.hash !== "#/login") {
            window.location.hash = "#/login";
        }
        return null;
    }

    return user;
}

/**
 * Initializes the Firebase Auth observer.
 * Must be called once on application startup.
 */
export function initAuthBootstrap(onUserLoaded) {
    onAuthStateChanged(auth, async user => {
        authState.currentUser = user;

        if (user) {
            try {
                const uDoc = await getDoc(doc(db, "users", user.uid));
                authState.userProfile = uDoc.exists()
                    ? uDoc.data()
                    : { username: user.displayName || "Player", email: user.email };
            } catch (e) {
                console.warn("Unable to load user profile:", e.message);
                authState.userProfile = { username: user.displayName || "Player", email: user.email };
            }
        } else {
            authState.userProfile = null;
        }

        if (!authReadyResolved) {
            authReadyResolved = true;
            authState.isReady = true;
            if (authReadyResolver) authReadyResolver(user);
        }

        authListeners.forEach(listener => {
            try {
                listener(user, authState.userProfile);
            } catch (err) {
                console.error("Auth listener error:", err);
            }
        });

        if (typeof onUserLoaded === "function") {
            onUserLoaded(user, authState.userProfile);
        }
    });
}

/**
 * Signs out the current web Firebase user.
 * Note: Does not affect the Android native session.
 */
export async function logoutWeb() {
    try {
        sessionStorage.removeItem("exg_redirect_after_login");
    } catch (_) {}
    await signOut(auth);
}

export { signInWithCustomToken };
