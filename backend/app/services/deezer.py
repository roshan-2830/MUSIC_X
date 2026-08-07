import httpx


def artist_fans(name: str) -> int | None:
    """Deezer fan count. Prefers an exact name match among the top results."""
    if not name:
        return None
    try:
        r = httpx.get("https://api.deezer.com/search/artist",
                      params={"q": name, "limit": 5}, timeout=20)
        r.raise_for_status()
        items = r.json().get("data", [])
        if not items:
            return None
        target = name.strip().lower()
        for it in items:
            if (it.get("name") or "").strip().lower() == target:
                return it.get("nb_fan")
        return items[0].get("nb_fan")
    except Exception:
        return None
