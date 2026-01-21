// weatherService.js
import * as Location from 'expo-location';

const API_KEY = 'YOUR_OPENWEATHERMAP_API_KEY'; // Replace with your key

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
  const temperature = data.main.temp;

  return { temperature };
}
