/**
 * Client-Side Router for Elite X Gamers Web Portal
 * Supports hash-based & pathname navigation across all requested routes.
 */

class Router {
    constructor() {
        this.routes = [];
        this.currentRoute = null;
        this.params = {};
        this.beforeEachHook = null;

        window.addEventListener("hashchange", () => this.handleRoute());
        window.addEventListener("popstate", () => this.handleRoute());
    }

    add(pattern, handler, isProtected = false) {
        // Convert route pattern like /tournaments/:id into regex
        const paramNames = [];
        const regexPath = pattern.replace(/:([a-zA-Z0-9_]+)/g, (_, key) => {
            paramNames.push(key);
            return "([^/]+)";
        });

        const regex = new RegExp(`^${regexPath}$`);
        this.routes.push({ pattern, regex, paramNames, handler, isProtected });
    }

    beforeEach(hook) {
        this.beforeEachHook = hook;
    }

    navigate(path) {
        if (!path.startsWith("/")) path = "/" + path;
        window.location.hash = path;
    }

    getPath() {
        let hash = window.location.hash.replace(/^#/, "").trim();
        if (!hash) {
            // Check pathname if no hash
            const path = window.location.pathname;
            if (path && path !== "/" && !path.endsWith(".html")) {
                hash = path;
            } else {
                hash = "/";
            }
        }
        // Normalize query string
        const qIndex = hash.indexOf("?");
        if (qIndex !== -1) {
            this.queryString = hash.slice(qIndex + 1);
            hash = hash.slice(0, qIndex);
        } else {
            this.queryString = window.location.search.replace(/^\?/, "");
        }
        return hash.startsWith("/") ? hash : "/" + hash;
    }

    getQueryParams() {
        const params = {};
        const qs = this.queryString || "";
        if (qs) {
            const pairs = qs.split("&");
            for (const p of pairs) {
                const [k, v] = p.split("=");
                if (k) params[decodeURIComponent(k)] = decodeURIComponent(v || "");
            }
        }
        return params;
    }

    async handleRoute() {
        const path = this.getPath();
        let matched = null;
        let params = {};

        for (const r of this.routes) {
            const match = path.match(r.regex);
            if (match) {
                matched = r;
                r.paramNames.forEach((name, index) => {
                    params[name] = match[index + 1];
                });
                break;
            }
        }

        // Fallback to home if no match
        if (!matched) {
            const homeRoute = this.routes.find(r => r.pattern === "/");
            if (homeRoute) {
                matched = homeRoute;
                params = {};
            }
        }

        if (matched) {
            if (this.beforeEachHook) {
                const allow = await this.beforeEachHook(matched, params);
                if (!allow) return;
            }
            this.currentRoute = matched;
            this.params = params;
            matched.handler(params, this.getQueryParams());
            this.updateActiveNav(matched.pattern);
        }
    }

    updateActiveNav(pattern) {
        document.querySelectorAll(".nav-link").forEach(el => {
            const route = el.dataset.route;
            if (route && (route === pattern || (route !== "/" && pattern.startsWith(route)))) {
                el.classList.add("active");
            } else {
                el.classList.remove("active");
            }
        });
    }

    start() {
        this.handleRoute();
    }
}

export const router = new Router();
