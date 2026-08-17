/**
 * @fileoverview Owns the current session: who's logged in (if anyone) and
 * the login/register/logout actions. The access token itself lives in
 * `api/client.js` (a plain closure variable, not React state) since it
 * needs to be readable by the Axios interceptor outside the render tree;
 * this context only tracks what the UI needs to render — the user object
 * and whether we're still figuring that out on first load.
 * @author Mohit Sharma
 */

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as authApi from "../api/auth.js";
import { setAccessToken, setOnSessionExpired } from "../api/client.js";
import { pushToast } from "../hooks/useToasts.js";

const AuthContext = createContext(null);

/**
 * @param {object} props
 * @param {React.ReactNode} props.children
 * @returns {JSX.Element}
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // "loading" avoids a flash of the logged-out UI while the silent-refresh
  // attempt below is still in flight on first page load.
  const [status, setStatus] = useState("loading");

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus("anonymous");
  }, []);

  // Wire up the Axios layer's "a background refresh ultimately failed" hook
  // once. This fires when an access token expires mid-session AND the
  // refresh attempt also fails (e.g. the refresh token itself expired or
  // was revoked) — not on every 401, just the ones the interceptor
  // couldn't silently recover from.
  useEffect(() => {
    setOnSessionExpired(() => {
      clearSession();
      pushToast("Your session expired — please log in again.", "error");
    });
  }, [clearSession]);

  // On first load, there's no access token in memory yet (a page refresh
  // wipes it, by design), but the httpOnly refresh cookie may still be
  // valid — try to silently trade it for a new session before deciding the
  // user is logged out.
  useEffect(() => {
    (async () => {
      try {
        const { user: restoredUser, accessToken } = await authApi.refresh();
        setAccessToken(accessToken);
        setUser(restoredUser);
        setStatus("authenticated");
      } catch {
        setStatus("anonymous");
      }
    })();
  }, []);

  /** @param {{email: string, password: string}} credentials @returns {Promise<void>} */
  async function login(credentials) {
    const { user: loggedInUser, accessToken } = await authApi.login(credentials);
    setAccessToken(accessToken);
    setUser(loggedInUser);
    setStatus("authenticated");
  }

  /** @param {{email: string, password: string}} credentials @returns {Promise<void>} */
  async function register(credentials) {
    const { user: newUser, accessToken } = await authApi.register(credentials);
    setAccessToken(accessToken);
    setUser(newUser);
    setStatus("authenticated");
  }

  /** @returns {Promise<void>} */
  async function logout() {
    try {
      await authApi.logout();
    } finally {
      // Log out locally even if the network call failed — there's no
      // scenario where staying "logged in" client-side after a failed
      // logout request is the right call.
      clearSession();
    }
  }

  const value = { user, status, isAuthenticated: status === "authenticated", login, register, logout };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * @returns {{user: object | null, status: "loading" | "authenticated" | "anonymous", isAuthenticated: boolean, login: Function, register: Function, logout: Function}}
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
