"""Current-user endpoint.

Identity is provided by the platform's SSO layer (envoy ext_authz →
oauth2-proxy). Trusted identity headers are injected into the request
by the gateway.

The platform's selfserve chart forwards `X-Auth-Request-*` headers
(emitted by oauth2-proxy with `--set-xauthrequest=true`). Earlier
versions of the chart used `X-Forwarded-*`; we accept BOTH so this
template works regardless of which header family the upstream
ext-auth backend emits.

  X-Auth-Request-Email / X-Forwarded-Email
      e.g. bishwas.adhikari@swipejobs.com
  X-Auth-Request-User / X-Forwarded-User
      Google subject id
  X-Auth-Request-Preferred-Username / X-Forwarded-Preferred-Username
      preferred display name, when known

The chart's NetworkPolicy restricts ingress to ONLY the envoy gateway
namespace, so these headers cannot be spoofed by another pod in the
cluster — they're trustworthy.

The app should NOT issue its own JWTs or store sessions. Every request
already carries an authenticated identity in headers.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel

router = APIRouter()


class CurrentUser(BaseModel):
    """Identity attached to the current request by the platform SSO layer."""
    email: Optional[str] = None
    user: Optional[str] = None
    preferred_username: Optional[str] = None


def _first(*values: Optional[str]) -> Optional[str]:
    """Return the first non-empty value, or None."""
    for v in values:
        if v:
            return v
    return None


async def current_user(
    # Primary headers from oauth2-proxy `--set-xauthrequest=true`.
    x_auth_request_email: Optional[str] = Header(
        default=None, alias="X-Auth-Request-Email"
    ),
    x_auth_request_user: Optional[str] = Header(
        default=None, alias="X-Auth-Request-User"
    ),
    x_auth_request_preferred_username: Optional[str] = Header(
        default=None, alias="X-Auth-Request-Preferred-Username"
    ),
    # Fallback headers — some ext-auth backends emit X-Forwarded-* instead.
    x_forwarded_email: Optional[str] = Header(default=None, alias="X-Forwarded-Email"),
    x_forwarded_user: Optional[str] = Header(default=None, alias="X-Forwarded-User"),
    x_forwarded_preferred_username: Optional[str] = Header(
        default=None, alias="X-Forwarded-Preferred-Username"
    ),
) -> CurrentUser:
    """FastAPI dependency — surface the SSO identity for handlers that
    want to attribute actions or filter resources by user.

    Use as:
        @router.get("/things")
        async def list_things(user: CurrentUser = Depends(current_user)):
            return await things_service.list_for(user.email)
    """
    return CurrentUser(
        email=_first(x_auth_request_email, x_forwarded_email),
        user=_first(x_auth_request_user, x_forwarded_user),
        preferred_username=_first(
            x_auth_request_preferred_username, x_forwarded_preferred_username,
        ),
    )


@router.get("/me", response_model=CurrentUser)
async def get_me(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    """Return the caller's identity as injected by the platform SSO layer.

    Returns null fields (HTTP 200) for unauthenticated requests so the
    frontend can render a generic loading state — the actual gate is at
    the gateway, not here, so an unauth'd request can't reach this code
    in production. Useful for local dev where SSO isn't in front.
    """
    return user
