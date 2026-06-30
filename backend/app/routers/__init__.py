"""API v1 router'lari — her domain alani ayri APIRouter.

main.py hepsini /api/v1 prefix'i ile mount eder.
"""
from app.routers import (
    dispatch,
    disputes,
    evidence,
    orders,
    payments,
    providers,
    subscriptions,
    webhooks,
)

__all__ = [
    "orders",
    "evidence",
    "payments",
    "webhooks",
    "dispatch",
    "disputes",
    "subscriptions",
    "providers",
]
