from sqlalchemy import create_engine, inspect

from app.core.config import settings

url = settings.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
insp = inspect(create_engine(url))

tables = sorted(insp.get_table_names())
print(f"{len(tables)} tables found:\n")
for table in tables:
    print(f"=== {table} ===")
    for col in insp.get_columns(table):
        flag = "" if col["nullable"] else "  NOT NULL"
        print(f"   {col['name']}: {col['type']}{flag}")
    for fk in insp.get_foreign_keys(table):
        print(f"   FK {fk['constrained_columns']} -> {fk['referred_table']}.{fk['referred_columns']}")
    print()
