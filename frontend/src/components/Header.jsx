/**
 * @fileoverview App header. Shows the logged-in user's email and a logout
 * button when authenticated; otherwise just the tagline.
 * @author Mohit Sharma
 */

import { useAuth } from "../context/AuthContext.jsx";
import { pushToast } from "../hooks/useToasts.js";

/**
 * @returns {JSX.Element}
 */
export function Header() {
  const { user, isAuthenticated, logout } = useAuth();

  async function handleLogout() {
    await logout();
    pushToast("Logged out.", "success");
  }

  return (
    <header className="header">
      <div className="header__inner">
        <span className="header__logo">
          url<span className="header__logo-accent">.short</span>
        </span>
        <span className="header__tagline">Backend test harness — Phase 2</span>

        <div className="header__auth">
          {isAuthenticated ? (
            <>
              <span className="header__user">
                {user.email}
                {user.role === "admin" && <span className="badge badge--active header__role">admin</span>}
              </span>
              <button type="button" className="btn btn--ghost" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <span className="header__user header__user--anon">Not logged in</span>
          )}
        </div>
      </div>
    </header>
  );
}
