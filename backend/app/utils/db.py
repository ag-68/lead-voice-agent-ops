from sqlalchemy import event, inspect, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from ..config import get_settings
from ..models.database import Base

settings = get_settings()

# One connection per session. A single shared connection cannot serve the
# dashboard and a qualification job at the same time.
engine = create_async_engine(
    settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False, "timeout": 30},
)


@event.listens_for(engine.sync_engine, "connect")
def _sqlite_on_connect(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


def _ensure_lead_columns(sync_conn) -> None:
    """Add columns that create_all will not add on an existing SQLite file."""
    cols = {c["name"] for c in inspect(sync_conn).get_columns("leads")}
    if "voice_conversation_id" not in cols:
        sync_conn.execute(text("ALTER TABLE leads ADD COLUMN voice_conversation_id VARCHAR(255)"))
    if "demo_scheduled_for" not in cols:
        sync_conn.execute(text("ALTER TABLE leads ADD COLUMN demo_scheduled_for VARCHAR(255)"))
    if "demo_booking_notes" not in cols:
        sync_conn.execute(text("ALTER TABLE leads ADD COLUMN demo_booking_notes TEXT"))


def _migrate_status_labels(sync_conn) -> None:
    """Rename legacy enriching/enriched statuses to scoring/scored."""
    sync_conn.execute(text("UPDATE leads SET status = 'scoring' WHERE status = 'enriching'"))
    sync_conn.execute(text("UPDATE leads SET status = 'scored' WHERE status = 'enriched'"))


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_ensure_lead_columns)
        await conn.run_sync(_migrate_status_labels)


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
