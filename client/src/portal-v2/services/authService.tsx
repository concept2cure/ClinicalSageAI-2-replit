/**
 * TrialSage Client Portal V2 - Authentication Service Layer
 *
 * Centralized authentication service with:
 * - Token management (JWT)
 * - Session handling
 * - MFA verification
 * - API client with auth headers
 * - Token refresh logic
 *
 * @version 2.0.0
 * @compliance FDA 21 CFR Part 11.10(d), NIST 800-63B
 */

import { authLogger } from '../utils/logger';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & INTERFACES
// ─────────────────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  tokenType: 'Bearer';
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  organizationId: string;
  organizationName: string;
  lastLoginAt?: Date;
  mfaEnabled: boolean;
  mfaMethods: MfaMethod[];
  passwordExpiresAt?: Date;
  mustChangePassword: boolean;
  profileImageUrl?: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  deviceInfo: DeviceInfo;
  ipAddress: string;
  location?: string;
  isCurrent: boolean;
}

export interface DeviceInfo {
  type: 'desktop' | 'laptop' | 'tablet' | 'mobile' | 'unknown';
  name: string;
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  fingerprint: string;
}

export interface MfaMethod {
  type: 'totp' | 'sms' | 'email' | 'hardware_key' | 'biometric';
  isEnabled: boolean;
  isPrimary: boolean;
  lastUsedAt?: Date;
  deviceName?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberDevice?: boolean;
  deviceFingerprint?: string;
}

export interface MfaVerification {
  method: MfaMethod['type'];
  code?: string;
  challengeId?: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
  mfaCode?: string;
}

export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
  terminateOtherSessions: boolean;
}

export interface AuthError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface AuthResult<T> {
  success: boolean;
  data?: T;
  error?: AuthError;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_STORAGE_KEYS = {
  accessToken: 'trialsage_access_token',
  refreshToken: 'trialsage_refresh_token',
  tokenExpiry: 'trialsage_token_expiry',
  user: 'trialsage_user',
  deviceId: 'trialsage_device_id',
} as const;

const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes before expiry

export const AUTH_ERROR_CODES = {
  INVALID_CREDENTIALS: 'AUTH_001',
  ACCOUNT_LOCKED: 'AUTH_002',
  MFA_REQUIRED: 'AUTH_003',
  MFA_INVALID: 'AUTH_004',
  SESSION_EXPIRED: 'AUTH_005',
  TOKEN_INVALID: 'AUTH_006',
  PASSWORD_EXPIRED: 'AUTH_007',
  DEVICE_NOT_TRUSTED: 'AUTH_008',
  CONCURRENT_SESSION_LIMIT: 'AUTH_009',
  NETWORK_ERROR: 'AUTH_010',
  UNAUTHORIZED: 'AUTH_401',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN STORAGE UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

class SecureStorage {
  private static isAvailable(storage: Storage): boolean {
    try {
      const test = '__storage_test__';
      storage.setItem(test, test);
      storage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  static setItem(key: string, value: string, persistent: boolean = false): void {
    try {
      const storage = persistent ? localStorage : sessionStorage;
      if (this.isAvailable(storage)) {
        storage.setItem(key, value);
      }
    } catch (error) {
      authLogger.error('Storage error', { error: String(error) });
    }
  }

  static getItem(key: string): string | null {
    try {
      // Try sessionStorage first, then localStorage
      return sessionStorage.getItem(key) || localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  static removeItem(key: string): void {
    try {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    } catch (error) {
      authLogger.error('Storage removal error', { error: String(error) });
    }
  }

  static clear(): void {
    Object.values(AUTH_STORAGE_KEYS).forEach(key => {
      this.removeItem(key);
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEVICE FINGERPRINTING
// ─────────────────────────────────────────────────────────────────────────────

export class DeviceFingerprint {
  static generate(): string {
    // In production, use a proper fingerprinting library like FingerprintJS
    const components = [
      navigator.userAgent,
      navigator.language,
      screen.colorDepth,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency,
      // Add more entropy sources as needed
    ];

    // Simple hash function for demo purposes
    let hash = 0;
    const str = components.join('|');
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    return `fp_${Math.abs(hash).toString(36)}`;
  }

  static getDeviceInfo(): DeviceInfo {
    const ua = navigator.userAgent;

    // Detect device type
    let deviceType: DeviceInfo['type'] = 'unknown';
    if (/mobile/i.test(ua)) deviceType = 'mobile';
    else if (/tablet|ipad/i.test(ua)) deviceType = 'tablet';
    else if (/macbook|laptop/i.test(ua)) deviceType = 'laptop';
    else if (/mac|windows|linux/i.test(ua)) deviceType = 'desktop';

    // Parse browser
    let browser = 'Unknown';
    let browserVersion = '';
    if (/chrome/i.test(ua)) {
      browser = 'Chrome';
      browserVersion = ua.match(/chrome\/(\d+)/i)?.[1] || '';
    } else if (/firefox/i.test(ua)) {
      browser = 'Firefox';
      browserVersion = ua.match(/firefox\/(\d+)/i)?.[1] || '';
    } else if (/safari/i.test(ua)) {
      browser = 'Safari';
      browserVersion = ua.match(/version\/(\d+)/i)?.[1] || '';
    } else if (/edge/i.test(ua)) {
      browser = 'Edge';
      browserVersion = ua.match(/edge\/(\d+)/i)?.[1] || '';
    }

    // Parse OS
    let os = 'Unknown';
    let osVersion = '';
    if (/windows nt/i.test(ua)) {
      os = 'Windows';
      osVersion = ua.match(/windows nt (\d+\.\d+)/i)?.[1] || '';
    } else if (/mac os x/i.test(ua)) {
      os = 'macOS';
      osVersion = ua.match(/mac os x (\d+[._]\d+)/i)?.[1]?.replace('_', '.') || '';
    } else if (/linux/i.test(ua)) {
      os = 'Linux';
    } else if (/android/i.test(ua)) {
      os = 'Android';
      osVersion = ua.match(/android (\d+)/i)?.[1] || '';
    } else if (/iphone|ipad/i.test(ua)) {
      os = 'iOS';
      osVersion = ua.match(/os (\d+)/i)?.[1] || '';
    }

    return {
      type: deviceType,
      name: `${browser} on ${os}`,
      browser,
      browserVersion,
      os,
      osVersion,
      fingerprint: this.generate(),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH EVENT EMITTER
// ─────────────────────────────────────────────────────────────────────────────

type AuthEventType =
  | 'login'
  | 'logout'
  | 'token_refresh'
  | 'session_expired'
  | 'mfa_required'
  | 'password_expired'
  | 'user_updated';

type AuthEventHandler = (event: { type: AuthEventType; data?: unknown }) => void;

class AuthEventEmitter {
  private handlers: Map<AuthEventType, Set<AuthEventHandler>> = new Map();

  on(event: AuthEventType, handler: AuthEventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  emit(event: AuthEventType, data?: unknown): void {
    this.handlers.get(event)?.forEach(handler => {
      try {
        handler({ type: event, data });
      } catch (error) {
        authLogger.error('Auth event handler error', { event, error: String(error) });
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API CLIENT
// ─────────────────────────────────────────────────────────────────────────────

interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  skipAuth?: boolean;
  retryOnUnauthorized?: boolean;
}

class ApiClient {
  private baseUrl: string;
  private authService: AuthService;

  constructor(baseUrl: string, authService: AuthService) {
    this.baseUrl = baseUrl;
    this.authService = authService;
  }

  async request<T>(endpoint: string, options: ApiRequestOptions = {}): Promise<AuthResult<T>> {
    const {
      method = 'GET',
      body,
      headers = {},
      skipAuth = false,
      retryOnUnauthorized = true,
    } = options;

    try {
      // Add auth header if not skipped
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...headers,
      };

      if (!skipAuth) {
        const token = await this.authService.getValidAccessToken();
        if (token) {
          requestHeaders['Authorization'] = `Bearer ${token}`;
        }
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include',
      });

      // Handle 401 Unauthorized
      if (response.status === 401 && retryOnUnauthorized) {
        const refreshed = await this.authService.refreshToken();
        if (refreshed) {
          // Retry request with new token
          return this.request(endpoint, { ...options, retryOnUnauthorized: false });
        }
        return {
          success: false,
          error: {
            code: AUTH_ERROR_CODES.SESSION_EXPIRED,
            message: 'Session expired. Please log in again.',
          },
        };
      }

      // Handle other errors
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: {
            code: errorData.code || `HTTP_${response.status}`,
            message: errorData.message || response.statusText,
            details: errorData,
          },
        };
      }

      // Success
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      authLogger.error('API request error', { endpoint, error: String(error) });
      return {
        success: false,
        error: {
          code: AUTH_ERROR_CODES.NETWORK_ERROR,
          message: 'Network error. Please check your connection.',
        },
      };
    }
  }

  async get<T>(endpoint: string, options?: ApiRequestOptions): Promise<AuthResult<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async post<T>(
    endpoint: string,
    body?: unknown,
    options?: ApiRequestOptions
  ): Promise<AuthResult<T>> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body });
  }

  async put<T>(
    endpoint: string,
    body?: unknown,
    options?: ApiRequestOptions
  ): Promise<AuthResult<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body });
  }

  async patch<T>(
    endpoint: string,
    body?: unknown,
    options?: ApiRequestOptions
  ): Promise<AuthResult<T>> {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', body });
  }

  async delete<T>(endpoint: string, options?: ApiRequestOptions): Promise<AuthResult<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN AUTH SERVICE
// ─────────────────────────────────────────────────────────────────────────────

export class AuthService {
  private tokens: AuthTokens | null = null;
  private user: AuthUser | null = null;
  private refreshPromise: Promise<boolean> | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private events: AuthEventEmitter = new AuthEventEmitter();
  public api: ApiClient;

  constructor(private baseUrl: string = '/api/v1/auth') {
    // ApiClient.baseUrl must be empty so AuthService.baseUrl is the single
    // source of truth and paths aren't doubled (/api/v1 + /api/v1/auth/…).
    this.api = new ApiClient('', this);
    this.loadStoredAuth();
    this.setupTokenRefresh();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Event Subscription
  // ─────────────────────────────────────────────────────────────────────────

  on(event: AuthEventType, handler: AuthEventHandler): () => void {
    return this.events.on(event, handler);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Authentication
  // ─────────────────────────────────────────────────────────────────────────

  async login(
    credentials: LoginCredentials
  ): Promise<AuthResult<{ mfaRequired: boolean; methods?: MfaMethod[] }>> {
    const deviceInfo = DeviceFingerprint.getDeviceInfo();

    const result = await this.api.post<{
      accessToken?: string;
      refreshToken?: string;
      expiresIn?: number;
      user?: AuthUser;
      mfaRequired: boolean;
      mfaMethods?: MfaMethod[];
      challengeId?: string;
    }>(
      `${this.baseUrl}/login`,
      {
        ...credentials,
        deviceInfo,
      },
      { skipAuth: true }
    );

    if (!result.success) {
      return result;
    }

    if (result.data?.mfaRequired) {
      // Store challenge ID for MFA verification
      SecureStorage.setItem('trialsage_mfa_challenge', result.data.challengeId || '');
      return {
        success: true,
        data: {
          mfaRequired: true,
          methods: result.data.mfaMethods,
        },
      };
    }

    // Login successful without MFA
    if (result.data?.accessToken && result.data?.user) {
      this.setAuth(
        {
          accessToken: result.data.accessToken,
          refreshToken: result.data.refreshToken!,
          expiresAt: new Date(Date.now() + (result.data.expiresIn || 3600) * 1000),
          tokenType: 'Bearer',
        },
        result.data.user,
        credentials.rememberDevice
      );
      this.events.emit('login', { user: result.data.user });
    }

    return { success: true, data: { mfaRequired: false } };
  }

  async verifyMfa(verification: MfaVerification): Promise<AuthResult<AuthUser>> {
    const challengeId = SecureStorage.getItem('trialsage_mfa_challenge');

    const result = await this.api.post<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      user: AuthUser;
    }>(
      `${this.baseUrl}/mfa/verify`,
      {
        ...verification,
        challengeId,
      },
      { skipAuth: true }
    );

    if (!result.success) {
      return result;
    }

    SecureStorage.removeItem('trialsage_mfa_challenge');

    this.setAuth(
      {
        accessToken: result.data!.accessToken,
        refreshToken: result.data!.refreshToken,
        expiresAt: new Date(Date.now() + result.data!.expiresIn * 1000),
        tokenType: 'Bearer',
      },
      result.data!.user,
      true
    );

    this.events.emit('login', { user: result.data!.user });
    return { success: true, data: result.data!.user };
  }

  async logout(terminateAllSessions: boolean = false): Promise<void> {
    try {
      await this.api.post(`${this.baseUrl}/logout`, { terminateAllSessions });
    } catch {
      // Ignore errors during logout
    }

    this.clearAuth();
    this.events.emit('logout');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Token Management
  // ─────────────────────────────────────────────────────────────────────────

  async getValidAccessToken(): Promise<string | null> {
    if (!this.tokens) {
      return null;
    }

    // Check if token needs refresh
    const now = new Date();
    const threshold = new Date(this.tokens.expiresAt.getTime() - TOKEN_REFRESH_THRESHOLD_MS);

    if (now >= threshold) {
      await this.refreshToken();
    }

    return this.tokens?.accessToken || null;
  }

  async refreshToken(): Promise<boolean> {
    // Prevent concurrent refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    if (!this.tokens?.refreshToken) {
      return false;
    }

    this.refreshPromise = this._doRefreshToken();
    const result = await this.refreshPromise;
    this.refreshPromise = null;

    return result;
  }

  private async _doRefreshToken(): Promise<boolean> {
    try {
      const result = await this.api.post<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
      }>(
        `${this.baseUrl}/refresh`,
        { refreshToken: this.tokens?.refreshToken },
        { skipAuth: true, retryOnUnauthorized: false }
      );

      if (!result.success || !result.data) {
        this.clearAuth();
        this.events.emit('session_expired');
        return false;
      }

      this.tokens = {
        accessToken: result.data.accessToken,
        refreshToken: result.data.refreshToken,
        expiresAt: new Date(Date.now() + result.data.expiresIn * 1000),
        tokenType: 'Bearer',
      };

      this.storeTokens(true);
      this.setupTokenRefresh();
      this.events.emit('token_refresh');

      return true;
    } catch {
      this.clearAuth();
      this.events.emit('session_expired');
      return false;
    }
  }

  private setupTokenRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!this.tokens) return;

    const now = Date.now();
    const expiresAt = this.tokens.expiresAt.getTime();
    const refreshAt = expiresAt - TOKEN_REFRESH_THRESHOLD_MS;
    const delay = Math.max(0, refreshAt - now);

    this.refreshTimer = setTimeout(() => {
      this.refreshToken();
    }, delay);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Session Management
  // ─────────────────────────────────────────────────────────────────────────

  async getSessions(): Promise<AuthResult<AuthSession[]>> {
    return this.api.get<AuthSession[]>(`${this.baseUrl}/sessions`);
  }

  async terminateSession(sessionId: string): Promise<AuthResult<void>> {
    return this.api.delete(`${this.baseUrl}/sessions/${sessionId}`);
  }

  async terminateAllOtherSessions(): Promise<AuthResult<void>> {
    return this.api.delete(`${this.baseUrl}/sessions/others`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Password Management
  // ─────────────────────────────────────────────────────────────────────────

  async requestPasswordReset(request: PasswordResetRequest): Promise<AuthResult<void>> {
    return this.api.post(`${this.baseUrl}/password/reset-request`, request, { skipAuth: true });
  }

  async confirmPasswordReset(confirm: PasswordResetConfirm): Promise<AuthResult<void>> {
    return this.api.post(`${this.baseUrl}/password/reset-confirm`, confirm, { skipAuth: true });
  }

  async changePassword(request: PasswordChangeRequest): Promise<AuthResult<void>> {
    return this.api.post(`${this.baseUrl}/password/change`, request);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MFA Management
  // ─────────────────────────────────────────────────────────────────────────

  async getMfaMethods(): Promise<AuthResult<MfaMethod[]>> {
    return this.api.get<MfaMethod[]>(`${this.baseUrl}/mfa/methods`);
  }

  async setupTotp(): Promise<AuthResult<{ secret: string; qrCode: string }>> {
    return this.api.post(`${this.baseUrl}/mfa/totp/setup`);
  }

  async verifyTotpSetup(code: string): Promise<AuthResult<{ backupCodes: string[] }>> {
    return this.api.post(`${this.baseUrl}/mfa/totp/verify`, { code });
  }

  async disableMfaMethod(method: MfaMethod['type']): Promise<AuthResult<void>> {
    return this.api.delete(`${this.baseUrl}/mfa/${method}`);
  }

  async generateBackupCodes(): Promise<AuthResult<{ codes: string[] }>> {
    return this.api.post(`${this.baseUrl}/mfa/backup-codes`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // User & State
  // ─────────────────────────────────────────────────────────────────────────

  getUser(): AuthUser | null {
    return this.user;
  }

  isAuthenticated(): boolean {
    return !!(this.tokens && this.user);
  }

  hasPermission(permission: string): boolean {
    return this.user?.permissions.includes(permission) || false;
  }

  hasRole(role: string): boolean {
    return this.user?.roles.includes(role) || false;
  }

  async updateProfile(
    updates: Partial<Pick<AuthUser, 'firstName' | 'lastName'>>
  ): Promise<AuthResult<AuthUser>> {
    const result = await this.api.patch<AuthUser>(`${this.baseUrl}/profile`, updates);
    if (result.success && result.data) {
      this.user = result.data;
      this.storeUser();
      this.events.emit('user_updated', { user: result.data });
    }
    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Storage Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private setAuth(tokens: AuthTokens, user: AuthUser, persistent: boolean = false): void {
    this.tokens = tokens;
    this.user = user;
    this.storeTokens(persistent);
    this.storeUser();
    this.setupTokenRefresh();
  }

  private clearAuth(): void {
    this.tokens = null;
    this.user = null;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    SecureStorage.clear();
  }

  private storeTokens(persistent: boolean): void {
    if (!this.tokens) return;
    SecureStorage.setItem(AUTH_STORAGE_KEYS.accessToken, this.tokens.accessToken, persistent);
    SecureStorage.setItem(AUTH_STORAGE_KEYS.refreshToken, this.tokens.refreshToken, persistent);
    SecureStorage.setItem(
      AUTH_STORAGE_KEYS.tokenExpiry,
      this.tokens.expiresAt.toISOString(),
      persistent
    );
  }

  private storeUser(): void {
    if (!this.user) return;
    SecureStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify(this.user), true);
  }

  private loadStoredAuth(): void {
    try {
      const accessToken = SecureStorage.getItem(AUTH_STORAGE_KEYS.accessToken);
      const refreshToken = SecureStorage.getItem(AUTH_STORAGE_KEYS.refreshToken);
      const expiryStr = SecureStorage.getItem(AUTH_STORAGE_KEYS.tokenExpiry);
      const userStr = SecureStorage.getItem(AUTH_STORAGE_KEYS.user);

      if (accessToken && refreshToken && expiryStr && userStr) {
        const expiresAt = new Date(expiryStr);
        if (expiresAt > new Date()) {
          this.tokens = {
            accessToken,
            refreshToken,
            expiresAt,
            tokenType: 'Bearer',
          };
          this.user = JSON.parse(userStr);
        }
      }
    } catch (error) {
      authLogger.error('Error loading stored auth', { error: String(error) });
      this.clearAuth();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SINGLETON INSTANCE
// ─────────────────────────────────────────────────────────────────────────────

export const authService = new AuthService('/api/v1/auth');

// ─────────────────────────────────────────────────────────────────────────────
// REACT HOOKS
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (
    credentials: LoginCredentials
  ) => Promise<AuthResult<{ mfaRequired: boolean; methods?: MfaMethod[] }>>;
  verifyMfa: (verification: MfaVerification) => Promise<AuthResult<AuthUser>>;
  logout: (terminateAll?: boolean) => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(authService.getUser());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check initial auth state
    setUser(authService.getUser());
    setIsLoading(false);

    // Subscribe to auth events
    const unsubLogin = authService.on('login', event => {
      setUser((event.data as { user: AuthUser })?.user || authService.getUser());
    });

    const unsubLogout = authService.on('logout', () => {
      setUser(null);
    });

    const unsubExpired = authService.on('session_expired', () => {
      setUser(null);
    });

    const unsubUpdated = authService.on('user_updated', event => {
      setUser((event.data as { user: AuthUser })?.user || null);
    });

    return () => {
      unsubLogin();
      unsubLogout();
      unsubExpired();
      unsubUpdated();
    };
  }, []);

  const login = useCallback(async (credentials: LoginCredentials) => {
    setIsLoading(true);
    const result = await authService.login(credentials);
    setIsLoading(false);
    return result;
  }, []);

  const verifyMfa = useCallback(async (verification: MfaVerification) => {
    setIsLoading(true);
    const result = await authService.verifyMfa(verification);
    setIsLoading(false);
    return result;
  }, []);

  const logout = useCallback(async (terminateAll?: boolean) => {
    setIsLoading(true);
    await authService.logout(terminateAll);
    setIsLoading(false);
  }, []);

  const hasPermission = useCallback((permission: string) => {
    return authService.hasPermission(permission);
  }, []);

  const hasRole = useCallback((role: string) => {
    return authService.hasRole(role);
  }, []);

  const value: AuthContextValue = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    verifyMfa,
    logout,
    hasPermission,
    hasRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export default authService;
