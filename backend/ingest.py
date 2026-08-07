from app.services.ingestion import ingest_from_ticketmaster

if __name__ == "__main__":
    result = ingest_from_ticketmaster(size=100)
    print("Ingestion complete:")
    for k, v in result.items():
        print(f"  {k}: {v}")
