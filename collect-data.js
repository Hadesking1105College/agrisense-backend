const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

// 🔧 ADD YOUR FIELD LOCATIONS HERE
const LOCATIONS = [
  { name: "North Field", latitude: 28.6139, longitude: 77.2090 },
  { name: "South Field", latitude: 13.0827, longitude: 80.2707 },
  // Add more locations matching your app
];

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

// Fetch weather data
async function fetchWeatherData(lat, lon) {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHER_API_KEY}&units=metric`;
    const response = await fetch(url);
    const data = await response.json();
    
    return {
      temperature: data.main.temp,
      humidity: data.main.humidity,
      rainfall: data.rain?.['1h'] || data.rain?.['3h'] || 0,
      success: true
    };
  } catch (error) {
    console.error('Weather API Error:', error);
    return { success: false };
  }
}

// Calculate salinity
function calculateSalinity(weatherData, soilMoisture) {
  let salinity = 1.0;
  
  if (soilMoisture < 20) salinity += 1.5;
  else if (soilMoisture < 30) salinity += 0.8;
  
  if (weatherData.rainfall < 5) salinity += 1.0;
  else if (weatherData.rainfall < 15) salinity += 0.5;
  
  if (weatherData.temperature > 35) salinity += 0.8;
  else if (weatherData.temperature > 30) salinity += 0.4;
  
  salinity += (Math.random() - 0.5) * 0.4;
  
  return Math.max(0.5, Math.min(salinity, 8.0));
}

// Calculate NDVI
function calculateNDVI(weatherData, soilMoisture) {
  let ndvi = 0.5;
  
  if (soilMoisture > 35) ndvi += 0.2;
  else if (soilMoisture > 25) ndvi += 0.1;
  else if (soilMoisture < 15) ndvi -= 0.2;
  
  if (weatherData.temperature > 20 && weatherData.temperature < 30) ndvi += 0.1;
  else if (weatherData.temperature > 35) ndvi -= 0.15;
  
  if (weatherData.rainfall > 10) ndvi += 0.1;
  
  ndvi += (Math.random() - 0.5) * 0.1;
  
  return Math.max(-0.2, Math.min(ndvi, 0.9));
}

// Main function
async function main() {
  console.log('🔄 Starting data collection...');
  console.log(`⏰ Time: ${new Date().toISOString()}`);
  
  // Load existing data
  const dataFilePath = path.join(__dirname, 'data', 'readings.json');
  let existingData = [];
  
  if (fs.existsSync(dataFilePath)) {
    const fileContent = fs.readFileSync(dataFilePath, 'utf8');
    existingData = JSON.parse(fileContent);
  }
  
  const newReadings = [];
  
  for (const location of LOCATIONS) {
    console.log(`\n📍 Processing: ${location.name}`);
    
    const weatherData = await fetchWeatherData(location.latitude, location.longitude);
    
    if (!weatherData.success) {
      console.log(`❌ Failed to fetch weather for ${location.name}`);
      continue;
    }
    
    const soilMoisture = 25 + (weatherData.rainfall * 0.5) + (weatherData.humidity * 0.15) + (Math.random() * 5);
    const salinity = calculateSalinity(weatherData, soilMoisture);
    const ndvi = calculateNDVI(weatherData, soilMoisture);
    
    let riskLevel = 'low';
    if (salinity >= 8) riskLevel = 'critical';
    else if (salinity >= 4) riskLevel = 'high';
    else if (salinity >= 2) riskLevel = 'moderate';
    
    const reading = {
      timestamp: new Date().toISOString(),
      reading_date: new Date().toISOString().split('T')[0],
      location_name: location.name,
      latitude: location.latitude,
      longitude: location.longitude,
      salinity_level: parseFloat(salinity.toFixed(2)),
      soil_moisture: parseFloat(soilMoisture.toFixed(1)),
      rainfall_mm: parseFloat(weatherData.rainfall.toFixed(1)),
      temperature_celsius: parseFloat(weatherData.temperature.toFixed(1)),
      humidity_percent: parseFloat(weatherData.humidity.toFixed(0)),
      ndvi_value: parseFloat(ndvi.toFixed(3)),
      risk_level: riskLevel,
      data_source: 'github_actions'
    };
    
    newReadings.push(reading);
    
    console.log(`✅ Collected data for ${location.name}`);
    console.log(`   📊 Salinity: ${salinity.toFixed(2)} dS/m (${riskLevel})`);
    console.log(`   🌡️  Temperature: ${weatherData.temperature}°C`);
    console.log(`   💧 Rainfall: ${weatherData.rainfall} mm`);
  }
  
  // Combine with existing data (keep last 500 readings)
  const allData = [...existingData, ...newReadings].slice(-500);
  
  // Save to file
  fs.writeFileSync(dataFilePath, JSON.stringify(allData, null, 2));
  
  console.log(`\n✅ Saved ${newReadings.length} new readings to data/readings.json`);
  console.log(`📦 Total readings in file: ${allData.length}`);
}

main().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
