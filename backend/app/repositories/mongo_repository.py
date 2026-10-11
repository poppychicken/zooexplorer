"""MongoDB access.

Uses pymongo's native async driver (`AsyncMongoClient`, pymongo >= 4.13).
motor is EOL and intentionally not a dependency.

The client is created lazily on first use and closed by the app lifespan, so
importing a repository never opens a socket — which is what lets the test
suite and `python -c "import app.main"` run without a database.
"""

from __future__ import annotations

import logging
from typing import Any, Generic, Optional, Sequence, TypeVar

from bson import ObjectId
from bson.errors import InvalidId
from pymongo import AsyncMongoClient, ReturnDocument
from pymongo.asynchronous.collection import AsyncCollection
from pymongo.asynchronous.database import AsyncDatabase

from app.config.settings import settings
from app.models.models import MongoModel, utcnow

logger = logging.getLogger("app")

T = TypeVar("T", bound=MongoModel)

_client: Optional[AsyncMongoClient] = None


def get_client() -> AsyncMongoClient:
    global _client
    if _client is None:
        _client = AsyncMongoClient(settings.mongodb.uri, tz_aware=True)
    return _client


def get_db() -> AsyncDatabase:
    return get_client()[settings.mongodb.database]


async def close_client() -> None:
    global _client
    if _client is not None:
        await _client.close()
        _client = None


async def ensure_indexes() -> None:
    """Create indexes for all collections. Idempotent — safe every startup.

    The platform provides the connection and credentials via env
    (MONGODB_URI, MONGODB_DATABASE); the chart's ExternalSecret re-syncs
    them on every pod start.

    Add your collection indexes here as the app grows:

        await get_db()["items"].create_index("name", name="idx_name")
    """
    logger.info("Ensuring MongoDB indexes...")
    # (none yet — add as collections appear)
    logger.info("MongoDB indexes ensured")


def _to_object_id(value: str) -> Optional[ObjectId]:
    """None for anything that isn't a valid ObjectId, so a garbage path
    parameter becomes a 404 instead of a 500."""
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        return None


class MongoRepository(Generic[T]):
    """Generic CRUD over one collection."""

    def __init__(self, model_class: type[T], collection_name: str):
        self.model_class = model_class
        self.collection_name = collection_name

    @property
    def collection(self) -> AsyncCollection:
        return get_db()[self.collection_name]

    def _load(self, document: dict[str, Any]) -> T:
        return self.model_class.model_validate(document)

    async def create(self, model: T) -> T:
        # Mongo mints the _id; never let a client-supplied one through.
        document = model.model_dump(exclude={"id"}, exclude_none=True)
        result = await self.collection.insert_one(document)
        return self._load({**document, "_id": result.inserted_id})

    async def get(self, id: str) -> Optional[T]:
        oid = _to_object_id(id)
        if oid is None:
            return None
        document = await self.collection.find_one({"_id": oid})
        return self._load(document) if document else None

    async def find(
        self,
        query: Optional[dict[str, Any]] = None,
        sort: Optional[Sequence[tuple[str, int]]] = None,
        limit: Optional[int] = None,
    ) -> list[T]:
        cursor = self.collection.find(query or {})
        if sort:
            cursor = cursor.sort(sort)
        if limit:
            cursor = cursor.limit(limit)
        return [self._load(doc) async for doc in cursor]

    async def find_one(self, query: dict[str, Any]) -> Optional[T]:
        document = await self.collection.find_one(query)
        return self._load(document) if document else None

    async def update(self, id: str, changes: dict[str, Any]) -> Optional[T]:
        """Apply a partial update. Returns None if the id doesn't exist."""
        oid = _to_object_id(id)
        if oid is None:
            return None
        document = await self.collection.find_one_and_update(
            {"_id": oid},
            {"$set": {**changes, "updated_at": utcnow()}},
            return_document=ReturnDocument.AFTER,
        )
        return self._load(document) if document else None

    async def delete(self, id: str) -> bool:
        oid = _to_object_id(id)
        if oid is None:
            return False
        result = await self.collection.delete_one({"_id": oid})
        return result.deleted_count > 0
