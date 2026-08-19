"""Genre bucketing — the bridge between Spotify's hyper-specific genres
('desi hip hop', 'australian psych', 'float house') and our coarse event genres
('Rock', 'Pop', 'Hip-Hop/Rap'). Both sides get mapped to one shared vocabulary so
we can honestly say "matches your techno taste"."""
import re
from collections import Counter

# Order matters: specific buckets are checked BEFORE generic ones, so 'k-pop'
# lands in k-pop (not pop) and 'indie rock' lands in indie (not rock).
_BUCKETS: list[tuple[str, list[str]]] = [
    ("electronic", ["techno", "house", "edm", "electro", "trance", "dubstep",
                    "drumandbass", "dnb", "ambient", "idm", "electronic", "garage",
                    "breakbeat", "hardstyle", "synthwave"]),
    ("hip-hop", ["hiphop", "rap", "trap", "drill", "grime"]),
    ("k-pop", ["kpop", "korean"]),
    ("bollywood", ["bollywood", "desi", "filmi", "hindi", "punjabi", "bhangra",
                   "indian", "tamil", "telugu", "haryanvi", "sufi"]),
    ("afrobeats", ["afrobeat", "afro", "amapiano"]),
    ("latin", ["latin", "reggaeton", "salsa", "cumbia", "bachata", "corrido",
               "regionalmexican", "musicamexicana"]),
    ("reggae", ["reggae", "dancehall", "ska"]),
    ("r&b", ["randb", "rnb", "rb", "soul", "funk", "motown", "neosoul"]),
    ("jazz", ["jazz", "bebop", "blues", "swing"]),
    ("classical", ["classical", "orchestral", "opera", "baroque", "symphony"]),
    ("country", ["country", "folk", "americana", "bluegrass"]),
    ("metal", ["metal", "metalcore", "deathcore"]),
    ("indie", ["indie", "alternative", "shoegaze"]),
    ("rock", ["rock", "punk", "grunge", "emo", "hardcore"]),
    ("pop", ["pop"]),
]


def _norm(s: str) -> str:
    """Lowercase and strip punctuation/spaces: 'Hip-Hop/Rap' -> 'hiphoprap'."""
    return re.sub(r"[^a-z0-9]+", "", (s or "").lower())


def bucketize(genre: str) -> str | None:
    """Map one raw genre string to a shared bucket, or None if it doesn't fit any."""
    n = _norm(genre)
    if not n:
        return None
    for bucket, keys in _BUCKETS:
        for k in keys:
            if k in n:
                return bucket
    return None


def genre_weights(genres: list[str]) -> dict[str, float]:
    """Turn a list of raw genre strings into normalized bucket weights,
    e.g. ['techno','deep house','indie rock'] -> {'electronic': 0.67, 'indie': 0.33}."""
    counts: Counter = Counter()
    for g in genres:
        b = bucketize(g)
        if b:
            counts[b] += 1
    total = sum(counts.values())
    if not total:
        return {}
    return {b: round(n / total, 3) for b, n in counts.most_common()}
