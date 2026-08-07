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

    # Spotify (added later, when Premium is available)
    spotify_client_id: str = ""
    spotify_client_secret: str = ""


settings = Settings()
