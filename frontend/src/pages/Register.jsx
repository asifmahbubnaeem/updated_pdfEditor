import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const { register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const googleButtonRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setErrors({});

    // Validation (must match backend: 6+ chars, at least one letter, one number)
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (!/[A-Za-z]/.test(password)) {
      setError('Password must contain at least one letter');
      return;
    }

    if (!/[0-9]/.test(password)) {
      setError('Password must contain at least one number');
      return;
    }

    setLoading(true);

    const result = await register(email, password);

    if (result.success) {
      navigate('/');
    } else {
      setError(result.error || 'Registration failed');
      if (result.errors) {
        const errorMap = {};
        result.errors.forEach((err) => {
          const field = err.path ?? err.param;
          if (field) errorMap[field] = err.msg;
        });
        setErrors(errorMap);
      }
    }

    setLoading(false);
  };

  const handleGoogleSignIn = useCallback(async (response) => {
    try {
      setError('');
      setLoading(true);

      const result = await loginWithGoogle(response.credential);

      if (result.success) {
        navigate('/');
      } else {
        setError(result.error || 'Google sign-up failed');
        setLoading(false);
      }
    } catch {
      setError('Google sign-up failed');
      setLoading(false);
    }
  }, [loginWithGoogle, navigate]);

  // Initialize Google Sign-In
  useEffect(() => {
    const initGoogleSignIn = async () => {
      await loadGoogleScript();

      if (window.google && googleButtonRef[0]) {
        window.google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          callback: handleGoogleSignIn,
        });

        window.google.accounts.id.renderButton(
          googleButtonRef[0],
          {
            theme: 'outline',
            size: 'large',
            width: '100%',
            text: 'signup_with',
          }
        );
      }
    };

    initGoogleSignIn();
  }, [handleGoogleSignIn]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-100 py-12 px-4 sm:px-6 lg:px-8">
      {/* Classic centered card */}
      <div className="w-full max-w-[420px]">
        <div className="bg-white rounded-xl shadow-lg shadow-stone-200/50 border border-stone-200/80 overflow-hidden">
          {/* Header strip */}
          <div className="bg-stone-800 px-8 py-6 text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Create your account
            </h1>
            <p className="mt-1.5 text-sm text-stone-400">
              Join us — it only takes a moment
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
                  {errors.email && (
                    <p className="mt-1 text-xs text-red-600 text-right w-full">{errors.email}</p>
                  )}
                </div>

                <div className="w-full max-w-[280px] flex flex-col items-end">
                  <label htmlFor="password" className="block text-sm font-medium text-stone-700 mb-1.5 text-right w-full">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    className="block w-full px-3.5 py-2.5 rounded-lg border border-stone-300 bg-white text-stone-900 text-right placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400/30 focus:border-stone-500 text-sm transition-shadow"
                    placeholder="6+ characters, one letter, one number"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {errors.password && (
                    <p className="mt-1 text-xs text-red-600 text-right w-full">{errors.password}</p>
                  )}
                </div>

                <div className="w-full max-w-[280px] flex flex-col items-end">
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-stone-700 mb-1.5 text-right w-full">
                    Confirm password
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    className="block w-full px-3.5 py-2.5 rounded-lg border border-stone-300 bg-white text-stone-900 text-right placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400/30 focus:border-stone-500 text-sm transition-shadow"
                    placeholder="Re-enter your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-lg text-sm font-medium text-white bg-stone-800 hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-stone-600 disabled:bg-stone-400 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Creating account...' : 'Sign up'}
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

            <div ref={(el) => (googleButtonRef[0] = el)} className="flex justify-center" />
          </div>
        </div>

        {/* Footer link */}
        <p className="mt-6 text-center text-sm text-stone-600">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium text-stone-800 underline underline-offset-2 hover:text-stone-600"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
