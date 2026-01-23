/**
 * Authentication Page
 *
 * This page handles user login and registration for the Concept2Cure platform.
 * Features Microsoft and Google SSO integration along with email/password auth.
 */

import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '../hooks/use-auth';
import { Shield, User, Lock, Mail, ChevronRight, ArrowRight } from 'lucide-react';
import concept2cureLogo from '@/assets/concept2cure-logo.jpg';

// Microsoft SSO configuration
const MICROSOFT_AUTH_URL = () => {
  const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID || '';
  const tenantId = import.meta.env.VITE_MICROSOFT_TENANT_ID || 'common';
  const redirectUri = encodeURIComponent(window.location.origin + '/auth-callback');
  const scope = encodeURIComponent('openid profile email User.Read');
  const state = Math.random().toString(36).substring(2, 15);
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${scope}&response_mode=query&state=${state}`;
};

// Google SSO configuration  
const GOOGLE_AUTH_URL = () => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const redirectUri = encodeURIComponent(window.location.origin + '/auth-callback');
  const scope = encodeURIComponent('openid profile email');
  const state = Math.random().toString(36).substring(2, 15);
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${scope}&state=${state}&access_type=offline&prompt=consent`;
};

const AuthPage = () => {
  const [activeForm, setActiveForm] = useState('login');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    name: '',
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(null);

  const { isAuthenticated, login } = useAuth();
  const [location, setLocation] = useLocation();
  
  // Handle Microsoft SSO
  const handleMicrosoftSSO = () => {
    setSsoLoading('microsoft');
    window.location.href = MICROSOFT_AUTH_URL();
  };
  
  // Handle Google SSO
  const handleGoogleSSO = () => {
    setSsoLoading('google');
    window.location.href = GOOGLE_AUTH_URL();
  };

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setLocation('/');
    }
  }, [isAuthenticated, setLocation]);

  // Toggle between login and register forms
  const toggleForm = () => {
    setActiveForm(activeForm === 'login' ? 'register' : 'login');
    setError(null);
  };

  // Handle input changes
  const handleChange = e => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle login form submission
  const handleLogin = async e => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { email, password } = formData;

      // Use the login function from useAuth - pass email as username for backend compatibility
      const success = await login({ username: email, password });

      if (success) {
        setLocation('/client-portal');
      } else {
        setError('Invalid email or password');
      }
    } catch (error) {
      setError(error.message || 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  // Handle register form submission
  const handleRegister = async e => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // In a real app, this would call the register API
      const { username, password, email, confirmPassword } = formData;

      // Simple validation
      if (password !== confirmPassword) {
        throw new Error('Passwords do not match');
      }

      // For development, just switch to login form
      setActiveForm('login');
      setFormData(prev => ({
        ...prev,
        confirmPassword: '',
      }));

      // Success message or notification would go here
    } catch (error) {
      setError(error.message || 'An error occurred during registration');
    } finally {
      setLoading(false);
    }
  };

  // Render login form
  const renderLoginForm = () => {
    return (
      <form onSubmit={handleLogin} className="space-y-6">
        {/* SSO Buttons */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleMicrosoftSSO}
            disabled={ssoLoading !== null}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-gray-300 rounded-lg shadow-sm bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            {ssoLoading === 'microsoft' ? (
              <span className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></span>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg">
                <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                <rect x="11" y="1" width="9" height="9" fill="#00a4ef"/>
                <rect x="1" y="11" width="9" height="9" fill="#7fba00"/>
                <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
              </svg>
            )}
            <span className="text-sm font-medium text-gray-700">Continue with Microsoft</span>
          </button>
          
          <button
            type="button"
            onClick={handleGoogleSSO}
            disabled={ssoLoading !== null}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-gray-300 rounded-lg shadow-sm bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            {ssoLoading === 'google' ? (
              <span className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></span>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            <span className="text-sm font-medium text-gray-700">Continue with Google</span>
          </button>
        </div>
        
        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Or continue with email</span>
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email Address
          </label>
          <div className="mt-1 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Mail className="h-5 w-5 text-gray-400" />
            </div>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              placeholder="you@company.com"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Password
          </label>
          <div className="mt-1 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock className="h-5 w-5 text-gray-400" />
            </div>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={formData.password}
              onChange={handleChange}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary"
              placeholder="Enter your password"
            />
          </div>
        </div>

        {error && <div className="text-red-600 text-sm">{error}</div>}

        <div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
          >
            {loading ? (
              <>
                <span className="mr-2">Signing in</span>
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
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
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={toggleForm}
            className="text-sm text-primary hover:text-primary-dark flex items-center justify-center mx-auto"
          >
            <span>Don't have an account? Sign up</span>
            <ChevronRight className="h-4 w-4 ml-1" />
          </button>
        </div>
      </form>
    );
  };

  // Render register form
  const renderRegisterForm = () => {
    return (
      <form onSubmit={handleRegister} className="space-y-6">
        <div>
          <label htmlFor="username" className="block text-sm font-medium text-gray-700">
            Username
          </label>
          <div className="mt-1 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <User className="h-5 w-5 text-gray-400" />
            </div>
            <input
              id="username"
              name="username"
              type="text"
              required
              value={formData.username}
              onChange={handleChange}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary"
              placeholder="Choose a username"
            />
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <div className="mt-1 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Mail className="h-5 w-5 text-gray-400" />
            </div>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary"
              placeholder="Your email address"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Password
          </label>
          <div className="mt-1 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock className="h-5 w-5 text-gray-400" />
            </div>
            <input
              id="password"
              name="password"
              type="password"
              required
              value={formData.password}
              onChange={handleChange}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary"
              placeholder="Create a password"
            />
          </div>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
            Confirm Password
          </label>
          <div className="mt-1 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock className="h-5 w-5 text-gray-400" />
            </div>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              required
              value={formData.confirmPassword}
              onChange={handleChange}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary focus:border-primary"
              placeholder="Confirm your password"
            />
          </div>
        </div>

        {error && <div className="text-red-600 text-sm">{error}</div>}

        <div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center items-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
          >
            {loading ? (
              <>
                <span className="mr-2">Creating account</span>
                <svg
                  className="animate-spin h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
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
              </>
            ) : (
              'Create account'
            )}
          </button>
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={toggleForm}
            className="text-sm text-primary hover:text-primary-dark flex items-center justify-center mx-auto"
          >
            <span>Already have an account? Sign in</span>
            <ChevronRight className="h-4 w-4 ml-1" />
          </button>
        </div>
      </form>
    );
  };

  return (
    <div className="min-h-screen flex">
      {/* Form Side */}
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12 bg-white">
        <div className="max-w-md w-full">
          <div className="text-center">
            {/* Concept2Cure Logo */}
            <div className="flex justify-center mb-6">
              <img 
                src={concept2cureLogo} 
                alt="Concept2Cure" 
                className="h-16 w-auto object-contain"
              />
            </div>
            <h2 className="text-3xl font-extrabold text-gray-900">
              {activeForm === 'login' ? 'Sign in to your account' : 'Create a new account'}
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              {activeForm === 'login'
                ? 'Enter your credentials to access the Concept2Cure platform'
                : 'Join Concept2Cure to streamline your regulatory processes'}
            </p>
          </div>

          <div className="mt-8">
            {activeForm === 'login' ? renderLoginForm() : renderRegisterForm()}
          </div>
        </div>
      </div>

      {/* Hero Side */}
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-blue-900 to-indigo-900 relative">
        <div className="absolute inset-0 opacity-20">
          <img
            src="https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?q=80&w=1470&auto=format&fit=crop"
            alt="Laboratory background"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="relative z-10 flex flex-col items-start justify-center px-12 py-24 text-white">
          <div className="mb-8 bg-blue-600 p-4 rounded-full">
            <Shield size={40} />
          </div>
          <h1 className="text-4xl font-bold mb-4">Concept2Cure Platform</h1>
          <p className="text-xl mb-8 max-w-lg">
            Enterprise regulatory intelligence platform for clinical research and medical device professionals.
          </p>
          <ul className="space-y-4 mb-8">
            <li className="flex items-center">
              <ArrowRight className="h-5 w-5 mr-3 text-blue-400" />
              <span>Secure document management with blockchain verification</span>
            </li>
            <li className="flex items-center">
              <ArrowRight className="h-5 w-5 mr-3 text-blue-400" />
              <span>AI-powered regulatory document generation</span>
            </li>
            <li className="flex items-center">
              <ArrowRight className="h-5 w-5 mr-3 text-blue-400" />
              <span>Streamlined submission workflows</span>
            </li>
            <li className="flex items-center">
              <ArrowRight className="h-5 w-5 mr-3 text-blue-400" />
              <span>Enterprise SSO with Microsoft and Google</span>
            </li>
          </ul>
          <p className="text-sm text-blue-200">
            Trusted by leading pharmaceutical companies, CROs, and biotechs worldwide.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
