"""WashApp CLI — operasyon komutlari (migration + OpenAPI export).

Kullanim:
  python -m app.cli migrate            # supabase/migrations/*.sql sirayla uygula
  python -m app.cli migrate --dsn ...  # DATABASE_URL yerine acik DSN (ornek session 5432)
  python -m app.cli export-openapi     # OpenAPI semasini stdout'a yaz

NOT (migration baglantisi): Supavisor TRANSACTION pooler (6543) DDL'i tek baglantida
calistirabilir ama SESSION pooler / direct (5432) daha guvenlidir. --dsn ile session
baglantisini verebilirsin. Migration dosyalari idempotent (IF NOT EXISTS / DO-blok).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

# backend/  (bu dosya backend/app/cli.py) -> repo kokunden supabase/migrations
_MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "supabase" / "migrations"


async def _run_migrations(dsn: str) -> int:
    import asyncpg

    files = sorted(_MIGRATIONS_DIR.glob("*.sql"))
    if not files:
        print(f"[migrate] Migration bulunamadi: {_MIGRATIONS_DIR}", file=sys.stderr)
        return 1

    conn = await asyncpg.connect(dsn=dsn, statement_cache_size=0)
    try:
        for path in files:
            sql = path.read_text(encoding="utf-8")
            print(f"[migrate] uygulaniyor: {path.name} ({len(sql)} bayt)")
            # Tum dosyayi tek simple-query olarak calistir (cok-ifadeli; DO/trigger dahil).
            await conn.execute(sql)
            print(f"[migrate] OK: {path.name}")
    finally:
        await conn.close()
    print(f"[migrate] Tamam — {len(files)} migration uygulandi.")
    return 0


def _export_openapi() -> int:
    # Geç import: OpenAPI uretimi DB gerektirmez.
    from app.main import app

    json.dump(app.openapi(), sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli", description="WashApp CLI")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_mig = sub.add_parser("migrate", help="supabase/migrations/*.sql uygula")
    p_mig.add_argument(
        "--dsn",
        default=None,
        help="Postgres DSN (varsayilan: settings.asyncpg_dsn / DATABASE_URL)",
    )
    sub.add_parser("export-openapi", help="OpenAPI semasini stdout'a yaz")

    args = parser.parse_args(argv)

    if args.cmd == "migrate":
        dsn = args.dsn
        if not dsn:
            from app.core.config import settings

            dsn = settings.asyncpg_dsn
        if not dsn:
            print("[migrate] DSN yok — DATABASE_URL ayarli degil ve --dsn verilmedi.",
                  file=sys.stderr)
            return 2
        return asyncio.run(_run_migrations(dsn))

    if args.cmd == "export-openapi":
        return _export_openapi()

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
