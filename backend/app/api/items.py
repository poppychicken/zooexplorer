"""Example CRUD resource — copy this shape for your own endpoints.

There is no service layer between the router and the repository: for plain
CRUD it would be five passthrough methods. Add one the moment a handler
grows domain logic worth testing on its own.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.me import CurrentUser, current_user
from app.models.models import Item, ItemCreate, ItemUpdate
from app.repositories.mongo_repository import MongoRepository

router = APIRouter()
logger = logging.getLogger("app")

items = MongoRepository(Item, "items")

NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")


@router.get("", response_model=list[Item])
async def list_items(user: CurrentUser = Depends(current_user)) -> list[Item]:
    """List all items.

    Scope this to the caller with `items.find({"owner": user.email})` when
    the resource is per-user.
    """
    return await items.find(sort=[("created_at", -1)])


@router.get("/{item_id}", response_model=Item)
async def get_item(item_id: str, user: CurrentUser = Depends(current_user)) -> Item:
    item = await items.get(item_id)
    if item is None:
        raise NOT_FOUND
    return item


@router.post("", response_model=Item, status_code=status.HTTP_201_CREATED)
async def create_item(
    payload: ItemCreate,
    user: CurrentUser = Depends(current_user),
) -> Item:
    created = await items.create(Item(**payload.model_dump()))
    logger.info("item created id=%s by=%s", created.id, user.email)
    return created


@router.patch("/{item_id}", response_model=Item)
async def update_item(
    item_id: str,
    payload: ItemUpdate,
    user: CurrentUser = Depends(current_user),
) -> Item:
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="No fields to update"
        )
    updated = await items.update(item_id, changes)
    if updated is None:
        raise NOT_FOUND
    return updated


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(item_id: str, user: CurrentUser = Depends(current_user)) -> None:
    if not await items.delete(item_id):
        raise NOT_FOUND
