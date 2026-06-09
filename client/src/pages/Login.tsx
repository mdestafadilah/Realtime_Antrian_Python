import React, { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { GithubIcon, TwitterIcon } from '../icons';

const ImageLight =
  'https://images.unsplash.com/photo-1497366216548-37526070297c?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80';
const ImageDark =
  'https://images.unsplash.com/photo-1497366811353-6870744d04b2?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80';

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000';

type LoginResponse = {
  status: boolean;
  message?: string;
  data?: {
    token: string;
    token_type: string;
    expires_at: string;
    user: {
      id: number;
      username: string;
      email: string;
      first_name?: string | null;
      last_name?: string | null;
    };
  };
};

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: identity.trim(), password }),
      });

      const json: LoginResponse = await res.json().catch(() => ({
        status: false,
        message: 'Respons server tidak valid',
      }));

      if (!res.ok || !json.status || !json.data) {
        setError(json.message || `Login gagal (HTTP ${res.status})`);
        return;
      }

      localStorage.setItem('auth_token', json.data.token);
      localStorage.setItem('auth_user', JSON.stringify(json.data.user));
      navigate({ to: '/' });
    } catch (err) {
      setError(
        err instanceof Error
          ? `Tidak bisa terhubung ke server: ${err.message}`
          : 'Tidak bisa terhubung ke server',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center min-h-screen p-6 bg-gray-50 dark:bg-gray-900">
      <div className="flex-1 h-full max-w-4xl mx-auto overflow-hidden bg-white rounded-lg shadow-xl dark:bg-gray-800">
        <div className="flex flex-col overflow-y-auto md:flex-row">
          <div className="h-32 md:h-auto md:w-1/2">
            <img
              aria-hidden="true"
              className="object-cover w-full h-full dark:hidden"
              src={ImageLight}
              alt="Office"
            />
            <img
              aria-hidden="true"
              className="hidden object-cover w-full h-full dark:block"
              src={ImageDark}
              alt="Office"
            />
          </div>
          <main className="flex items-center justify-center p-6 sm:p-12 md:w-1/2">
            <form className="w-full" onSubmit={handleSubmit} noValidate>
              <h1 className="mb-4 text-xl font-semibold text-gray-700 dark:text-gray-200">Login</h1>

              {error && (
                <div
                  role="alert"
                  className="mb-4 px-3 py-2 text-sm text-red-700 bg-red-100 border border-red-200 rounded-md dark:bg-red-900/30 dark:text-red-300 dark:border-red-800"
                >
                  {error}
                </div>
              )}

              <label className="block text-sm text-gray-700 dark:text-gray-400">
                <span>Email atau Username</span>
                <input
                  className="block w-full mt-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  type="text"
                  placeholder="john@doe.com"
                  value={identity}
                  onChange={(e) => setIdentity(e.target.value)}
                  autoComplete="username"
                  required
                  disabled={loading}
                />
              </label>

              <label className="block mt-4 text-sm text-gray-700 dark:text-gray-400">
                <span>Password</span>
                <input
                  className="block w-full mt-1 text-sm border border-gray-300 rounded-md px-3 py-2 focus:border-purple-400 focus:outline-none focus:ring focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  type="password"
                  placeholder="***************"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  disabled={loading}
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="block w-full mt-4 px-5 py-2 text-sm font-medium leading-5 text-center text-white transition-colors duration-150 bg-purple-600 border border-transparent rounded-lg hover:bg-purple-700 focus:outline-none focus:shadow-outline-purple disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? 'Memproses...' : 'Log in'}
              </button>

              <hr className="my-8" />

              <button
                type="button"
                disabled={loading}
                className="inline-flex items-center justify-center w-full px-5 py-2 text-sm font-medium leading-5 text-gray-700 transition-colors duration-150 bg-white border border-gray-300 rounded-lg dark:text-gray-200 dark:bg-gray-700 dark:border-gray-600 hover:border-gray-500 focus:border-gray-500 focus:outline-none focus:shadow-outline-gray disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <GithubIcon className="w-4 h-4 mr-2" aria-hidden="true" />
                Github
              </button>
              <button
                type="button"
                disabled={loading}
                className="inline-flex items-center justify-center w-full mt-4 px-5 py-2 text-sm font-medium leading-5 text-gray-700 transition-colors duration-150 bg-white border border-gray-300 rounded-lg dark:text-gray-200 dark:bg-gray-700 dark:border-gray-600 hover:border-gray-500 focus:border-gray-500 focus:outline-none focus:shadow-outline-gray disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <TwitterIcon className="w-4 h-4 mr-2" aria-hidden="true" />
                Twitter
              </button>

              <p className="mt-4">
                <Link
                  className="text-sm font-medium text-purple-600 dark:text-purple-400 hover:underline"
                  to="/"
                >
                  Forgot your password?
                </Link>
              </p>
              <p className="mt-1">
                <Link
                  className="text-sm font-medium text-purple-600 dark:text-purple-400 hover:underline"
                  to="/"
                >
                  Create account
                </Link>
              </p>
            </form>
          </main>
        </div>
      </div>
    </div>
  );
};

export default Login;
