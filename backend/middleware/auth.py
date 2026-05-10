import os
from supabase import create_client
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        # Skip validation for health check and CORS preflight
        if request.method == "OPTIONS" or request.url.path == "/health":
            return await call_next(request)

        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing authentication token"}
            )

        token = auth_header.removeprefix("Bearer ").strip()

        try:
            supabase_url = os.environ.get("SUPABASE_URL", "")
            supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
            supabase = create_client(supabase_url, supabase_key)
            user_response = supabase.auth.get_user(token)
            request.state.user = {"sub": user_response.user.id}
        except Exception:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or expired token"}
            )

        return await call_next(request)