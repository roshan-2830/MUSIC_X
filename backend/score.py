from app.services.scoring import score_all_events

if __name__ == "__main__":
    print("Scoring events via Deezer…")
    for k, v in score_all_events().items():
        print(f"  {k}: {v}")
