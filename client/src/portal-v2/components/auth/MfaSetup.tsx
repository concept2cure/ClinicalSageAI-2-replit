/**
 * Concept2Cure Client Portal V2 - MFA Setup & Management
 *
 * Multi-factor authentication setup wizard supporting:
 * - TOTP (Google Authenticator, Authy)
 * - Hardware security keys (YubiKey, FIDO2)
 * - Biometric authentication
 * - SMS/Email backup codes
 *
 * @version 2.0.0
 * @compliance FDA 21 CFR Part 11.10(d), NIST 800-63B
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Smartphone,
  Key,
  Fingerprint,
  Shield,
  ShieldCheck,
  ShieldPlus,
  ShieldAlert,
  ShieldX,
  QrCode,
  Copy,
  Check,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  Printer,
  RefreshCw,
  Loader2,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Settings,
  HelpCircle,
  Info,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { MfaMethod } from '../../core/securityTypes';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

interface MfaMethodStatus {
  method: MfaMethod;
  enabled: boolean;
  isPrimary: boolean;
  configuredAt?: Date;
  lastUsedAt?: Date;
  deviceName?: string;
}

interface BackupCode {
  code: string;
  used: boolean;
  usedAt?: Date;
}

type SetupStep = 'select' | 'configure' | 'verify' | 'backup' | 'complete';

interface MfaSetupState {
  step: SetupStep;
  selectedMethod: MfaMethod | null;
  totpSecret?: string;
  totpQrCode?: string;
  verificationCode: string;
  backupCodes: BackupCode[];
  isLoading: boolean;
  error: string | null;
}

interface HardwareKeyInfo {
  id: string;
  name: string;
  credentialId: string;
  registeredAt: Date;
  lastUsedAt?: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const MFA_METHOD_DETAILS: Record<
  MfaMethod,
  {
    label: string;
    description: string;
    securityLevel: 'high' | 'medium' | 'low';
    icon: React.ComponentType<{ className?: string }>;
    setupTime: string;
    requirements: string[];
    recommended?: boolean;
  }
> = {
  totp: {
    label: 'Authenticator App',
    description: 'Use time-based one-time passwords from apps like Google Authenticator or Authy',
    securityLevel: 'high',
    icon: Smartphone,
    setupTime: '2 minutes',
    requirements: ['Smartphone with authenticator app installed'],
    recommended: true,
  },
  hardware_key: {
    label: 'Hardware Security Key',
    description: 'Use a physical security key like YubiKey for the strongest protection',
    securityLevel: 'high',
    icon: Key,
    setupTime: '1 minute',
    requirements: ['FIDO2/WebAuthn compatible security key', 'USB port or NFC capability'],
    recommended: true,
  },
  biometric: {
    label: 'Biometric Authentication',
    description: 'Use fingerprint or face recognition on compatible devices',
    securityLevel: 'high',
    icon: Fingerprint,
    setupTime: '1 minute',
    requirements: ['Device with fingerprint reader or camera', 'Platform authenticator support'],
  },
  sms: {
    label: 'SMS Verification',
    description: 'Receive verification codes via text message to your phone',
    securityLevel: 'medium',
    icon: Smartphone,
    setupTime: '1 minute',
    requirements: ['Mobile phone with SMS capability'],
  },
  email: {
    label: 'Email Verification',
    description: 'Receive verification codes via email',
    securityLevel: 'low',
    icon: Smartphone,
    setupTime: '1 minute',
    requirements: ['Access to your registered email'],
  },
};

const SECURITY_LEVEL_COLORS = {
  high: 'text-green-600 bg-green-100',
  medium: 'text-amber-600 bg-amber-100',
  low: 'text-red-600 bg-red-100',
};

// ─────────────────────────────────────────────────────────────────────────────
// MFA OVERVIEW COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export const MfaOverview: React.FC<{
  methods: MfaMethodStatus[];
  onSetup: (method: MfaMethod) => void;
  onRemove: (method: MfaMethod) => void;
  onSetPrimary: (method: MfaMethod) => void;
  onRegenerateBackupCodes: () => void;
  backupCodesRemaining: number;
}> = ({
  methods,
  onSetup,
  onRemove,
  onSetPrimary,
  onRegenerateBackupCodes,
  backupCodesRemaining,
}) => {
  const enabledMethods = methods.filter(m => m.enabled);
  const availableMethods = (Object.keys(MFA_METHOD_DETAILS) as MfaMethod[]).filter(
    method => !methods.find(m => m.method === method && m.enabled)
  );

  const securityScore = enabledMethods.reduce((score, method) => {
    const details = MFA_METHOD_DETAILS[method.method];
    if (details.securityLevel === 'high') return score + 35;
    if (details.securityLevel === 'medium') return score + 20;
    return score + 10;
  }, 0);

  return (
    <div className="space-y-6">
      {/* Security Score */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">MFA Security Score</CardTitle>
            <Badge
              variant={
                securityScore >= 70 ? 'default' : securityScore >= 40 ? 'secondary' : 'destructive'
              }
            >
              {securityScore >= 70
                ? 'Excellent'
                : securityScore >= 40
                  ? 'Good'
                  : 'Needs Improvement'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Security Level</span>
              <span className="font-medium">{Math.min(securityScore, 100)}%</span>
            </div>
            <Progress value={Math.min(securityScore, 100)} className="h-2" />
          </div>
          {securityScore < 70 && (
            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                FDA 21 CFR Part 11 recommends multiple authentication factors. Consider adding a
                hardware key or authenticator app.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Enabled Methods */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-green-600" />
            Active Authentication Methods
          </CardTitle>
          <CardDescription>Methods currently protecting your account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {enabledMethods.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ShieldAlert className="h-12 w-12 mx-auto mb-3 text-amber-500" />
              <p className="font-medium">No MFA methods configured</p>
              <p className="text-sm">Your account is protected by password only</p>
            </div>
          ) : (
            enabledMethods.map(status => {
              const details = MFA_METHOD_DETAILS[status.method];
              const Icon = details.icon;
              return (
                <div
                  key={status.method}
                  className="flex items-center justify-between p-4 rounded-lg border"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`p-2 rounded-lg ${SECURITY_LEVEL_COLORS[details.securityLevel]}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{details.label}</p>
                        {status.isPrimary && (
                          <Badge variant="default" className="text-xs">
                            Primary
                          </Badge>
                        )}
                      </div>
                      {status.deviceName && (
                        <p className="text-sm text-muted-foreground">{status.deviceName}</p>
                      )}
                      {status.lastUsedAt && (
                        <p className="text-xs text-muted-foreground">
                          Last used: {new Date(status.lastUsedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!status.isPrimary && enabledMethods.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => onSetPrimary(status.method)}>
                        Set Primary
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onRemove(status.method)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Backup Codes */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="h-5 w-5" />
            Backup Codes
          </CardTitle>
          <CardDescription>
            Emergency access codes if you lose your primary MFA device
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">
                Remaining codes: <span className="font-medium">{backupCodesRemaining}</span> of 10
              </p>
              {backupCodesRemaining <= 2 && (
                <p className="text-xs text-amber-600 mt-1">Consider generating new codes soon</p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={onRegenerateBackupCodes}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Generate New Codes
            </Button>
          </div>
          <Progress value={(backupCodesRemaining / 10) * 100} className="h-2 mt-3" />
        </CardContent>
      </Card>

      {/* Add New Method */}
      {availableMethods.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldPlus className="h-5 w-5" />
              Add Authentication Method
            </CardTitle>
            <CardDescription>
              Strengthen your account security with additional factors
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {availableMethods.map(method => {
              const details = MFA_METHOD_DETAILS[method];
              const Icon = details.icon;
              return (
                <button
                  key={method}
                  onClick={() => onSetup(method)}
                  className="flex items-start gap-3 p-4 rounded-lg border hover:border-primary hover:bg-muted/50 text-left transition-colors"
                >
                  <div className={`p-2 rounded-lg ${SECURITY_LEVEL_COLORS[details.securityLevel]}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{details.label}</p>
                      {details.recommended && (
                        <Badge variant="secondary" className="text-xs">
                          Recommended
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {details.description}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Setup time: {details.setupTime}
                    </p>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TOTP SETUP COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const TotpSetup: React.FC<{
  secret: string;
  qrCodeUrl: string;
  verificationCode: string;
  onCodeChange: (code: string) => void;
  onVerify: () => void;
  isLoading: boolean;
  error: string | null;
}> = ({ secret, qrCodeUrl, verificationCode, onCodeChange, onVerify, isLoading, error }) => {
  const [copied, setCopied] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const handleCopySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center flex-shrink-0 text-sm font-bold">
            1
          </div>
          <div>
            <p className="font-medium">Download an authenticator app</p>
            <p className="text-sm text-muted-foreground">
              If you haven't already, download Google Authenticator, Authy, or Microsoft
              Authenticator
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center flex-shrink-0 text-sm font-bold">
            2
          </div>
          <div>
            <p className="font-medium">Scan this QR code</p>
            <p className="text-sm text-muted-foreground">
              Open your authenticator app and scan the code below
            </p>
          </div>
        </div>
      </div>

      {/* QR Code */}
      <div className="flex justify-center">
        <div className="p-4 bg-white rounded-xl border-2">
          <img src={qrCodeUrl} alt="TOTP QR Code" className="w-48 h-48" />
        </div>
      </div>

      {/* Manual Entry */}
      <div className="space-y-2">
        <Label>Can't scan? Enter this code manually:</Label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Input
              type={showSecret ? 'text' : 'password'}
              value={secret}
              readOnly
              className="font-mono pr-20"
            />
            <div className="absolute right-1 top-1 flex">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={handleCopySecret}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Verification */}
      <div className="space-y-4 pt-4 border-t">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center flex-shrink-0 text-sm font-bold">
            3
          </div>
          <div className="flex-1">
            <p className="font-medium">Enter verification code</p>
            <p className="text-sm text-muted-foreground mb-4">
              Enter the 6-digit code from your authenticator app
            </p>
            <div className="flex gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Input
                  key={i}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={verificationCode[i] || ''}
                  onChange={e => {
                    const newCode = verificationCode.split('');
                    newCode[i] = e.target.value;
                    onCodeChange(newCode.join(''));
                    if (e.target.value && i < 5) {
                      const next = e.target.nextElementSibling as HTMLInputElement;
                      next?.focus();
                    }
                  }}
                  className="w-12 h-14 text-center text-xl font-mono"
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        onClick={onVerify}
        disabled={verificationCode.length < 6 || isLoading}
        className="w-full"
      >
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle className="mr-2 h-4 w-4" />
        )}
        Verify and Enable
      </Button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// HARDWARE KEY SETUP COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const HardwareKeySetup: React.FC<{
  onRegister: () => void;
  isLoading: boolean;
  error: string | null;
  registeredKeys: HardwareKeyInfo[];
}> = ({ onRegister, isLoading, error, registeredKeys }) => {
  const [keyName, setKeyName] = useState('');

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="rounded-lg border bg-muted/50 p-4">
        <h4 className="font-medium mb-2">Supported Security Keys</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• YubiKey 5 series (USB-A, USB-C, NFC)</li>
          <li>• Google Titan Security Key</li>
          <li>• Feitian ePass FIDO</li>
          <li>• Any FIDO2/WebAuthn compatible key</li>
        </ul>
      </div>

      {/* Existing Keys */}
      {registeredKeys.length > 0 && (
        <div className="space-y-3">
          <Label>Registered Security Keys</Label>
          {registeredKeys.map(key => (
            <div key={key.id} className="flex items-center justify-between p-3 rounded-lg border">
              <div className="flex items-center gap-3">
                <Key className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{key.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Registered: {new Date(key.registeredAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <Badge variant="secondary">Active</Badge>
            </div>
          ))}
        </div>
      )}

      {/* Register New Key */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="key-name">Security Key Name</Label>
          <Input
            id="key-name"
            value={keyName}
            onChange={e => setKeyName(e.target.value)}
            placeholder="e.g., YubiKey 5C NFC - Work"
          />
          <p className="text-xs text-muted-foreground">
            Give your key a recognizable name to identify it later
          </p>
        </div>

        <div className="p-8 rounded-lg border-2 border-dashed text-center">
          <Key className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="font-medium">Ready to register security key</p>
          <p className="text-sm text-muted-foreground mt-1">
            Click the button below and follow your browser's prompts
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button onClick={onRegister} disabled={!keyName || isLoading} className="w-full">
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Key className="mr-2 h-4 w-4" />
          )}
          Register Security Key
        </Button>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// BIOMETRIC SETUP COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const BiometricSetup: React.FC<{
  onRegister: () => void;
  isLoading: boolean;
  error: string | null;
  isSupported: boolean;
}> = ({ onRegister, isLoading, error, isSupported }) => {
  if (!isSupported) {
    return (
      <div className="text-center py-8">
        <ShieldX className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">Biometric Not Available</h3>
        <p className="text-muted-foreground mt-2 max-w-md mx-auto">
          Your device or browser doesn't support platform biometric authentication. Try using a
          device with Touch ID, Face ID, Windows Hello, or similar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-muted/50 p-4">
        <h4 className="font-medium mb-2">Supported Methods</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• Apple Touch ID / Face ID</li>
          <li>• Windows Hello (fingerprint, face, PIN)</li>
          <li>• Android fingerprint</li>
          <li>• Chrome OS fingerprint</li>
        </ul>
      </div>

      <div className="p-8 rounded-lg border-2 border-dashed text-center">
        <Fingerprint className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
        <p className="font-medium">Register your biometric</p>
        <p className="text-sm text-muted-foreground mt-1">
          Click below and follow your device's prompts
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button onClick={onRegister} disabled={isLoading} className="w-full">
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Fingerprint className="mr-2 h-4 w-4" />
        )}
        Register Biometric
      </Button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// BACKUP CODES DISPLAY
// ─────────────────────────────────────────────────────────────────────────────

const BackupCodesDisplay: React.FC<{
  codes: BackupCode[];
  onDownload: () => void;
  onPrint: () => void;
  onContinue: () => void;
}> = ({ codes, onDownload, onPrint, onContinue }) => {
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyAll = () => {
    const codeText = codes.map(c => c.code).join('\n');
    navigator.clipboard.writeText(codeText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Save your backup codes</AlertTitle>
        <AlertDescription>
          These codes can be used to access your account if you lose your MFA device. Each code can
          only be used once. Store them securely.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-lg font-mono text-sm">
        {codes.map((code, index) => (
          <div
            key={index}
            className={`p-2 rounded ${code.used ? 'line-through text-muted-foreground' : ''}`}
          >
            {code.code}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={handleCopyAll}>
          {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
          {copied ? 'Copied!' : 'Copy All'}
        </Button>
        <Button variant="outline" className="flex-1" onClick={onDownload}>
          <Download className="mr-2 h-4 w-4" />
          Download
        </Button>
        <Button variant="outline" className="flex-1" onClick={onPrint}>
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </div>

      <div className="flex items-start gap-3 p-4 rounded-lg border">
        <input
          type="checkbox"
          id="acknowledge"
          checked={acknowledged}
          onChange={e => setAcknowledged(e.target.checked)}
          className="mt-1"
        />
        <label htmlFor="acknowledge" className="text-sm cursor-pointer">
          I have saved my backup codes in a secure location. I understand that if I lose access to
          my MFA device and these codes, I may permanently lose access to my account.
        </label>
      </div>

      <Button onClick={onContinue} disabled={!acknowledged} className="w-full">
        <CheckCircle className="mr-2 h-4 w-4" />
        Continue
      </Button>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN MFA SETUP WIZARD
// ─────────────────────────────────────────────────────────────────────────────

export const MfaSetupWizard: React.FC<{
  open: boolean;
  onClose: () => void;
  onComplete: (method: MfaMethod) => void;
  availableMethods: MfaMethod[];
  currentPassword?: string;
}> = ({ open, onClose, onComplete, availableMethods, currentPassword }) => {
  const [state, setState] = useState<MfaSetupState>({
    step: 'select',
    selectedMethod: null,
    verificationCode: '',
    backupCodes: [],
    isLoading: false,
    error: null,
  });

  const [hardwareKeys, setHardwareKeys] = useState<HardwareKeyInfo[]>([]);
  const [biometricSupported, setBiometricSupported] = useState(true);

  // Check biometric support
  useEffect(() => {
    if (window.PublicKeyCredential) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then(available => setBiometricSupported(available))
        .catch(() => setBiometricSupported(false));
    } else {
      setBiometricSupported(false);
    }
  }, []);

  const handleSelectMethod = useCallback(async (method: MfaMethod) => {
    setState(prev => ({ ...prev, selectedMethod: method, step: 'configure', isLoading: true }));

    try {
      // Generate setup data based on method
      if (method === 'totp') {
        // TODO: Call API to generate TOTP secret
        await new Promise(r => setTimeout(r, 500));
        setState(prev => ({
          ...prev,
          totpSecret: 'JBSWY3DPEHPK3PXP', // Mock secret
          totpQrCode:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          isLoading: false,
        }));
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Failed to initialize setup. Please try again.',
        isLoading: false,
      }));
    }
  }, []);

  const handleVerifyTotp = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // TODO: Call API to verify TOTP code
      await new Promise(r => setTimeout(r, 800));

      // Generate backup codes
      const backupCodes: BackupCode[] = Array.from({ length: 10 }, () => ({
        code: Math.random().toString(36).substring(2, 10).toUpperCase(),
        used: false,
      }));

      setState(prev => ({
        ...prev,
        backupCodes,
        step: 'backup',
        isLoading: false,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Invalid verification code. Please try again.',
        isLoading: false,
        verificationCode: '',
      }));
    }
  }, [state.verificationCode]);

  const handleRegisterHardwareKey = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // TODO: Implement WebAuthn registration
      await new Promise(r => setTimeout(r, 1000));

      // Generate backup codes
      const backupCodes: BackupCode[] = Array.from({ length: 10 }, () => ({
        code: Math.random().toString(36).substring(2, 10).toUpperCase(),
        used: false,
      }));

      setState(prev => ({
        ...prev,
        backupCodes,
        step: 'backup',
        isLoading: false,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Failed to register security key. Please try again.',
        isLoading: false,
      }));
    }
  }, []);

  const handleRegisterBiometric = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // TODO: Implement biometric registration
      await new Promise(r => setTimeout(r, 1000));

      // Generate backup codes
      const backupCodes: BackupCode[] = Array.from({ length: 10 }, () => ({
        code: Math.random().toString(36).substring(2, 10).toUpperCase(),
        used: false,
      }));

      setState(prev => ({
        ...prev,
        backupCodes,
        step: 'backup',
        isLoading: false,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: 'Failed to register biometric. Please try again.',
        isLoading: false,
      }));
    }
  }, []);

  const handleDownloadCodes = useCallback(() => {
    const content = state.backupCodes.map(c => c.code).join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trialsage-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }, [state.backupCodes]);

  const handlePrintCodes = useCallback(() => {
    const printWindow = window.open('', '', 'width=400,height=600');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head><title>Concept2Cure Backup Codes</title></head>
          <body style="font-family: monospace; padding: 20px;">
            <h2>Concept2Cure Backup Codes</h2>
            <p>Keep these codes in a safe place. Each code can only be used once.</p>
            <ul style="list-style: none; padding: 0;">
              ${state.backupCodes.map(c => `<li style="padding: 5px 0;">${c.code}</li>`).join('')}
            </ul>
            <p style="margin-top: 20px; font-size: 12px;">
              Generated: ${new Date().toLocaleString()}
            </p>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  }, [state.backupCodes]);

  const handleComplete = useCallback(() => {
    setState(prev => ({ ...prev, step: 'complete' }));
    setTimeout(() => {
      onComplete(state.selectedMethod!);
      setState({
        step: 'select',
        selectedMethod: null,
        verificationCode: '',
        backupCodes: [],
        isLoading: false,
        error: null,
      });
    }, 1500);
  }, [state.selectedMethod, onComplete]);

  const handleBack = useCallback(() => {
    setState(prev => ({
      ...prev,
      step: 'select',
      selectedMethod: null,
      verificationCode: '',
      error: null,
    }));
  }, []);

  return (
    <Dialog open={open} onOpenChange={isOpen => !isOpen && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            {state.step === 'select' && 'Add Authentication Method'}
            {state.step === 'configure' &&
              `Setup ${state.selectedMethod ? MFA_METHOD_DETAILS[state.selectedMethod].label : ''}`}
            {state.step === 'backup' && 'Save Backup Codes'}
            {state.step === 'complete' && 'Setup Complete'}
          </DialogTitle>
          <DialogDescription>
            {state.step === 'select' &&
              'Choose an additional authentication method to secure your account'}
            {state.step === 'configure' && 'Follow the steps below to complete setup'}
            {state.step === 'backup' && 'Save these emergency access codes in a secure location'}
            {state.step === 'complete' && 'Your new authentication method is ready'}
          </DialogDescription>
        </DialogHeader>

        {/* Progress indicator */}
        {state.step !== 'complete' && (
          <div className="flex gap-1 my-4">
            {['select', 'configure', 'backup'].map((step, index) => (
              <div
                key={step}
                className={`flex-1 h-1 rounded-full ${
                  ['select', 'configure', 'backup'].indexOf(state.step) >= index
                    ? 'bg-primary'
                    : 'bg-muted'
                }`}
              />
            ))}
          </div>
        )}

        {/* Step Content */}
        <div className="py-4">
          {/* Method Selection */}
          {state.step === 'select' && (
            <div className="space-y-3">
              {availableMethods.map(method => {
                const details = MFA_METHOD_DETAILS[method];
                const Icon = details.icon;
                return (
                  <button
                    key={method}
                    onClick={() => handleSelectMethod(method)}
                    disabled={state.isLoading}
                    className="w-full flex items-start gap-4 p-4 rounded-lg border hover:border-primary hover:bg-muted/50 text-left transition-colors disabled:opacity-50"
                  >
                    <div
                      className={`p-3 rounded-lg ${SECURITY_LEVEL_COLORS[details.securityLevel]}`}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{details.label}</p>
                        {details.recommended && (
                          <Badge variant="secondary" className="text-xs">
                            Recommended
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{details.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Security: {details.securityLevel}</span>
                        <span>•</span>
                        <span>Setup: {details.setupTime}</span>
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          )}

          {/* TOTP Configuration */}
          {state.step === 'configure' && state.selectedMethod === 'totp' && (
            <>
              <Button variant="ghost" size="sm" onClick={handleBack} className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <TotpSetup
                secret={state.totpSecret || ''}
                qrCodeUrl={state.totpQrCode || ''}
                verificationCode={state.verificationCode}
                onCodeChange={code => setState(prev => ({ ...prev, verificationCode: code }))}
                onVerify={handleVerifyTotp}
                isLoading={state.isLoading}
                error={state.error}
              />
            </>
          )}

          {/* Hardware Key Configuration */}
          {state.step === 'configure' && state.selectedMethod === 'hardware_key' && (
            <>
              <Button variant="ghost" size="sm" onClick={handleBack} className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <HardwareKeySetup
                onRegister={handleRegisterHardwareKey}
                isLoading={state.isLoading}
                error={state.error}
                registeredKeys={hardwareKeys}
              />
            </>
          )}

          {/* Biometric Configuration */}
          {state.step === 'configure' && state.selectedMethod === 'biometric' && (
            <>
              <Button variant="ghost" size="sm" onClick={handleBack} className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <BiometricSetup
                onRegister={handleRegisterBiometric}
                isLoading={state.isLoading}
                error={state.error}
                isSupported={biometricSupported}
              />
            </>
          )}

          {/* Backup Codes */}
          {state.step === 'backup' && (
            <BackupCodesDisplay
              codes={state.backupCodes}
              onDownload={handleDownloadCodes}
              onPrint={handlePrintCodes}
              onContinue={handleComplete}
            />
          )}

          {/* Complete */}
          {state.step === 'complete' && (
            <div className="text-center py-8">
              <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                <ShieldCheck className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-lg font-medium">Setup Complete!</h3>
              <p className="text-muted-foreground mt-2">
                {state.selectedMethod && MFA_METHOD_DETAILS[state.selectedMethod].label} has been
                successfully configured for your account.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MFA MANAGEMENT PAGE (Full Page Component)
// ─────────────────────────────────────────────────────────────────────────────

export const MfaManagement: React.FC = () => {
  const [methods, setMethods] = useState<MfaMethodStatus[]>([
    {
      method: 'totp',
      enabled: true,
      isPrimary: true,
      configuredAt: new Date('2025-01-01'),
      lastUsedAt: new Date('2025-01-24'),
      deviceName: 'Authy on iPhone 15',
    },
  ]);

  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [backupCodesRemaining, setBackupCodesRemaining] = useState(8);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState<MfaMethod | null>(null);

  const availableMethods: MfaMethod[] = ['totp', 'hardware_key', 'biometric', 'sms'];

  const handleSetup = (method: MfaMethod) => {
    setShowSetupWizard(true);
  };

  const handleSetupComplete = (method: MfaMethod) => {
    setMethods(prev => [
      ...prev,
      {
        method,
        enabled: true,
        isPrimary: prev.length === 0,
        configuredAt: new Date(),
      },
    ]);
    setShowSetupWizard(false);
  };

  const handleRemove = (method: MfaMethod) => {
    setShowRemoveConfirm(method);
  };

  const confirmRemove = () => {
    if (showRemoveConfirm) {
      setMethods(prev => prev.filter(m => m.method !== showRemoveConfirm));
      setShowRemoveConfirm(null);
    }
  };

  const handleSetPrimary = (method: MfaMethod) => {
    setMethods(prev =>
      prev.map(m => ({
        ...m,
        isPrimary: m.method === method,
      }))
    );
  };

  const handleRegenerateBackupCodes = () => {
    // TODO: Implement backup code regeneration
    setBackupCodesRemaining(10);
  };

  return (
    <div className="container max-w-3xl py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Multi-Factor Authentication</h1>
        <p className="text-muted-foreground mt-1">
          Manage authentication methods to secure your account per FDA 21 CFR Part 11
        </p>
      </div>

      <MfaOverview
        methods={methods}
        onSetup={handleSetup}
        onRemove={handleRemove}
        onSetPrimary={handleSetPrimary}
        onRegenerateBackupCodes={handleRegenerateBackupCodes}
        backupCodesRemaining={backupCodesRemaining}
      />

      <MfaSetupWizard
        open={showSetupWizard}
        onClose={() => setShowSetupWizard(false)}
        onComplete={handleSetupComplete}
        availableMethods={availableMethods.filter(
          m => !methods.find(existing => existing.method === m && existing.enabled)
        )}
      />

      {/* Remove Confirmation Dialog */}
      <Dialog open={!!showRemoveConfirm} onOpenChange={() => setShowRemoveConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Remove Authentication Method
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to remove{' '}
              {showRemoveConfirm && MFA_METHOD_DETAILS[showRemoveConfirm].label}? This may reduce
              your account security.
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              FDA 21 CFR Part 11 recommends maintaining at least two authentication factors.
              Removing this method may impact regulatory compliance.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemoveConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmRemove}>
              Remove Method
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MfaManagement;
