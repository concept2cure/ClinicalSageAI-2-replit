import React, { useState } from 'react';
import ResilienceService from '../../services/ResilienceService';

const Login = () => {
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
  });

  const handleChange = e => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value,
    });
  };

  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState(null);

  const handleLogin = async () => {
    setIsLoading(true);
    setLoginError(null);

    try {
      // Use the resilient login flow
      await ResilienceService.resilientLogin({
        username: 'admin',
        password: 'admin123',
      });

      // Check if we have a redirect parameter in the URL
      const params = new URLSearchParams(window.location.search);
      const redirectTo = params.get('redirect');

      // Redirect to the specified module or default to portal
      window.location.href = redirectTo || '/portal/client';
    } catch (error) {
      console.error('Login failed:', error);
      setLoginError(error.message || 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = e => {
    e.preventDefault();
    // Verify credentials
    if (credentials.username === 'admin' && credentials.password === 'admin123') {
      handleLogin();
    } else {
      alert('Invalid credentials. Use admin/admin123');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6 text-pink-600">TrialSage Login</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-700 mb-1">Username</label>
            <input
              type="text"
              name="username"
              value={credentials.username}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
              placeholder="admin"
              required
            />
          </div>
          <div>
            <label className="block text-gray-700 mb-1">Password</label>
            <input
              type="password"
              name="password"
              value={credentials.password}
              onChange={handleChange}
              className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500"
              placeholder="admin123"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full ${isLoading ? 'bg-pink-400' : 'bg-pink-600 hover:bg-pink-700'} text-white py-2 rounded-md transition duration-200 relative`}
          >
            {isLoading ? (
              <>
                <span className="opacity-0">Sign In</span>
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg
                    className="animate-spin h-5 w-5 text-white mr-2"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Connecting...
                </div>
              </>
            ) : (
              'Sign In'
            )}
          </button>
          <div className="text-center mt-4 flex justify-between">
            <a href="/" className="text-sm text-pink-600 hover:underline">
              Return to Home
            </a>
            <button
              type="button"
              onClick={handleLogin}
              disabled={isLoading}
              className={`text-sm font-bold ${isLoading ? 'bg-gray-200 text-gray-500' : 'bg-pink-100 text-pink-800 hover:bg-pink-200'} px-2 py-1 rounded transition-colors relative`}
            >
              {isLoading ? 'CONNECTING...' : 'DIRECT PORTAL ACCESS'}
            </button>
          </div>
        </form>

        <div className="mt-6 p-4 bg-gray-50 rounded-md border border-gray-200">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Demo Credentials</h2>
          <p className="text-xs text-gray-600">
            Username: <span className="font-mono bg-gray-100 px-1">admin</span>
          </p>
          <p className="text-xs text-gray-600">
            Password: <span className="font-mono bg-gray-100 px-1">admin123</span>
          </p>

          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={handleLogin}
              disabled={isLoading}
              className={`text-white ${isLoading ? 'bg-green-400' : 'bg-green-600 hover:bg-green-700'} px-4 py-2 text-sm font-bold rounded transition-colors relative min-w-full`}
            >
              {isLoading ? (
                <>
                  <span className="opacity-0">➤ ACCESS CLIENT PORTAL NOW ➤</span>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <svg
                      className="animate-spin h-5 w-5 text-white mr-2"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Connecting...
                  </div>
                </>
              ) : (
                '➤ ACCESS CLIENT PORTAL NOW ➤'
              )}
            </button>

            {loginError && (
              <div className="mt-3 p-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded text-center">
                {loginError}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
