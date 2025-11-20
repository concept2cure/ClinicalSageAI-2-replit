"""
Generate JWT token for testing

This script generates a JWT token for development and testing purposes.
"""
import sys
import jwt
from datetime import datetime, timedelta

def generate_token(user_id, username, exp_minutes=60*24):
    """
    Generate a JWT token for the given user
    
    Args:
        user_id: User ID
        username: Username
        exp_minutes: Expiration time in minutes (default: 1 day)
        
    Returns:
        str: The generated JWT token
    """
    # Use the same secret as in app/config.py
    secret_key = "regintel_development_key"
    algorithm = "HS256"
    
    # Create the payload
    payload = {
        "sub": str(user_id),
        "user_id": user_id,
        "username": username,
        "tenant_id": "default",
        "exp": (datetime.utcnow() + timedelta(minutes=exp_minutes)).timestamp()
    }
    
    # Create and sign the token
    token = jwt.encode(payload, secret_key, algorithm=algorithm)
    
    return token

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python generate_test_token.py <user_id> <username> [exp_minutes]")
        sys.exit(1)
        
    user_id = int(sys.argv[1])
    username = sys.argv[2]
    
    exp_minutes = 60 * 24  # Default: 1 day
    if len(sys.argv) >= 4:
        exp_minutes = int(sys.argv[3])
        
    token = generate_token(user_id, username, exp_minutes)
    
    print("\nTest JWT Token for development and testing:")
    print("------------------------------------------")
    print(token)
    print("\nUse this token in the Authorization header:")
    print(f"Authorization: Bearer {token}")
    print("\nOr set it in localStorage in the browser console:")
    print(f"localStorage.setItem('authToken', '{token}')")
    print("------------------------------------------")