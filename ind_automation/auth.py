import os, time, jwt, datetime
from fastapi import Depends, HTTPException, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from ind_automation import users

SECRET = os.getenv("ACCESS_TOKEN_SECRET")
if not SECRET:
    raise RuntimeError("Set ACCESS_TOKEN_SECRET in Secrets")

bearer_scheme = HTTPBearer()

def create_token(username):
    payload = {
        "sub": username,
        "iat": int(time.time()),
        "exp": int(time.time()) + 8*3600,
    }
    return jwt.encode(payload, SECRET, algorithm="HS256")

def get_current_user(token: HTTPAuthorizationCredentials = Depends(bearer_scheme)):
    try:
        payload = jwt.decode(token.credentials, SECRET, algorithms=["HS256"])
        return payload["sub"]
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except Exception:
        raise HTTPException(401, "Invalid token")

def admin_required(user: str = Depends(get_current_user)):
    if users.get_role(user) != "admin":
        raise HTTPException(403, "Admin only")
    return user