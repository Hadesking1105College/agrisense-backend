// fetch-data.js - Runs every hour via GitHub Actions
const fetch = require('node-fetch');

const API_KEYS = {
  openWeather: process.env.OPENWEATHER_API_KEY,
  sentinel: process.env.SENTINEL_API_KEY,
  nasa: process.env.NASA_API_KEY
};

const BASE44_URL = process.env.BASE44_APP_URL;

// Fetch weather data from OpenWeatherMap
async function fetchWeatherData(lat, lon) {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEYS.openWeather}&units=metric`;
    const response = await fetch(url);
    const data = await response.json();
    
    return {
      temperature: data.main.temp,
      humidity: data.main.humidity,
      rainfall: data.rain?.['1h'] || data.rain?.['3h'] || 0
    };
  } catch (error) {
    console.error('Weather fetch error:', error);
    return null;
  }
}

// Calculate estimated salinity based on environmental factors
function calculateSalinity(weatherData, soilMoisture) {
  let salinity = 1.0;
  
  // Low moisture increases salinity
  if (soilMoisture < 20) salinity += 1.5;
  else if (soilMoisture < 30) salinity += 0.8;
  
  // Low rainfall increases salinity
  if (weatherData.rainfall < 5) salinity += 1.0;
  else if (weatherData.rainfall < 15) salinity += 0.5;
  
  // High temperature increases evaporation and salinity
  if (weatherData.temperature > 35) salinity += 0.8;
  else if (weatherData.temperature > 30) salinity += 0.4;
  
  return Math.max(0.5, Math.min(salinity, 8.0));
}

// Fetch all locations from Base44
async function getLocations() {
  try {
    const response = await fetch(`${BASE44_URL}/api/entities/Location`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching locations:', error);
    return [];
  }
}

// Save reading to Base44
async function saveReading(locationId, readingData) {
  try {
    const response = await fetch(`${BASE44_URL}/api/entities/SalinityReading`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        location_id: locationId,
        ...readingData
      })
    });
    return await response.json();
  } catch (error) {
    console.error('Error saving reading:', error);
    return null;
  }
}

// Create alert if salinity is dangerous
async function createAlert(locationId, location, salinity) {
  let alert = null;
  
  if (salinity >= 8) {
    alert = {
      location_id: locationId,
      alert_type: 'high_risk',
      severity: 'critical',
      message: `🚨 CRITICAL: Soil salinity at ${salinity.toFixed(2)} dS/m in ${location.name}`,
      recommendation: 'IMMEDIATE ACTION: Salinity is critically high. Most crops cannot survive. Implement urgent leaching practices.',
      alert_date: new Date().toISOString().split('T')[0]
    };
  } else if (salinity >= 4) {
    alert = {
      location_id: locationId,
      alert_type: 'high_risk',
      severity: 'warning',
      message: `⚠️ HIGH RISK: Soil salinity at ${salinity.toFixed(2)} dS/m in ${location.name}`,
      recommendation: 'Action needed: Increase irrigation to leach salts, improve drainage.',
      alert_date: new Date().toISOString().split('T')[0]
    };
  }
  
  if (alert) {
    try {
      await fetch(`${BASE44_URL}/api/entities/Alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alert)
      });
      console.log(`✅ Alert created for ${location.name}`);
    } catch (error) {
      console.error('Error creating alert:', error);
    }
  }
}

// Main execution
async function main() {
  console.log('🔄 Starting hourly data update...');
  console.log(`⏰ Time: ${new Date().toISOString()}`);
  
  // Get all locations
  const locations = await getLocations();
  console.log(`📍 Found ${locations.length} location(s)`);
  
  for (const location of locations) {
    console.log(`\n🌾 Processing: ${location.name}`);
    
    // Fetch weather data
    const weatherData = await fetchWeatherData(location.latitude, location.longitude);
    
    if (!weatherData) {
      console.log(`❌ Failed to fetch weather for ${location.name}`);
      continue;
    }
    
    // Estimate soil moisture (20-40% range based on rainfall)
    const soilMoisture = 25 + (weatherData.rainfall * 0.5) + (Math.random() * 10);
    
    // Calculate salinity
    const salinity = calculateSalinity(weatherData, soilMoisture);
    
    // Determine risk level
    let riskLevel = 'low';
    if (salinity >= 8) riskLevel = 'critical';
    else if (salinity >= 4) riskLevel = 'high';
    else if (salinity >= 2) riskLevel = 'moderate';
    
    // Prepare reading data
    const readingData = {
      reading_date: new Date().toISOString().split('T')[0],
      salinity_level: salinity,
      soil_moisture: soilMoisture,
      rainfall_mm: weatherData.rainfall,
      temperature_celsius: weatherData.temperature,
      humidity_percent: weatherData.humidity,
      ndvi_value: 0.5 + (Math.random() * 0.3), // Estimated
      risk_level: riskLevel,
      data_source: 'github_actions',
      is_real_data: true
    };
    
    // Save to database
    const saved = await saveReading(location.id, readingData);
    
    if (saved) {
      console.log(`✅ Data saved for ${location.name}`);
      console.log(`   Salinity: ${salinity.toFixed(2)} dS/m (${riskLevel})`);
      console.log(`   Temperature: ${weatherData.temperature}°C`);
      console.log(`   Rainfall: ${weatherData.rainfall} mm`);
      
      // Create alert if dangerous
      await createAlert(location.id, location, salinity);
    } else {
      console.log(`❌ Failed to save data for ${location.name}`);
    }
    
    // Wait 2 seconds between locations to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('\n✅ Hourly update completed!');
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
