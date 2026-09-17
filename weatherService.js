import * as Location from 'expo-location';

const API_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY;

function getWeatherEmoji(id) {
  if (id >= 200 && id < 300) return '⛈️';
  if (id >= 300 && id < 400) return '🌦️';
  if (id >= 500 && id < 600) return '🌧️';
  if (id >= 600 && id < 700) return '❄️';
  if (id >= 700 && id < 800) return '🌫️';
  if (id === 800) return '☀️';
  if (id > 800) return '⛅';
  return '🌡️';
}

async function parseForecastResponse(data) {
  const byDay = {};
  for (const entry of data.list || []) {
    const date = new Date(entry.dt * 1000);
    const key = date.toISOString().split('T')[0];
    const hour = date.getHours();
    if (!byDay[key] || Math.abs(hour - 12) < Math.abs(byDay[key].hour - 12)) {
      byDay[key] = {
        hour,
        temp: Math.round(entry.main.temp),
        emoji: getWeatherEmoji(entry.weather?.[0]?.id ?? 800),
      };
    }
  }
  const result = {};
  for (const [k, v] of Object.entries(byDay)) {
    result[k] = { temp: v.temp, emoji: v.emoji };
  }
  return result;
}

export async function getWeatherForecastForCity(city) {
  const response = await fetch(
    `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&units=imperial&appid=${API_KEY}`
  );
  if (!response.ok) throw new Error(`City not found: ${city}`);
  const data = await response.json();
  return parseForecastResponse(data);
}

export async function getWeatherForCity(city) {
  const response = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&units=imperial&appid=${API_KEY}`
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || `City not found: "${city}"`);
  return {
    temperature: data.main.temp,
    description: data.weather?.[0]?.description
      ? data.weather[0].description.charAt(0).toUpperCase() + data.weather[0].description.slice(1)
      : '',
    emoji: getWeatherEmoji(data.weather?.[0]?.id ?? 800),
    city: data.name || city,
  };
}

export async function getWeatherForecast() {
  let { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return {};

  let location = await Location.getCurrentPositionAsync({});
  const { latitude, longitude } = location.coords;

  const response = await fetch(
    `https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&units=imperial&appid=${API_KEY}`
  );
  const data = await response.json();
  return parseForecastResponse(data);
}

export async function getWeather() {
  let { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission not granted');
  }

  let location = await Location.getCurrentPositionAsync({});
  const { latitude, longitude } = location.coords;

  const response = await fetch(
    `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=imperial&appid=${API_KEY}`
  );

  const data = await response.json();

  return {
    temperature: data.main.temp,
    description: data.weather?.[0]?.description
      ? data.weather[0].description.charAt(0).toUpperCase() + data.weather[0].description.slice(1)
      : '',
    emoji: getWeatherEmoji(data.weather?.[0]?.id ?? 800),
    city: data.name || '',
  };
}
