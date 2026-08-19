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

    # Spotify (added later, when Premium is available)
    spotify_client_id: str = ""
    spotify_client_secret: str = ""


settings = Settings()
