"""Domain models.

Identity is NOT modelled here. The platform's SSO layer (envoy ext_authz +
oauth2-proxy) authenticates every request before it reaches this process and
passes the caller on request headers — see app/api/me.py. The app stores no
users, passwords, JWTs or sessions.
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from typing import Annotated, Optional

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field

# Mongo's ObjectId, stringified at the model boundary. Keeping ids as `str`
# end-to-end means no custom JSON encoder and no per-handler stringifying.
ObjectIdStr = Annotated[str, BeforeValidator(str)]


def utcnow() -> datetime:
    """Timezone-aware UTC now (datetime.utcnow() is deprecated)."""
    return datetime.now(UTC)


class MongoModel(BaseModel):
    """Base for documents that carry Mongo's `_id`.

    Asymmetric aliases on purpose: documents come out of Mongo with `_id`,
    but the JSON the SPA consumes uses `id` (FastAPI serialises by alias).
    """

    id: Optional[ObjectIdStr] = Field(
        default=None, validation_alias="_id", serialization_alias="id"
    )

    model_config = ConfigDict(populate_by_name=True)


# ---------------------------------------------------------------------------
# Example CRUD resource: Item
# Replace or extend this with your own domain models.
# ---------------------------------------------------------------------------


class ItemStatus(str, Enum):
    ACTIVE = "active"
    ARCHIVED = "archived"


class ItemCreate(BaseModel):
    """Client-supplied fields. Ids and timestamps are server-owned, so they
    are absent by construction rather than stripped after the fact."""

    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    status: ItemStatus = ItemStatus.ACTIVE
    tags: list[str] = []

    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "name": "My Item",
                "description": "An example item",
                "status": "active",
                "tags": ["example", "demo"],
            }
        },
    )


class ItemUpdate(BaseModel):
    """PATCH-style partial update — unset fields are left untouched."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)
    status: Optional[ItemStatus] = None
    tags: Optional[list[str]] = None

    model_config = ConfigDict(extra="forbid")


class Item(MongoModel, ItemCreate):
    """Stored/returned representation."""

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    # extra="ignore" (not inherited "forbid"): stored documents may carry
    # fields from an older shape of the model and must still load.
    model_config = ConfigDict(populate_by_name=True, extra="ignore")
