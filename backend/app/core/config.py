from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App configuration, loaded from environment variables / the .env file."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Music X API"
    # Optional. Only needed once push security is enabled in the EAS dashboard, at which
    # point unauthenticated sends are rejected. Should be set before launch: without it,
    # anybody holding one of our push tokens could send to it.
    expo_access_token: str | None = None

    # WEB PUSH (browser notifications). The public key identifies us to the browser's push
    # service and is handed to the page; the private key signs every send and never leaves here.
    # They are a PAIR — regenerating either one silently invalidates every subscription anyone
    # has already granted, and those people simply stop being notified with no error anywhere.
    # vapid_subject must be a mailto: or https: URL; push services reject a send without it.
    vapid_public_key: str = ""
    vapid_private_key: str = ""
    vapid_subject: str = "mailto:jadhav.r@yangtsofour.com"

    # setlist.fm. Free for NON-COMMERCIAL use only — commercial use needs their written
    # permission, and this app takes affiliate revenue. Apply at setlist.fm/settings/api.
    setlistfm_api_key: str = ""

    # Web origins allowed to call this API from a BROWSER, comma separated
    # (e.g. "https://musicx.onrender.com,http://localhost:8081"). Native builds are not
    # subject to CORS at all, so this list is only ever about the web app.
    #
    # It cannot be "*": a browser IGNORES the wildcard when credentials are allowed, so
    # "*" plus allow_credentials is not permissive-but-sloppy, it is broken. Production
    # must name its origins.
    cors_origins: str = ""

    # Supabase user ids allowed to hit /admin/*, comma separated. These endpoints spend real
    # money — one /admin/refresh re-verifies the entire catalogue against Ticketmaster — so
    # "any logged-in account" stops being a sufficient gate the moment the app is public.
    #
    # Empty means CLOSED, not open: an env var that failed to load should lock the owner out
    # of their own admin routes, never hand them to every visitor.
    admin_user_ids: str = ""

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
    # Hotels and flights are separate services with SEPARATE credentials — a different
    # tenant AND a different key, not just a different host. Sharing one pair, as the first
    # version did, would have authenticated against the wrong service.
    tripsure_base_url: str = ""
    tripsure_tenant_id: str = ""
    tripsure_api_key: str = ""

    tripsure_flight_base_url: str = ""
    tripsure_flight_tenant_id: str = ""
    tripsure_flight_api_key: str = ""

    # Spotify (added later, when Premium is available)
    spotify_client_id: str = ""
    spotify_client_secret: str = ""


settings = Settings()
