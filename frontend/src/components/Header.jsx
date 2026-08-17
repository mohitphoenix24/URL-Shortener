/**
 * @fileoverview App header. Static for now — becomes a real nav bar with
 * login/logout once Phase 2 auth lands.
 * @author Mohit Sharma
 */

/**
 * @returns {JSX.Element}
 */
export function Header() {
  return (
    <header className="header">
      <div className="header__inner">
        <span className="header__logo">
          url<span className="header__logo-accent">.short</span>
        </span>
        <span className="header__tagline">Backend test harness — Phase 1</span>
      </div>
    </header>
  );
}
