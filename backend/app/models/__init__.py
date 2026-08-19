from app.db.session import Base  # noqa: F401

# Reference
from app.models.city import City  # noqa: F401
from app.models.venue import Venue  # noqa: F401
from app.models.artist import Artist  # noqa: F401
from app.models.artist_similar import ArtistSimilar  # noqa: F401
from app.models.genre import Genre  # noqa: F401

# Events
from app.models.event import Event  # noqa: F401
from app.models.event_artist import EventArtist  # noqa: F401
from app.models.event_genre import EventGenre  # noqa: F401
from app.models.event_offer import EventOffer  # noqa: F401
from app.models.event_highlight import EventHighlight  # noqa: F401
from app.models.event_fact import EventFact  # noqa: F401
from app.models.event_source import EventSource  # noqa: F401
from app.models.event_change import EventChange  # noqa: F401

# Festivals
from app.models.festival import Festival  # noqa: F401
from app.models.festival_genre import FestivalGenre  # noqa: F401
from app.models.festival_lineup import FestivalLineup  # noqa: F401
from app.models.festival_offer import FestivalOffer  # noqa: F401
from app.models.festival_source import FestivalSource  # noqa: F401

# Users & taste
from app.models.profile import Profile  # noqa: F401
from app.models.spotify_account import SpotifyAccount  # noqa: F401
from app.models.taste_profile import TasteProfile  # noqa: F401

# Social & saves
from app.models.calendar_entry import CalendarEntry  # noqa: F401
from app.models.follow import Follow  # noqa: F401
from app.models.bucket_list import BucketListItem  # noqa: F401
from app.models.dismissed_suggestion import DismissedSuggestion  # noqa: F401

# Reviews & Passport
from app.models.review import Review  # noqa: F401
from app.models.review_like import ReviewLike  # noqa: F401
from app.models.passport_entry import PassportEntry  # noqa: F401

# Trips & bookings
from app.models.saved_trip import SavedTrip  # noqa: F401
from app.models.trip_stop import TripStop  # noqa: F401
from app.models.hotel_booking import HotelBooking  # noqa: F401
from app.models.travel_leg import TravelLeg  # noqa: F401

# Notifications & Referrals
from app.models.notification import Notification  # noqa: F401
from app.models.notification_pref import NotificationPref  # noqa: F401
from app.models.referral import Referral  # noqa: F401
