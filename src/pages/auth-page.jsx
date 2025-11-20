import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Eye, EyeOff, User, Lock, UserPlus, LogIn, ArrowRight } from 'lucide-react';
import { useAuth } from '../hooks/use-auth';
import Layout from '../components/Layout';

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [credentials, setCredentials] = useState({
    username: '',
    password: '',
    confirm_password: '',
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, register, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      setLocation('/portal/client');
    }
  }, [isAuthenticated, setLocation]);

  const handleInputChange = e => {
    const { name, value } = e.target;
    setCredentials({
      ...credentials,
      [name]: value,
    });

    // Clear error for this field when user starts typing
    if (errors[name]) {
      setErrors({
        ...errors,
        [name]: '',
      });
    }
  };

  const validateForm = () => {
    const newErrors = {};

    // Validate username
    if (!credentials.username.trim()) {
      newErrors.username = 'Username is required';
    } else if (credentials.username.length < 3) {
      newErrors.username = 'Username must be at least 3 characters';
    }

    // Validate password
    if (!credentials.password) {
      newErrors.password = 'Password is required';
    } else if (credentials.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    // Validate password confirmation for registration
    if (!isLogin && credentials.password !== credentials.confirm_password) {
      newErrors.confirm_password = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async e => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      let success;

      if (isLogin) {
        // Login
        success = await login({
          username: credentials.username,
          password: credentials.password,
        });
      } else {
        // Register
        success = await register({
          username: credentials.username,
          password: credentials.password,
        });
      }

      if (success) {
        // Manual redirect instead of relying on useEffect
        setLocation('/portal/client');
      }
    } catch (error) {
      console.error('Authentication error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Layout hideNavigation>
      <div className="min-h-screen flex flex-col md:flex-row bg-gray-50">
        {/* Auth Form Section */}
        <div className="w-full md:w-1/2 flex items-center justify-center p-8">
          <div className="w-full max-w-md">
            <div className="text-center mb-10">
              <h1 className="text-3xl font-bold text-blue-800">
                {isLogin ? 'Welcome Back' : 'Create Account'}
              </h1>
              <p className="text-gray-600 mt-2">
                {isLogin
                  ? 'Sign in to access your TrialSage™ account'
                  : 'Register to get started with TrialSage™'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Username */}
              <div className="space-y-2">
                <label htmlFor="username" className="text-sm font-medium text-gray-700">
                  Username
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                    <User size={18} />
                  </span>
                  <input
                    id="username"
                    name="username"
                    type="text"
                    value={credentials.username}
                    onChange={handleInputChange}
                    className={`w-full pl-10 pr-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.username ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Enter your username"
                    disabled={isSubmitting}
                  />
                </div>
                {errors.username && <p className="text-sm text-red-600">{errors.username}</p>}
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium text-gray-700">
                  Password
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                    <Lock size={18} />
                  </span>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    value={credentials.password}
                    onChange={handleInputChange}
                    className={`w-full pl-10 pr-10 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      errors.password ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="Enter your password"
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {errors.password && <p className="text-sm text-red-600">{errors.password}</p>}
              </div>

              {/* Confirm Password (Registration only) */}
              {!isLogin && (
                <div className="space-y-2">
                  <label htmlFor="confirm_password" className="text-sm font-medium text-gray-700">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                      <Lock size={18} />
                    </span>
                    <input
                      id="confirm_password"
                      name="confirm_password"
                      type={showPassword ? 'text' : 'password'}
                      value={credentials.confirm_password}
                      onChange={handleInputChange}
                      className={`w-full pl-10 pr-4 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        errors.confirm_password ? 'border-red-500' : 'border-gray-300'
                      }`}
                      placeholder="Confirm your password"
                      disabled={isSubmitting}
                    />
                  </div>
                  {errors.confirm_password && (
                    <p className="text-sm text-red-600">{errors.confirm_password}</p>
                  )}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                ) : isLogin ? (
                  <>
                    <LogIn className="mr-2" size={18} />
                    Sign In
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2" size={18} />
                    Create Account
                  </>
                )}
              </button>

              {/* Toggle between Login and Register */}
              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsLogin(!isLogin);
                    setErrors({});
                  }}
                  className="text-blue-600 hover:text-blue-800 text-sm"
                >
                  {isLogin ? "Don't have an account? Register" : 'Already have an account? Sign in'}
                </button>
              </div>

              {/* Enterprise Team Signup */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <p className="text-gray-600 text-sm mb-2">Enterprise Customer?</p>
                <button
                  type="button"
                  onClick={() => setLocation('/team-signup')}
                  className="flex items-center justify-center mx-auto px-4 py-2 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-md text-sm"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Create Enterprise Team Account
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Hero Section */}
        <div className="hidden md:flex w-1/2 bg-blue-700 items-center justify-center p-12">
          <div className="max-w-md text-white">
            <h2 className="text-4xl font-bold mb-6">TrialSage™ Regulatory Writer</h2>
            <p className="text-xl mb-8">
              Accelerate your regulatory documentation with AI-powered workflows and intelligent
              templates.
            </p>
            <div className="space-y-4">
              <div className="flex items-start">
                <ArrowRight className="mr-2 mt-1 flex-shrink-0" />
                <p>Generate compliant regulatory documents in minutes, not days</p>
              </div>
              <div className="flex items-start">
                <ArrowRight className="mr-2 mt-1 flex-shrink-0" />
                <p>Access intelligent templates for FDA, EMA, and PMDA submissions</p>
              </div>
              <div className="flex items-start">
                <ArrowRight className="mr-2 mt-1 flex-shrink-0" />
                <p>Version control and document history with intelligent comparison</p>
              </div>
              <div className="flex items-start">
                <ArrowRight className="mr-2 mt-1 flex-shrink-0" />
                <p>24/7 compliance assistance with Ask Lumen, your AI compliance coach</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default AuthPage;
