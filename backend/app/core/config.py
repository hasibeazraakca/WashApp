"""Uygulama yapilandirmasi — pydantic-settings.

Tum sirlar Render env var'dan okunur; repoda gercek deger ASLA bulunmaz.
Fiyat sabitleri plan ile birebir: komisyon 0.22, koruma fonu 15.00 TL,
abonelik 790/1490, AOV 450. Bu sabitler siparise islem aninda kopyalanir
(02-veri-mimarisi.md §10 — eski siparis donar).
"""
from __future__ import annotations

from decimal import Decimal
from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Ortam ---
    # Render env'inde "production" yazilabilir; normalize ederiz (prod/staging/dev).
    app_env: str = "dev"
    log_level: str = "INFO"
    sentry_dsn: str | None = None

    # --- GECICI: kimlik dogrulama bypass (SADECE gelistirme/demo) ---
    # DEV_NO_AUTH=true iken JWT imzasi DOGRULANMAZ (token yine gelir ama imza/exp
    # kontrol edilmez). JWT secret/JWKS ayarlanmadan uygulamayi uctan uca gezmek
    # icin. Pilot/prod'da MUTLAKA kapali (false) olmali. Kod silinmeden, tek env
    # ile geri acilir. Bkz. app/core/security.py::_decode_jwt.
    dev_no_auth: bool = False

    @field_validator("app_env", mode="before")
    @classmethod
    def _normalize_env(cls, v: str) -> str:
        alias = {
            "production": "prod", "prod": "prod", "live": "prod",
            "staging": "staging", "stage": "staging",
            "development": "dev", "develop": "dev", "dev": "dev", "test": "dev", "": "dev",
        }
        return alias.get(str(v).strip().lower(), "dev")

    # --- Supabase ---
    supabase_url: str = "http://localhost:54321"
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_issuer: str = ""
    supabase_jwks_url: str = ""
    supabase_jwt_secret: str = ""  # HS256 fallback (legacy paylasilan secret)

    # --- Postgres: Supavisor TRANSACTION pooler (port 6543 ZORUNLU) ---
    # 03-yazilim-mimarisi.md §2.5: pool_size kucuk, statement_cache_size=0.
    database_url: str = ""
    db_pool_min_size: int = 1
    db_pool_max_size: int = 5  # Supavisor multiplexliyor -> kucuk tut

    # --- Iyzico Pazaryeri (escrow; para WashApp'a ASLA girmez) ---
    iyzico_api_key: str = ""
    iyzico_secret_key: str = ""
    iyzico_base_url: str = "https://sandbox-api.iyzipay.com"
    iyzico_webhook_secret: str = ""

    # --- CORS ---
    cors_origins: str = ""  # virgulle ayrilmis

    # --- Fiyat sabitleri (plan sabitleri — degistirilemez kontratlar) ---
    commission_rate: Decimal = Decimal("0.22")
    koruma_fonu_tl: Decimal = Decimal("15.00")
    subscription_2_wash_tl: Decimal = Decimal("790.00")
    subscription_4_wash_tl: Decimal = Decimal("1490.00")
    aov_tl: Decimal = Decimal("450.00")

    # --- Is kurallari ---
    confirm_window_hours: int = 24
    evidence_signed_url_ttl: int = 60  # saniye
    provider_min_rating: Decimal = Decimal("4.2")
    geofence_radius_m: int = 3000

    @field_validator("database_url")
    @classmethod
    def _warn_pooler_port(cls, v: str) -> str:
        # Supavisor transaction pooler 6543 bekleniyor; 5432 dogrudan baglanti
        # connection limit riski (02-veri-mimarisi.md §8.5).
        if v and ":6543/" not in v and ":5432/" in v:
            import warnings

            warnings.warn(
                "DATABASE_URL dogrudan 5432 kullaniyor; Supavisor pooler (6543) onerilir.",
                stacklevel=2,
            )
        return v

    @property
    def asyncpg_dsn(self) -> str:
        """DATABASE_URL'i asyncpg'nin kabul ettigi sade forma getir.

        - 'postgresql+asyncpg://' (SQLAlchemy) -> 'postgresql://'
        - query string (ornek ?pgbouncer=true / ?statement_cache_size=0) atilir;
          havuz secenekleri kodda (db.py) zaten ayarlanir, asyncpg bilinmeyen query
          parametrelerinde patlayabilir.
        """
        dsn = self.database_url
        for prefix in ("postgresql+asyncpg://", "postgres+asyncpg://", "postgres://"):
            if dsn.startswith(prefix):
                dsn = "postgresql://" + dsn[len(prefix):]
                break
        return dsn.split("?", 1)[0]

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_prod(self) -> bool:
        return self.app_env == "prod"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Singleton ayarlar (env bir kez okunur)."""
    return Settings()


settings = get_settings()
