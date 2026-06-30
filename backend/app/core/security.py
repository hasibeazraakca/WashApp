"""Kimlik & yetki — Supabase Auth JWT dogrulama (JWKS, RS256).

03-yazilim-mimarisi.md §7.1:
- Supabase Auth JWT tek kimlik kaynagi.
- FastAPI JWT'yi Supabase JWKS ile DOGRULAR (imza + exp).
- Yetki = app_metadata.role claim (kullanici user_metadata'yi degistirebilir
  ama app_metadata'ya YAZAMAZ -> yetki yukseltme imkansiz, §7.1).
- DB'ye service_role ile baglanir; is kurali backend'de zorlanir.

Not: Eski Supabase projeleri HS256 (paylasilan JWT secret) kullanir; yeni projeler
RS256/asimetrik JWKS. Bu modul JWKS (RS256/ES256) dogrulamayi varsayar; HS256
icin SUPABASE_JWT_SECRET ile fallback TODO(Faz-0) olarak birakilmistir.
"""
from __future__ import annotations

import logging
from enum import StrEnum
from typing import Annotated, Any

import httpx
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from app.core.config import settings

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer(auto_error=True)


class Role(StrEnum):
    """app.user_role enum yansimasi (02-veri-mimarisi.md §2)."""

    MUSTERI = "musteri"
    HIZMET_VEREN = "hizmet_veren"
    DISPATCHER = "dispatcher"
    PLAZA_YONETICI = "plaza_yonetici"
    ADMIN = "admin"


class CurrentUser:
    """Dogrulanmis JWT'den uretilen kullanici baglami."""

    __slots__ = ("user_id", "role", "email", "claims")

    def __init__(self, user_id: str, role: Role, email: str | None, claims: dict[str, Any]):
        self.user_id = user_id
        self.role = role
        self.email = email
        self.claims = claims

    def __repr__(self) -> str:  # pragma: no cover
        return f"CurrentUser(user_id={self.user_id!r}, role={self.role})"


# JWKS istemcisi (anahtarlari cache'ler, periyodik tazeler).
_jwk_client: PyJWKClient | None = None


def _get_jwk_client() -> PyJWKClient | None:
    global _jwk_client
    if _jwk_client is None and settings.supabase_jwks_url:
        # PyJWKClient kendi icinde anahtarlari cache'ler.
        _jwk_client = PyJWKClient(settings.supabase_jwks_url, cache_keys=True)
    return _jwk_client


def _decode_hs256(token: str) -> dict[str, Any]:
    """HS256 fallback — Supabase 'legacy' paylasilan JWT secret ile dogrula.

    Yeni projeler asimetrik (RS256/JWKS) kullanir; ama cogu Supabase projesi hala
    HS256 JWT secret tasir (service_role/anon key'leri de bu secret ile imzali).
    Bu yol JWKS yapilandirilmamissa devreye girer ve yerel testte token uretmeyi
    (ayni secret ile) mumkun kilar.
    """
    return jwt.decode(
        token,
        settings.supabase_jwt_secret,
        algorithms=["HS256"],
        audience="authenticated",
        issuer=settings.supabase_jwt_issuer or None,
        options={"verify_aud": True, "verify_iss": bool(settings.supabase_jwt_issuer)},
    )


def _decode_jwt(token: str) -> dict[str, Any]:
    """JWT imza + exp + iss dogrula, claim sozlugu dondur.

    Oncelik JWKS (RS256/ES256); JWKS yoksa SUPABASE_JWT_SECRET ile HS256 fallback.
    Ikisi de yoksa 503 (auth yapilandirilmadi).
    """
    client = _get_jwk_client()
    if client is None:
        if not settings.supabase_jwt_secret:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"error": "auth_yapilandirilmadi", "detay": "JWKS URL ve JWT secret tanimsiz"},
            )
        try:
            return _decode_hs256(token)
        except jwt.ExpiredSignatureError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": "token_suresi_doldu", "detay": "Oturum suresi doldu"},
            ) from exc
        except jwt.InvalidTokenError as exc:
            logger.warning("HS256 JWT dogrulama basarisiz: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": "gecersiz_token", "detay": "Kimlik dogrulanamadi"},
            ) from exc
    try:
        signing_key = client.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            audience="authenticated",
            issuer=settings.supabase_jwt_issuer or None,
            options={"verify_aud": True, "verify_iss": bool(settings.supabase_jwt_issuer)},
        )
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "token_suresi_doldu", "detay": "Oturum suresi doldu"},
        ) from exc
    except (jwt.InvalidTokenError, httpx.HTTPError) as exc:
        logger.warning("JWT dogrulama basarisiz: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "gecersiz_token", "detay": "Kimlik dogrulanamadi"},
        ) from exc


def _extract_role(claims: dict[str, Any]) -> Role:
    """app_metadata.role oku (user_metadata DEGIL — guvenlik §7.1)."""
    app_meta = claims.get("app_metadata") or {}
    raw = app_meta.get("role", "musteri")
    try:
        return Role(raw)
    except ValueError:
        logger.warning("Bilinmeyen rol claim'i: %r -> musteri'ye dusuruldu", raw)
        return Role.MUSTERI


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
) -> CurrentUser:
    """FastAPI dependency: Bearer JWT dogrula -> CurrentUser."""
    claims = _decode_jwt(credentials.credentials)
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "gecersiz_token", "detay": "sub claim yok"},
        )
    return CurrentUser(
        user_id=user_id,
        role=_extract_role(claims),
        email=claims.get("email"),
        claims=claims,
    )


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


def require_roles(*allowed: Role):
    """Rol-bazli yetki dependency uretici.

    Kullanim:
        @router.post("/orders", dependencies=[Depends(require_roles(Role.MUSTERI))])
    veya endpoint imzasinda:
        user: CurrentUser = Depends(require_roles(Role.HIZMET_VEREN))
    """

    async def _checker(user: CurrentUserDep) -> CurrentUser:
        if user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "yetkisiz",
                    "detay": f"Bu islem icin gerekli rol: {', '.join(r.value for r in allowed)}",
                },
            )
        return user

    return _checker
