/**
 * Concept2Cure Enterprise Sign-On Page
 * 
 * Features:
 * - Split-panel layout with brand panel and auth forms
 * - Multi-step flow: Email → Password → MFA → Organization Selection
 * - Enterprise SSO (Microsoft, Google) with domain detection
 * - Multi-organization support for CRO liaisons and consultants
 * - 21 CFR Part 11 compliant audit trail integration
 * - Trust badges (FDA, SOC 2, HIPAA)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Shield, Building2, Lock, Mail, Eye, EyeOff, AlertCircle, 
         CheckCircle, Loader2, ChevronRight, X, Clock, Users,
         Smartphone, Key, Globe, Fingerprint } from 'lucide-react';

// Brand colors
const COLORS = {
  navy: '#1a2e4a',
  gold: '#c9a227',
  darkGray: '#333333',
  lightGray: '#f8fafc',
  border: '#e2e8f0',
  success: '#059669',
  error: '#dc2626',
  warning: '#f59e0b',
};

// DNA Helix Animation Component
const DNAHelix = () => (
  <div className="absolute inset-0 overflow-hidden opacity-10">
    <svg className="w-full h-full" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="helixGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c9a227" />
          <stop offset="100%" stopColor="#1a2e4a" />
        </linearGradient>
      </defs>
      {[...Array(20)].map((_, i) => (
        <g key={i} className="animate-pulse" style={{ animationDelay: `${i * 0.1}s` }}>
          <circle
            cx={200 + Math.sin(i * 0.5) * 80}
            cy={i * 40}
            r={6}
            fill="url(#helixGrad)"
          />
          <circle
            cx={200 - Math.sin(i * 0.5) * 80}
            cy={i * 40}
            r={6}
            fill="url(#helixGrad)"
          />
          <line
            x1={200 + Math.sin(i * 0.5) * 80}
            y1={i * 40}
            x2={200 - Math.sin(i * 0.5) * 80}
            y2={i * 40}
            stroke="url(#helixGrad)"
            strokeWidth={2}
            opacity={0.5}
          />
        </g>
      ))}
    </svg>
  </div>
);

// Trust Badge Component
const TrustBadge = ({ icon: Icon, label, description }) => (
  <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-lg p-3">
    <div className="w-10 h-10 rounded-full bg-[#c9a227]/20 flex items-center justify-center">
      <Icon className="w-5 h-5 text-[#c9a227]" />
    </div>
    <div>
      <div className="text-white font-medium text-sm">{label}</div>
      <div className="text-white/60 text-xs">{description}</div>
    </div>
  </div>
);

// Organization Card Component
const OrganizationCard = ({ org, selected, onSelect, lastAccess }) => (
  <button
    onClick={() => onSelect(org)}
    className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
      selected
        ? 'border-[#c9a227] bg-[#c9a227]/5'
        : 'border-gray-200 hover:border-[#c9a227]/50 hover:bg-gray-50'
    }`}
  >
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
          org.type === 'CRO' ? 'bg-blue-100' :
          org.type === 'BIOTECH' ? 'bg-green-100' :
          org.type === 'PHARMA' ? 'bg-purple-100' :
          'bg-gray-100'
        }`}>
          <Building2 className={`w-6 h-6 ${
            org.type === 'CRO' ? 'text-blue-600' :
            org.type === 'BIOTECH' ? 'text-green-600' :
            org.type === 'PHARMA' ? 'text-purple-600' :
            'text-gray-600'
          }`} />
        </div>
        <div>
          <div className="font-semibold text-[#1a2e4a]">{org.name}</div>
          <div className="text-sm text-gray-500">{org.type}</div>
        </div>
      </div>
      {selected && (
        <CheckCircle className="w-5 h-5 text-[#c9a227]" />
      )}
    </div>
    {lastAccess && (
      <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
        <Clock className="w-3 h-3" />
        Last accessed {lastAccess}
      </div>
    )}
    <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
      <Users className="w-3 h-3" />
      {org.role}
    </div>
  </button>
);

// Main Sign-On Component
export default function EnterpriseSignOn() {
  const [, setLocation] = useLocation();
  
  // Auth flow state
  const [step, setStep] = useState('email'); // email | password | mfa | org-select
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(false);
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ssoProvider, setSsoProvider] = useState(null);
  
  // Organization state
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [showOrgModal, setShowOrgModal] = useState(false);

  // Demo organizations (would come from API in production)
  const demoOrganizations = [
    { id: 2, name: 'Concept2Cure', type: 'CONSULTING_FIRM', role: 'Admin' },
    { id: 6, name: 'Charles River Labs', type: 'CRO', role: 'CRO Liaison' },
    { id: 7, name: 'NovaBio Inc', type: 'BIOTECH', role: 'Consultant' },
    { id: 8, name: 'Global Therapeutics', type: 'PHARMA', role: 'External Reviewer' },
  ];

  // Check for SSO domain
  const checkSSODomain = useCallback((email) => {
    const domain = email.split('@')[1];
    if (!domain) return null;
    
    // Enterprise SSO domain mappings (would come from API)
    const ssoMappings = {
      'microsoft.com': 'microsoft',
      'google.com': 'google',
      // Add more enterprise domains
    };
    
    return ssoMappings[domain] || null;
  }, []);

  // Handle email submission
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Check for SSO domain
      const sso = checkSSODomain(email);
      if (sso) {
        setSsoProvider(sso);
        // In production, redirect to SSO provider
        setStep('sso-redirect');
        return;
      }

      // Validate email exists (would be API call)
      await new Promise(resolve => setTimeout(resolve, 500));
      setStep('password');
    } catch (err) {
      setError('Unable to verify email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle password submission
  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Call login API
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Invalid credentials');
      }

      // Check if MFA is required
      if (data.mfaRequired) {
        setStep('mfa');
        return;
      }

      // Check if user has multiple organizations
      if (data.user && data.organizations && data.organizations.length > 1) {
        setOrganizations(data.organizations);
        setStep('org-select');
        return;
      }

      // Single org - redirect to portal
      localStorage.setItem('token', data.token);
      setLocation('/client-portal');
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  // Handle MFA submission
  const handleMFASubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/verify-mfa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: mfaCode, rememberDevice }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Invalid MFA code');
      }

      // Check for multi-org
      if (data.organizations && data.organizations.length > 1) {
        setOrganizations(data.organizations);
        setStep('org-select');
        return;
      }

      localStorage.setItem('token', data.token);
      setLocation('/client-portal');
    } catch (err) {
      setError(err.message || 'MFA verification failed');
    } finally {
      setLoading(false);
    }
  };

  // Handle organization selection
  const handleOrgSelect = async () => {
    if (!selectedOrg) {
      setError('Please select an organization');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/select-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: selectedOrg.id }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to select organization');
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('currentOrg', JSON.stringify(selectedOrg));
      setLocation('/client-portal');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle SSO login
  const handleSSOLogin = (provider) => {
    setLoading(true);
    // In production, redirect to SSO endpoint
    window.location.href = `/api/auth/sso/${provider}/initiate`;
  };

  // Render different steps
  const renderStep = () => {
    switch (step) {
      case 'email':
        return (
          <form onSubmit={handleEmailSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Work Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#c9a227] focus:border-transparent outline-none transition-all"
                  required
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full py-3 bg-[#1a2e4a] text-white rounded-xl font-semibold hover:bg-[#1a2e4a]/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Continue
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">Or continue with</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSSOLogin('microsoft')}
                className="flex items-center justify-center gap-2 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
              >
                <svg className="w-5 h-5" viewBox="0 0 21 21">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
                </svg>
                <span className="text-sm font-medium text-gray-700">Microsoft</span>
              </button>
              <button
                type="button"
                onClick={() => handleSSOLogin('google')}
                className="flex items-center justify-center gap-2 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-all"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span className="text-sm font-medium text-gray-700">Google</span>
              </button>
            </div>
          </form>
        );

      case 'password':
        return (
          <form onSubmit={handlePasswordSubmit} className="space-y-6">
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
              <Mail className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-700">{email}</span>
              <button
                type="button"
                onClick={() => setStep('email')}
                className="ml-auto text-sm text-[#c9a227] hover:underline"
              >
                Change
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#c9a227] focus:border-transparent outline-none transition-all"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  className="w-4 h-4 text-[#c9a227] border-gray-300 rounded focus:ring-[#c9a227]"
                />
                <span className="text-sm text-gray-600">Remember this device</span>
              </label>
              <button
                type="button"
                className="text-sm text-[#c9a227] hover:underline"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3 bg-[#1a2e4a] text-white rounded-xl font-semibold hover:bg-[#1a2e4a]/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Sign In
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
        );

      case 'mfa':
        return (
          <form onSubmit={handleMFASubmit} className="space-y-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-[#c9a227]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Smartphone className="w-8 h-8 text-[#c9a227]" />
              </div>
              <h3 className="text-lg font-semibold text-[#1a2e4a]">Two-Factor Authentication</h3>
              <p className="text-sm text-gray-500 mt-1">
                Enter the 6-digit code from your authenticator app
              </p>
            </div>

            <div>
              <input
                type="text"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full text-center text-2xl tracking-[0.5em] py-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#c9a227] focus:border-transparent outline-none transition-all"
                maxLength={6}
                autoFocus
              />
            </div>

            <div className="flex items-center justify-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  className="w-4 h-4 text-[#c9a227] border-gray-300 rounded focus:ring-[#c9a227]"
                />
                <span className="text-sm text-gray-600">Trust this device for 30 days</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || mfaCode.length !== 6}
              className="w-full py-3 bg-[#1a2e4a] text-white rounded-xl font-semibold hover:bg-[#1a2e4a]/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Verify'
              )}
            </button>

            <div className="text-center">
              <button type="button" className="text-sm text-[#c9a227] hover:underline">
                Use a backup code instead
              </button>
            </div>
          </form>
        );

      case 'org-select':
        return (
          <div className="space-y-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-[#c9a227]/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-8 h-8 text-[#c9a227]" />
              </div>
              <h3 className="text-lg font-semibold text-[#1a2e4a]">Select Organization</h3>
              <p className="text-sm text-gray-500 mt-1">
                Choose which organization to access
              </p>
            </div>

            <div className="space-y-3 max-h-64 overflow-y-auto">
              {(organizations.length > 0 ? organizations : demoOrganizations).map((org) => (
                <OrganizationCard
                  key={org.id}
                  org={org}
                  selected={selectedOrg?.id === org.id}
                  onSelect={setSelectedOrg}
                  lastAccess={org.id === 2 ? '2 hours ago' : null}
                />
              ))}
            </div>

            <button
              onClick={handleOrgSelect}
              disabled={loading || !selectedOrg}
              className="w-full py-3 bg-[#1a2e4a] text-white rounded-xl font-semibold hover:bg-[#1a2e4a]/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Continue to {selectedOrg?.name || 'Portal'}
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Brand Panel - Left Side */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#1a2e4a] relative overflow-hidden">
        <DNAHelix />
        
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[#c9a227] rounded-xl flex items-center justify-center">
                <span className="text-[#1a2e4a] font-bold text-xl">C2C</span>
              </div>
              <div>
                <div className="text-white text-2xl font-bold">Concept2Cure</div>
                <div className="text-[#c9a227] text-sm">AI-Powered Regulatory Intelligence</div>
              </div>
            </div>
          </div>

          {/* Value Props */}
          <div className="space-y-6">
            <h1 className="text-4xl font-bold text-white leading-tight">
              Enterprise Regulatory
              <br />
              <span className="text-[#c9a227]">Intelligence Platform</span>
            </h1>
            <p className="text-white/70 text-lg max-w-md">
              Accelerate your regulatory submissions with AI-powered document generation, 
              real-time compliance monitoring, and intelligent workflow automation.
            </p>

            {/* Features */}
            <div className="grid grid-cols-2 gap-4 mt-8">
              <div className="flex items-center gap-3 text-white/80">
                <CheckCircle className="w-5 h-5 text-[#c9a227]" />
                <span>eCTD Document Generation</span>
              </div>
              <div className="flex items-center gap-3 text-white/80">
                <CheckCircle className="w-5 h-5 text-[#c9a227]" />
                <span>Real-time Compliance</span>
              </div>
              <div className="flex items-center gap-3 text-white/80">
                <CheckCircle className="w-5 h-5 text-[#c9a227]" />
                <span>Multi-Agency Support</span>
              </div>
              <div className="flex items-center gap-3 text-white/80">
                <CheckCircle className="w-5 h-5 text-[#c9a227]" />
                <span>AI-Powered Insights</span>
              </div>
            </div>
          </div>

          {/* Trust Badges */}
          <div className="space-y-3">
            <TrustBadge
              icon={Shield}
              label="21 CFR Part 11"
              description="FDA Electronic Records Compliant"
            />
            <TrustBadge
              icon={Lock}
              label="SOC 2 Type II"
              description="Enterprise Security Certified"
            />
            <TrustBadge
              icon={Globe}
              label="HIPAA Compliant"
              description="Healthcare Data Protection"
            />
          </div>
        </div>
      </div>

      {/* Auth Panel - Right Side */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8 text-center">
            <div className="flex items-center justify-center gap-3">
              <div className="w-10 h-10 bg-[#1a2e4a] rounded-xl flex items-center justify-center">
                <span className="text-[#c9a227] font-bold text-lg">C2C</span>
              </div>
              <div className="text-2xl font-bold text-[#1a2e4a]">Concept2Cure</div>
            </div>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-[#1a2e4a]">
              {step === 'org-select' ? 'Select Organization' : 'Welcome back'}
            </h2>
            <p className="text-gray-500 mt-1">
              {step === 'email' && 'Sign in to your Concept2Cure account'}
              {step === 'password' && 'Enter your password to continue'}
              {step === 'mfa' && 'Complete two-factor authentication'}
              {step === 'org-select' && 'Choose which organization to access'}
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
              <div>
                <div className="font-medium text-red-800">Authentication Error</div>
                <div className="text-sm text-red-600">{error}</div>
              </div>
              <button onClick={() => setError('')} className="ml-auto">
                <X className="w-5 h-5 text-red-400 hover:text-red-600" />
              </button>
            </div>
          )}

          {/* Step Content */}
          {renderStep()}

          {/* Footer */}
          <div className="mt-8 text-center text-sm text-gray-500">
            <p>
              Don't have an account?{' '}
              <button className="text-[#c9a227] font-medium hover:underline">
                Request Access
              </button>
            </p>
            <p className="mt-4 text-xs">
              By signing in, you agree to our{' '}
              <a href="#" className="text-[#c9a227] hover:underline">Terms of Service</a>
              {' '}and{' '}
              <a href="#" className="text-[#c9a227] hover:underline">Privacy Policy</a>
            </p>
          </div>

          {/* Mobile Trust Badges */}
          <div className="lg:hidden mt-8 flex items-center justify-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Shield className="w-4 h-4" /> 21 CFR Part 11
            </span>
            <span className="flex items-center gap-1">
              <Lock className="w-4 h-4" /> SOC 2
            </span>
            <span className="flex items-center gap-1">
              <Globe className="w-4 h-4" /> HIPAA
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
