// Simple fetch stub for Playwright route interception.
// Used to ensure the app never reaches real Open-Meteo / WeatherAPI.
// In practice, tests use PLAYWRIGHT route interception in smoke.spec.ts.
module.exports = {
  weather: {
    current: {
      temperature: 22,
      windSpeed: 15,
      precipitation: 0,
    },
    forecast: [],
  },
}
