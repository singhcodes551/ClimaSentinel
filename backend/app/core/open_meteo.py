"""Open-Meteo Historical Weather Integration Interface.

Prepared architecture for downloading historical meteorological records via the Open-Meteo Archive API.
"""
from typing import Dict, Any, Optional
from datetime import date
import pandas as pd
import httpx


class OpenMeteoClient:
    """Client for querying open-access historical weather data from the Open-Meteo Archive API."""

    ARCHIVE_BASE_URL = "https://archive-api.open-meteo.com/v1/archive"

    STANDARD_VARIABLES = [
        "temperature_2m_mean",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_sum",
        "wind_speed_10m_max",
        "relative_humidity_2m_mean",
        "surface_pressure_mean",
    ]

    def __init__(self, timeout: float = 30.0):
        self.timeout = timeout

    async def fetch_historical_weather(
        self,
        latitude: float,
        longitude: float,
        start_date: str,
        end_date: str,
        daily_variables: Optional[list] = None,
    ) -> pd.DataFrame:
        """Fetches daily historical weather series for coordinates within a date range."""
        params = {
            "latitude": latitude,
            "longitude": longitude,
            "start_date": start_date,
            "end_date": end_date,
            "daily": ",".join(daily_variables or self.STANDARD_VARIABLES),
            "timezone": "UTC",
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(self.ARCHIVE_BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()

        daily_data = data.get("daily", {})
        if not daily_data or "time" not in daily_data:
            raise ValueError("No daily data received from Open-Meteo API.")

        df = pd.DataFrame(daily_data)
        # Rename 'time' to 'date'
        df = df.rename(columns={"time": "date"})
        return df

    @staticmethod
    def get_supported_variables() -> Dict[str, str]:
        """Returns standard Open-Meteo variable definitions mapped to ClimaSentinel parameters."""
        return {
            "temperature_2m_mean": "Daily Mean Temperature (°C)",
            "temperature_2m_max": "Daily Maximum Temperature (°C)",
            "temperature_2m_min": "Daily Minimum Temperature (°C)",
            "precipitation_sum": "Daily Total Precipitation (mm)",
            "wind_speed_10m_max": "Maximum Daily Wind Speed (km/h)",
            "relative_humidity_2m_mean": "Daily Mean Relative Humidity (%)",
            "surface_pressure_mean": "Daily Mean Surface Barometric Pressure (hPa)",
        }

