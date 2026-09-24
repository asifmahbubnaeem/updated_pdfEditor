import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Load Google Identity Services
const loadGoogleScript = () => {
  return new Promise((resolve) => {
    if (window.google) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    document.head.appendChild(script);
  });
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, loginWithGoogle, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const googleButtonRef = useRef(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const redirect = searchParams.get('redirect') || '/';
      navigate(redirect, { replace: true });
    }
  }, [isAuthenticated, navigate, searchParams]);

  const handleGoogleSignIn = useCallback(async (response) => {
    try {
      setError('');
      setLoading(true);

      const result = await loginWithGoogle(response.credential);

      if (result.success) {
        const redirect = searchParams.get('redirect') || '/';
        navigate(redirect, { replace: true });
      } else {
        setError(result.error || 'Google sign-in failed');
        setLoading(false);
      }
    } catch {
      setError('Google sign-in failed');
      setLoading(false);
    }
  }, [loginWithGoogle, navigate, searchParams]);

  // Initialize Google Sign-In
  useEffect(() => {
    const initGoogleSignIn = async () => {
      await loadGoogleScript();

      if (window.google && googleButtonRef.current) {
        window.google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          callback: handleGoogleSignIn,
        });

        window.google.accounts.id.renderButton(
          googleButtonRef.current,
          {
            theme: 'outline',
            size: 'large',
            width: '100%',
            text: 'signin_with',
          }
        );
      }
    };

    initGoogleSignIn();
  }, [handleGoogleSignIn]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);

    if (result.success) {
      const redirect = searchParams.get('redirect') || '/';
      navigate(redirect, { replace: true });
    } else {
      setError(result.error || 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-[420px]">
        <div className="bg-white rounded-xl shadow-lg shadow-stone-200/50 border border-stone-200/80 overflow-hidden">
          {/* Header strip */}
          <div className="bg-indigo-600 px-8 py-6 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Sign in to your account
            </h1>
            <p className="mt-1.5 text-sm text-stone-400">
              Welcome back
            </p>
          </div>

          <div className="px-8 py-8">
            <form className="space-y-5" onSubmit={handleSubmit}>
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200/80 text-red-700 text-sm px-4 py-3">
                  {error}
                </div>
              )}

              <div className="space-y-4 flex flex-col items-end">
                <div className="w-full max-w-[280px] flex flex-col items-end">
                  <label htmlFor="email" className="block text-sm font-medium text-stone-700 mb-1.5 text-right w-full">
                    Email address
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="block w-full px-3.5 py-2.5 rounded-lg border border-stone-300 bg-white text-stone-900 text-right placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400/30 focus:border-stone-500 text-sm transition-shadow"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                <div className="w-full max-w-[280px] flex flex-col items-end">
                  <label htmlFor="password" className="block text-sm font-medium text-stone-700 mb-1.5 text-right w-full">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    className="block w-full px-3.5 py-2.5 rounded-lg border border-stone-300 bg-white text-stone-900 text-right placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400/30 focus:border-stone-500 text-sm transition-shadow"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-stone-400 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-stone-200" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-3 text-xs font-medium uppercase tracking-wider text-stone-400">
                  Or continue with
                </span>
              </div>
            </div>

            <div ref={googleButtonRef} className="flex justify-center" />
          </div>
        </div>

        {/* Footer link */}
        <p className="mt-6 text-center text-sm text-stone-600">
          Don't have an account?{' '}
          <Link
            to="/register"
            className="font-medium text-stone-800 underline underline-offset-2 hover:text-stone-600"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
