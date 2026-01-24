/**
 * Role-Based Access Control Service - Stub
 */

class RBACService {
  async checkPermission(userId: any, resource: string, action: string): Promise<boolean> {
    return true; // Default allow for stub
  }
  
  async getUserRoles(userId: any): Promise<string[]> {
    return ['user'];
  }
  
  async hasRole(userId: any, role: string): Promise<boolean> {
    return true;
  }
}

const rbacService = new RBACService();
export default rbacService;
export { RBACService };
