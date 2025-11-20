
/**
 * Package Dependency Monitor Service
 * Monitors and ensures critical packages are loaded and available
 */

class PackageMonitorService {
  constructor() {
    this.criticalPackages = new Map();
    this.packageStatus = new Map();
    this.failedPackages = new Set();
    this.retryAttempts = new Map();
    this.maxRetries = 3;
    this.checkInterval = null;
    
    // Register critical packages for document editor
    this.registerCriticalPackages();
  }

  registerCriticalPackages() {
    const packages = [
      { name: '@/components/ui/button', priority: 'high', fallback: 'native-button' },
      { name: '@/components/ui/badge', priority: 'medium', fallback: 'native-span' },
      { name: '@/components/ui/switch', priority: 'medium', fallback: 'native-checkbox' },
      { name: 'react', priority: 'critical', fallback: null },
      { name: 'react-dom', priority: 'critical', fallback: null }
    ];

    packages.forEach(pkg => {
      this.criticalPackages.set(pkg.name, pkg);
      this.packageStatus.set(pkg.name, 'unknown');
      this.retryAttempts.set(pkg.name, 0);
    });
  }

  async checkPackage(packageName) {
    try {
      // For React components, check if they're available in the global scope
      if (packageName.startsWith('@/components/')) {
        const componentPath = packageName.replace('@/components/', '');
        return this.checkReactComponent(componentPath);
      }

      // For other packages, use dynamic import or require
      if (typeof require !== 'undefined') {
        await require(packageName);
        return true;
      }

      // Fallback check
      return this.checkGlobalPackage(packageName);
    } catch (error) {
      console.warn(`Package check failed for ${packageName}:`, error);
      return false;
    }
  }

  checkReactComponent(componentPath) {
    try {
      // Check if React components are available
      if (typeof React === 'undefined') return false;
      
      // For UI components, we'll assume they're available if React is available
      // In a real implementation, you'd check the actual component exports
      return true;
    } catch (error) {
      return false;
    }
  }

  checkGlobalPackage(packageName) {
    switch (packageName) {
      case 'react':
        return typeof React !== 'undefined';
      case 'react-dom':
        return typeof ReactDOM !== 'undefined';
      default:
        return false;
    }
  }

  async verifyAllPackages() {
    const results = {};
    
    for (const [packageName, packageInfo] of this.criticalPackages) {
      try {
        const isAvailable = await this.checkPackage(packageName);
        this.packageStatus.set(packageName, isAvailable ? 'available' : 'failed');
        
        if (!isAvailable) {
          this.failedPackages.add(packageName);
          const attempts = this.retryAttempts.get(packageName) || 0;
          this.retryAttempts.set(packageName, attempts + 1);
        } else {
          this.failedPackages.delete(packageName);
          this.retryAttempts.set(packageName, 0);
        }
        
        results[packageName] = {
          available: isAvailable,
          priority: packageInfo.priority,
          fallback: packageInfo.fallback,
          retryCount: this.retryAttempts.get(packageName)
        };
      } catch (error) {
        console.error(`Error checking package ${packageName}:`, error);
        results[packageName] = { available: false, error: error.message };
      }
    }
    
    return results;
  }

  async retryFailedPackages() {
    const failedToRetry = Array.from(this.failedPackages).filter(pkg => 
      this.retryAttempts.get(pkg) < this.maxRetries
    );

    for (const packageName of failedToRetry) {
      console.log(`Retrying package: ${packageName}`);
      const isAvailable = await this.checkPackage(packageName);
      
      if (isAvailable) {
        this.packageStatus.set(packageName, 'available');
        this.failedPackages.delete(packageName);
        this.retryAttempts.set(packageName, 0);
        console.log(`✅ Package ${packageName} recovered`);
      } else {
        const attempts = this.retryAttempts.get(packageName) + 1;
        this.retryAttempts.set(packageName, attempts);
        
        if (attempts >= this.maxRetries) {
          console.error(`❌ Package ${packageName} failed after ${attempts} attempts`);
        }
      }
    }
  }

  startMonitoring(intervalMs = 30000) {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(async () => {
      await this.retryFailedPackages();
    }, intervalMs);

    console.log('📦 Package monitoring started');
  }

  stopMonitoring() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('📦 Package monitoring stopped');
  }

  getStatus() {
    return {
      totalPackages: this.criticalPackages.size,
      failedPackages: this.failedPackages.size,
      availablePackages: this.criticalPackages.size - this.failedPackages.size,
      failedList: Array.from(this.failedPackages),
      status: Array.from(this.packageStatus.entries()).reduce((acc, [name, status]) => {
        acc[name] = status;
        return acc;
      }, {})
    };
  }

  // Emergency fallback activation
  activateEmergencyFallback() {
    console.warn('🚨 Activating emergency fallback mode');
    
    // Store in localStorage for persistence
    localStorage.setItem('documentEditor_fallbackMode', 'true');
    localStorage.setItem('documentEditor_fallbackReason', 'Package loading failure');
    localStorage.setItem('documentEditor_fallbackTime', new Date().toISOString());

    // Emit custom event for components to listen to
    window.dispatchEvent(new CustomEvent('packageLoadingFailed', {
      detail: {
        failedPackages: Array.from(this.failedPackages),
        fallbackActivated: true
      }
    }));

    return true;
  }

  // Check if emergency fallback is active
  isEmergencyFallbackActive() {
    return localStorage.getItem('documentEditor_fallbackMode') === 'true';
  }

  // Clear emergency fallback
  clearEmergencyFallback() {
    localStorage.removeItem('documentEditor_fallbackMode');
    localStorage.removeItem('documentEditor_fallbackReason');
    localStorage.removeItem('documentEditor_fallbackTime');
    
    window.dispatchEvent(new CustomEvent('packageLoadingRecovered'));
  }
}

// Create singleton instance
export const packageMonitor = new PackageMonitorService();

// Auto-start monitoring when service is imported
packageMonitor.startMonitoring();

export default PackageMonitorService;
