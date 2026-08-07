import httpx

from app.core.config import settings

url = "https://app.ticketmaster.com/discovery/v2/events.json"
params = {"apikey": settings.ticketmaster_api_key,
          "classificationName": "music", "size": 3, "sort": "date,asc"}
r = httpx.get(url, params=params, timeout=30)
r.raise_for_status()
data = r.json()
events = data.get("_embedded", {}).get("events", [])
print(f"Ticketmaster OK — {len(events)} events (total available: {data.get('page', {}).get('totalElements')})\n")
for e in events:
    v = (e.get("_embedded", {}).get("venues") or [{}])[0]
    print(f"- {e.get('name')} | {e.get('dates', {}).get('start', {}).get('localDate')} | {v.get('name')}, {v.get('city', {}).get('name')}")
