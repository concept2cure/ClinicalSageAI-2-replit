/**
 * Authentication Page
 *
 * This page handles user login and registration for the TrialSage platform.
 */

import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useIntegration } from '../components/integration/ModuleIntegrationLayer';
import { Shield, User, Lock, Mail, ChevronRight, ArrowRight } from 'lucide-react';

const AuthPage = () => {
  const [activeForm, setActiveForm] = useState('login');
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
    confirmPassword: '',
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const { isAuthenticated, login } = useIntegration();
  const [location, setLocation] = useLocation();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated()) {
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
      // In a real app, this would call the login API
      const { username, password } = formData;

      // Use the login function from useIntegration
      const result = await login({ username, password });

      if (result.success) {
        setLocation('/');
      } else {
        setError(result.error || 'Invalid username or password');
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
              placeholder="Enter your username"
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
            <h2 className="text-3xl font-extrabold text-gray-900">
              {activeForm === 'login' ? 'Sign in to your account' : 'Create a new account'}
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              {activeForm === 'login'
                ? 'Enter your credentials to access TrialSage platform'
                : 'Join the TrialSage platform to streamline your regulatory processes'}
            </p>
          </div>

          <div className="mt-8">
            {activeForm === 'login' ? renderLoginForm() : renderRegisterForm()}
          </div>
        </div>
      </div>

      {/* Hero Side */}
      <div className="hidden lg:flex lg:flex-1 bg-black relative">
        <div className="absolute inset-0 opacity-50">
          <img
            src="https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?q=80&w=1470&auto=format&fit=crop"
            alt="Laboratory background"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="relative z-10 flex flex-col items-start justify-center px-12 py-24 text-white">
          <div className="mb-8 bg-primary p-4 rounded-full">
            <Shield size={40} />
          </div>
          <h1 className="text-4xl font-bold mb-4">TrialSage™ Platform</h1>
          <p className="text-xl mb-8 max-w-lg">
            Streamline your regulatory submissions with our AI-powered platform for clinical
            research professionals.
          </p>
          <ul className="space-y-4 mb-8">
            <li className="flex items-center">
              <ArrowRight className="h-5 w-5 mr-3 text-primary" />
              <span>Secure document management with blockchain verification</span>
            </li>
            <li className="flex items-center">
              <ArrowRight className="h-5 w-5 mr-3 text-primary" />
              <span>Automated Clinical Study Report generation</span>
            </li>
            <li className="flex items-center">
              <ArrowRight className="h-5 w-5 mr-3 text-primary" />
              <span>Streamlined IND application process</span>
            </li>
            <li className="flex items-center">
              <ArrowRight className="h-5 w-5 mr-3 text-primary" />
              <span>Intelligent protocol development tools</span>
            </li>
          </ul>
          <p className="text-sm text-gray-300">
            Trusted by leading pharmaceutical companies, CROs, and biotechs worldwide.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
