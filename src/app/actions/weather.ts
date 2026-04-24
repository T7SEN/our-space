"use server";

// Open-Meteo uses WMO Weather interpretation codes
function getWeatherCondition(code: number): string {
  if (code === 0) return "Clear sky";
  if (code === 1 || code === 2 || code === 3) return "Partly cloudy";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 55) return "Drizzle";
  if (code >= 61 && code <= 65) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code >= 95) return "Thunderstorm";
  return "Unknown";
}

export type WeatherData = {
  temp: number;
  condition: string;
  high: number;
  low: number;
};

export type DualWeatherResponse = {
  myLocation: WeatherData;
  tabuk: WeatherData; // Renamed from riyadh
};

export async function fetchRealWeather(): Promise<DualWeatherResponse> {
  // My Location: Al Shorouk City, Egypt
  // Partner Location: Tabuk, KSA
  const baseUrl = "https://api.open-meteo.com/v1/forecast";
  const params =
    "current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto";

  try {
    const [myRes, tabukRes] = await Promise.all([
      fetch(`${baseUrl}?latitude=30.161472&longitude=31.635861&${params}`, {
        next: { revalidate: 1800 },
      }),
      // Updated coordinates for Tabuk
      fetch(`${baseUrl}?latitude=28.3833&longitude=36.5833&${params}`, {
        next: { revalidate: 1800 },
      }),
    ]);

    const myData = await myRes.json();
    const tabukData = await tabukRes.json();

    return {
      myLocation: {
        temp: Math.round(myData.current.temperature_2m),
        condition: getWeatherCondition(myData.current.weather_code),
        high: Math.round(myData.daily.temperature_2m_max[0]),
        low: Math.round(myData.daily.temperature_2m_min[0]),
      },
      tabuk: {
        temp: Math.round(tabukData.current.temperature_2m),
        condition: getWeatherCondition(tabukData.current.weather_code),
        high: Math.round(tabukData.daily.temperature_2m_max[0]),
        low: Math.round(tabukData.daily.temperature_2m_min[0]),
      },
    };
  } catch (error) {
    console.error("Failed to fetch weather:", error);
    return {
      myLocation: {
        temp: 25,
        condition: "Data unavailable",
        high: 25,
        low: 25,
      },
      tabuk: { temp: 25, condition: "Data unavailable", high: 25, low: 25 },
    };
  }
}
