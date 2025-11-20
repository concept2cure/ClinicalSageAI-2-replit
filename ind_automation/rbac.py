from fastapi import Depends, HTTPException
from ind_automation.auth import get_current_user
from ind_automation import users

def requires(perm: str):
    """
    Create a dependency that checks if the current user has the required permission.
    
    Usage example:
        @app.get('/api/protected', dependencies=[Depends(rbac.requires('admin.read'))])
        def protected_endpoint():
            return {"status": "ok"}
    """
    def wrapper(user: str = Depends(get_current_user)):
        perms = getattr(users, 'get_permissions', lambda u: [])(user)
        if perm not in perms:
            raise HTTPException(403, f"Missing permission: {perm}")
        return user
    return wrapper