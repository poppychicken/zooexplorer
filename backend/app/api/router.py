from fastapi import APIRouter

from app.api.items import router as items_router
from app.api.me import router as me_router

# Create main API router
api_router = APIRouter()

# Include all routers
api_router.include_router(me_router, tags=["Identity"])
api_router.include_router(items_router, prefix="/items", tags=["Items"])


# Health check endpoint
@api_router.get("/health", tags=["Health"])
async def health_check():
    """Health check endpoint to verify API is running"""
    return {"status": "ok"}
