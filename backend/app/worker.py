"""WashApp Worker — zamanlanmis gorevler (Render background worker, TEK instance).

03-yazilim-mimarisi.md §2.2 + 02-veri-mimarisi.md §10: 6 cron gorevi. Cron YALNIZ
1 instance'da kosmali (yoksa payout/onay cift calisir). Her gorev
`SELECT ... FOR UPDATE SKIP LOCKED` ile satir kilitler -> worker cogalsa bile
ayni satir iki kez islenmez (idempotency).

Calistirma:  python -m app.worker
"""
from __future__ import annotations

import asyncio
import logging
import signal

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app import __version__
from app.core.config import settings
from app.core.db import close_pool, init_pool, transaction

logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
logger = logging.getLogger("washapp.worker")


# ---------------------------------------------------------------------------
# (a) 24s otomatik onay — her 60 sn (PR-5)
# ---------------------------------------------------------------------------
async def escrow_auto_confirm() -> None:
    """onay_penceresi_bitis < now() AND status='musteri_onay' -> tamamlandi.

    Capture tetiklenir (confirm_type='auto_24h'). Itiraz aciksa atlanir (status=itiraz).
    """
    logger.debug("escrow_auto_confirm calisiyor")
    async with transaction() as conn:  # noqa: F841 — kullanim asagida
        # TODO(Faz-2):
        #   SELECT id FROM app.orders
        #     WHERE status='musteri_onay' AND onay_penceresi_bitis < now()
        #     FOR UPDATE SKIP LOCKED LIMIT 100;
        #   her satir: Iyzico capture + ledger + status=tamamlandi.
        _ = conn
        pass


# ---------------------------------------------------------------------------
# (b) NSM materialized view refresh — her saat
# ---------------------------------------------------------------------------
async def nsm_refresh() -> None:
    """REFRESH MATERIALIZED VIEW CONCURRENTLY audit.nsm_haftalik (§7.1)."""
    logger.debug("nsm_refresh calisiyor")
    async with transaction() as conn:
        # TODO(Faz-4): REFRESH MATERIALIZED VIEW CONCURRENTLY audit.nsm_haftalik;
        _ = conn
        pass


# ---------------------------------------------------------------------------
# (c) Partition olusturma — gunluk (gelecek ay audit.events partition)
# ---------------------------------------------------------------------------
async def ensure_partitions() -> None:
    """Gelecek ay icin audit.events range partition ac (§8.2)."""
    logger.debug("ensure_partitions calisiyor")
    async with transaction() as conn:
        # TODO(Faz-5):
        #   CREATE TABLE IF NOT EXISTS audit.events_YYYY_MM PARTITION OF audit.events
        #     FOR VALUES FROM ('<ay-basi>') TO ('<sonraki-ay-basi>');
        _ = conn
        pass


# ---------------------------------------------------------------------------
# (d) Payout batch — gunluk 04:00 (cuzdan -> IBAN)
# ---------------------------------------------------------------------------
async def payout_batch() -> None:
    """Hizmet veren cuzdan bakiyesi -> Iyzico alt-uye isyeri payout (§4.3).

    Cuzdan satiri FOR UPDATE SKIP LOCKED ile kilitlenir -> cift odeme imkansiz.
    """
    logger.debug("payout_batch calisiyor")
    async with transaction() as conn:
        # TODO(Faz-2):
        #   SELECT * FROM money.wallets WHERE bakiye > 0 FOR UPDATE SKIP LOCKED;
        #   her cuzdan: Iyzico payout + money.payouts INSERT + ledger payout(-).
        _ = conn
        pass


# ---------------------------------------------------------------------------
# (e) KVKK retention — gunluk 03:00 (saklama suresi dolmus KYC/foto sil)
# ---------------------------------------------------------------------------
async def kvkk_retention() -> None:
    """Yasal saklama bitmis KYC belge/foto Storage'tan sil (§7.3).

    photo_evidence DB satiri append-only (silinmez); yalnizca Storage objesi ve
    onboarding_belgeleri (gerekirse) temizlenir.
    """
    logger.debug("kvkk_retention calisiyor")
    async with transaction() as conn:
        # TODO(Faz-5): saklama suresi dolmus storage_path'leri bul + Storage sil
        #   + audit.admin_actions('retention_silme') log.
        _ = conn
        pass


# ---------------------------------------------------------------------------
# (f) Evidence-KYC gun-bazli dogrula-ve-at (kanit butunlugu)
# ---------------------------------------------------------------------------
async def evidence_kyc_verify_and_purge() -> None:
    """Gun-bazli: bekleyen yuklemeleri sunucu re-hash ile dogrula; gecersizleri at.

    Storage'a yuklenmis ama /evidence/confirm ile dogrulanmamis (yetim) objeler
    ve hash uyusmazligi olan KYC objeleri tespit edilip temizlenir.
    """
    logger.debug("evidence_kyc_verify_and_purge calisiyor")
    async with transaction() as conn:
        # TODO(Faz-3): yetim Storage objesi tespiti + re-hash dogrulama + purge.
        _ = conn
        pass


def build_scheduler() -> AsyncIOScheduler:
    """6 cron gorevini AsyncIOScheduler'a kaydet."""
    sched = AsyncIOScheduler(timezone="Europe/Istanbul")

    sched.add_job(escrow_auto_confirm, IntervalTrigger(seconds=60), id="escrow_auto_confirm")
    sched.add_job(nsm_refresh, IntervalTrigger(hours=1), id="nsm_refresh")
    sched.add_job(ensure_partitions, CronTrigger(hour=2, minute=0), id="ensure_partitions")
    sched.add_job(payout_batch, CronTrigger(hour=4, minute=0), id="payout_batch")
    sched.add_job(kvkk_retention, CronTrigger(hour=3, minute=0), id="kvkk_retention")
    sched.add_job(
        evidence_kyc_verify_and_purge,
        CronTrigger(hour=3, minute=30),
        id="evidence_kyc_verify_and_purge",
    )
    return sched


async def main() -> None:
    logger.info("WashApp worker baslatiliyor (v%s, env=%s).", __version__, settings.app_env)
    await init_pool()
    scheduler = build_scheduler()
    scheduler.start()
    logger.info("Scheduler aktif — %d gorev.", len(scheduler.get_jobs()))

    # Temiz kapanis (SIGTERM/SIGINT) — Render deploy/scale sirasinda.
    stop = asyncio.Event()

    def _handle(*_a):  # pragma: no cover
        logger.info("Kapanis sinyali alindi.")
        stop.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        try:
            loop.add_signal_handler(sig, _handle)
        except NotImplementedError:  # Windows
            signal.signal(sig, _handle)

    try:
        await stop.wait()
    finally:
        scheduler.shutdown(wait=False)
        await close_pool()
        logger.info("Worker durduruldu.")


if __name__ == "__main__":
    asyncio.run(main())
