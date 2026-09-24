import { NavLink, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useSubscription } from "../context/SubscriptionContext.jsx";

const navLinkClasses = ({ isActive }) =>
  `px-3 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? "bg-indigo-600 text-white"
      : "text-stone-600 hover:text-stone-900 hover:bg-stone-100"
  }`;

export default function Navbar() {
  const { user, isAuthenticated, logout } = useAuth();
  const { tier } = useSubscription();

  return (
    <nav className="bg-white border-b border-stone-200 sticky top-0 z-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Brand + primary nav */}
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white text-sm font-bold">
                P
              </span>
              <span className="text-base font-semibold text-stone-900 tracking-tight">
                PDF Tools
              </span>
            </Link>

            <div className="hidden sm:flex items-center gap-1">
              <NavLink to="/" end className={navLinkClasses}>
                Home
              </NavLink>
              {isAuthenticated && (
                <NavLink to="/pricing" className={navLinkClasses}>
                  Pricing
                </NavLink>
              )}
            </div>
          </div>

          {/* Right: user info / auth actions */}
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <>
                <div className="hidden sm:flex items-center gap-2 text-sm text-stone-600">
                  <span className="max-w-[180px] truncate">{user?.email}</span>
                  {tier !== "free" && (
                    <span className="px-2 py-0.5 bg-indigo-600 text-white rounded-full text-xs font-medium capitalize">
                      {tier}
                    </span>
                  )}
                </div>
                <button
                  onClick={logout}
                  className="px-3.5 py-1.5 text-sm font-medium text-stone-600 border border-stone-300 rounded-md hover:bg-stone-100 hover:text-stone-900 transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className={navLinkClasses}>
                  Login
                </NavLink>
                <NavLink
                  to="/register"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  Sign Up
                </NavLink>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
