import os

from alembic import context
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

url = os.environ["DATABASE_URL"].replace("postgres://", "postgresql://", 1)
url = url.replace("postgresql://", "postgresql+psycopg://", 1)

if context.is_offline_mode():
    context.configure(url=url, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = create_engine(url, poolclass=NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection)
        with context.begin_transaction():
            context.run_migrations()
