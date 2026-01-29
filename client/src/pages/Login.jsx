import { Redirect } from 'wouter';

/**
 * @deprecated Legacy login page. Use Concept2Cure Zen login at /concept2cure/login.
 */
export default function Login() {
  return <Redirect to="/concept2cure/login" />;
}

/*
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowRight,
  Lock,
  Mail,
  ShieldCheck,
  Chrome,
  Building2,
  UserPlus,
  Network,
  Users,
} from 'lucide-react';
import { authService } from '@/services/authService';

const Colors = {
  primary: '#2563eb',
  primaryHover: '#1d4ed8',
};

export default function Login({ onLoginSuccess }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const isValid = useMemo(() => email.trim().length > 0 && password.trim().length > 0, [email, password]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const token = params.get('token');

    if (error) {
      toast({
        title: 'SSO failed',
        description: 'Single sign-on could not be completed. Please try again.',
        variant: 'destructive',
      });
      window.history.replaceState({}, '', '/login');
      return;
    }

    if (token) {
      localStorage.setItem('token', token);
      localStorage.setItem('authToken', token);
      localStorage.setItem('auth_token', token);
      toast({
        title: 'Login successful',
        description: 'Redirecting to your client portal…',
      });
      onLoginSuccess?.();
      window.history.replaceState({}, '', '/login');
      setTimeout(() => setLocation('/client-portal'), 500);
    }
  }, [onLoginSuccess, setLocation, toast]);

  const handleLogin = async event => {
    event.preventDefault();
    if (!isValid || loading) return;
    setErrorMessage('');
    setLoading(true);
    try {
      const username = email.includes('@') ? email.split('@')[0] : email;
      const result = await authService.login({
        email,
        username,
        password,
      });

      if (!result?.token) {
        throw new Error(result?.message || 'Login failed.');
      }

      localStorage.setItem('token', result.token);
      localStorage.setItem('authToken', result.token);
      localStorage.setItem('auth_token', result.token);

      toast({
        title: 'Login successful',
        description: 'Redirecting to your client portal…',
      });

      onLoginSuccess?.();
      setTimeout(() => setLocation('/client-portal'), 600);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in.';
      setErrorMessage(message);
      toast({
        title: 'Login failed',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSSO = async provider => {
    try {
      toast({
        title: `Connecting to ${provider}`,
        description: 'Opening single sign-on…',
      });
      const response = await fetch(`/api/auth/sso/${provider.toLowerCase()}/url`);
      const payload = await response.json();
      if (!payload?.authUrl) {
        throw new Error(payload?.message || `${provider} SSO is not configured.`);
      }
      window.location.href = payload.authUrl;
    } catch (error) {
      toast({
        title: 'SSO unavailable',
        description: error instanceof Error ? error.message : 'Unable to start SSO flow.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-6xl grid gap-8 lg:grid-cols-[1.05fr_0.95fr] items-start">
        <Card className="w-full border-0 shadow-[0_12px_30px_rgba(15,23,42,0.1)] rounded-2xl">
          <CardContent className="p-10">
          <div className="text-center mb-10">
            <div
              className="mx-auto mb-4 h-14 w-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold"
              style={{ background: `linear-gradient(135deg, ${Colors.primary} 0%, ${Colors.primaryHover} 100%)` }}
            >
              C2C
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Concept2Cure</h1>
            <p className="mt-2 text-sm text-slate-500">Regulatory Intelligence Platform</p>
          </div>

          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              className="w-full h-12 gap-3"
              onClick={() => handleSSO('Microsoft')}
            >
              <Building2 className="h-5 w-5 text-slate-600" />
              Continue with Microsoft
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full h-12 gap-3"
              onClick={() => handleSSO('Google')}
            >
              <Chrome className="h-5 w-5 text-red-500" />
              Continue with Google
            </Button>
          </div>

          <div className="my-6">
            <div className="relative">
              <Separator />
              <span className="absolute left-1/2 -translate-x-1/2 -top-2 bg-white px-3 text-xs text-slate-500">
                or sign in with email
              </span>
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleLogin}>
            {errorMessage ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm text-slate-600">
                Email address
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="your.email@company.com"
                  className="pl-10 h-12"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm text-slate-600">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  className="pl-10 h-12"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold"
              style={{ backgroundColor: Colors.primary }}
              disabled={!isValid || loading}
            >
              {loading ? 'Signing in…' : 'Sign In'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>

          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="mt-1 h-9 w-9 rounded-lg bg-white flex items-center justify-center border border-slate-200">
                <UserPlus className="h-4 w-4 text-slate-700" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-900">New client onboarding</h3>
                <p className="mt-1 text-xs text-slate-600">
                  Request access and we'll route your onboarding to licensing and admin approval.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 h-9 w-full"
                  onClick={() => setLocation('/request-access')}
                >
                  Request access
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-6 text-center text-xs uppercase tracking-[0.2em] text-slate-400">
            Need an account?
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full h-12 mt-3"
            onClick={() => setLocation('/request-access')}
          >
            Request Access for Your Organization
          </Button>
          <div className="mt-3 text-center text-xs text-slate-500">
            Existing client admin?{' '}
            <button
              type="button"
              className="text-slate-600 hover:underline"
              onClick={() => setLocation('/login')}
            >
              Sign in here
            </button>
          </div>

          <div className="mt-6 text-center text-xs text-slate-500">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </div>

          <div className="mt-8 border-t pt-6 text-center">
            <div className="flex flex-wrap justify-center gap-4 text-xs text-slate-500">
              <a href="/help" className="hover:text-slate-600">
                Help Center
              </a>
              <a href="/privacy" className="hover:text-slate-600">
                Privacy
              </a>
              <a href="/terms" className="hover:text-slate-600">
                Terms
              </a>
              <a href="mailto:support@concept2cure.com" className="hover:text-slate-600">
                Contact Support
              </a>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4" />
            Enterprise-grade security for regulated programs
          </div>
          </CardContent>
        </Card>

        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center">
              <ShieldCheck className="h-6 w-6 text-slate-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Enterprise access control</h2>
              <p className="text-sm text-slate-600">
                Secure multi-tenant login for CROs, biotech sponsors, and consultants.
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <Network className="mt-0.5 h-5 w-5 text-slate-700" />
              <div>
                <p className="text-sm font-semibold text-slate-900">CRO parent → child hierarchy</p>
                <p className="text-xs text-slate-600">
                  Govern multiple biotech clients with inherited policies and project-level security.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <Users className="mt-0.5 h-5 w-5 text-slate-700" />
              <div>
                <p className="text-sm font-semibold text-slate-900">User onboarding & entitlements</p>
                <p className="text-xs text-slate-600">
                  Provision teams, contractors, and consultants with scoped permissions.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 text-slate-700" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Enterprise security controls</p>
                <p className="text-xs text-slate-600">
                  SSO, MFA, audit logs, and policy enforcement aligned to regulated programs.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

*/
