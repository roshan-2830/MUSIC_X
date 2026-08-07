from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check():
    """Simple check to confirm the API is alive."""
    return {"status": "healthy"}
