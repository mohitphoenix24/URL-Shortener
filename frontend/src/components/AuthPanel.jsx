/**
 * @fileoverview Combined login/register form, rendered inside `AuthModal`.
 * One component with a mode toggle rather than two near-identical ones —
 * login and register hit different endpoints but share the exact same
 * fields and validation shape.
 * @author Mohit Sharma
 */

import { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { pushToast } from "../hooks/useToasts.js";

/**
 * @param {object} props
 * @param {"login" | "register"} [props.initialMode]
 * @param {() => void} [props.onSuccess] - Called after a successful login/register (e.g. to close the modal).
 * @returns {JSX.Element}
 */
export function AuthPanel({ initialMode = "login", onSuccess }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState(initialMode); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === "register";

  /** @param {React.FormEvent} event */
  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (isRegister) {
        await register({ email, password });
        pushToast("Account created — you're logged in.", "success");
      } else {
        await login({ email, password });
        pushToast("Logged in.", "success");
      }
      onSuccess?.();
    } catch (err) {
      const detail = err.details?.[0]?.message;
      pushToast(detail ? `${err.message}: ${detail}` : err.message, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-panel">
      <h3 className="auth-panel__title">{isRegister ? "Create an account" : "Log in"}</h3>
      <p className="auth-panel__subtitle">
        {isRegister
          ? "Links you create while logged in are yours to manage — see, edit, and delete them here."
          : "Log in to see and manage the links you own."}
      </p>

      <form className="auth-panel__form" onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label className="field">
          <span className="field__label">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete={isRegister ? "new-password" : "current-password"}
          />
        </label>

        <button type="submit" className="btn btn--primary" disabled={submitting}>
          {submitting ? "Please wait…" : isRegister ? "Create account" : "Log in"}
        </button>
      </form>

      <button type="button" className="auth-panel__toggle" onClick={() => setMode(isRegister ? "login" : "register")}>
        {isRegister ? "Already have an account? Log in" : "Need an account? Register"}
      </button>
    </div>
  );
}
