/**
 * @fileoverview App header. Shows the logged-in user (with a small avatar
 * and a logout button) when authenticated; otherwise the standard "Log in /
 * Sign up" button pair, which opens `AuthModal` rather than swapping out
 * the page content.
 * @author Mohit Sharma
 */

import { useAuth } from "../context/AuthContext.jsx";
import { pushToast } from "../hooks/useToasts.js";
import { ThemeToggle } from "./ThemeToggle.jsx";

/**
 * @param {object} props
 * @param {() => void} props.onLoginClick
 * @param {() => void} props.onSignupClick
 * @returns {JSX.Element}
 */
export function Header({ onLoginClick, onSignupClick }) {
  const { user, isAuthenticated, logout } = useAuth();

  async function handleLogout() {
    await logout();
    pushToast("Logged out.", "success");
  }

  return (
    <header className="header">
      <div className="header__inner">
        <span className="header__logo">
          <svg className="header__logo-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          url<span className="header__logo-accent">.short</span>
        </span>
        <div className="header__auth">
          {isAuthenticated ? (
            <>
              <span className="header__user">
                <span className="header__avatar" aria-hidden="true">
                  {user.email[0].toUpperCase()}
                </span>
                <span className="header__email">{user.email}</span>
                {user.role === "admin" && <span className="badge badge--active header__role">admin</span>}
              </span>
              <button type="button" className="btn btn--ghost" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn--ghost" onClick={onLoginClick}>
                Log in
              </button>
              <button type="button" className="btn btn--primary btn--sm" onClick={onSignupClick}>
                Sign up
              </button>
            </>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
