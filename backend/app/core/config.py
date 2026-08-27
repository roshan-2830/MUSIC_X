from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App configuration, loaded from environment variables / the .env file."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Music X API"

    # Database
    database_url: str = ""

    # Supabase API
    supabase_url: str = ""
    supabase_key: str = ""

    # Event data
    ticketmaster_api_key: str = ""

    # Bandsintown — artist-tour focused, and the only free source that lists an
    # artist's FESTIVAL appearances alongside their own headline dates. Their API
    # returns 403 ("explicit deny") without a REGISTERED app_id, so this stays empty
    # until one is issued; every Bandsintown call is skipped while it is blank.
    bandsintown_app_id: str = ""

    # Last.fm — similar artists and tags from 20 years of scrobbles. Free, instant
    # self-serve key, and (unlike Bandsintown) reachable from this network. Note their
    # terms: commercial use should be declared to partners@last.fm before launch.
    lastfm_api_key: str = ""

    # Tripsure — the CEO's own travel platform, supplying flights and hotels. SERVER TO
    # SERVER ONLY: their integration guide is explicit that the key must never reach a
    # browser or mobile client, so the app calls our endpoints and we call Tripsure. That is
    # why routes/travel.py exists rather than the phone talking to them directly.
    #
    # Hotels and flights sit behind DIFFERENT hosts. Measured 2026-08-27: every flight path
    # on the hotels host answers "Missing Authentication Token", which is API Gateway's
    # phrasing for a route that does not exist there — so the flights base URL is its own
    # setting and flights stay dark until it is supplied.
    tripsure_base_url: str = ""
    tripsure_flights_base_url: str = ""
    tripsure_tenant_id: str = ""
    tripsure_api_key: str = ""

    # Spotify (added later, when Premium is available)
    spotify_client_id: str = ""
    spotify_client_secret: str = ""


settings = Settings()
