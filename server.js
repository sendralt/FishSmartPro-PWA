console.log('🚀 Server initialization started...');
/**
 * FishSmart Pro - Advanced AI-Powered Fishing Intelligence Platform
 * Server: Node.js/Express backend with Gemini AI integration
 * Architecture: Modular, RESTful API with enhanced error handling
 */

require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');

// Security: Import helmet for security headers
const helmet = require('helmet');

// Initialize Express application
const app = express();

// Security: Add security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
        },
    },
    hsts: true,
}));

// Disable X-Powered-By header
app.disable('x-powered-by');

const DEFAULT_PORT = 3000;
const PORT = Number.parseInt(process.env.PORT, 10) || DEFAULT_PORT;
const HAS_EXPLICIT_PORT = Boolean(process.env.PORT);
const MAX_PORT_FALLBACK_ATTEMPTS = 10;

// Middleware configuration
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Initialize AI services
let genAI = null;
try {
    if (process.env.GEMINI_API_KEY) {
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        console.log('✓ Gemini AI initialized successfully');
    } else {
        console.warn('⚠ GEMINI_API_KEY not found - AI features will be limited');
    }
} catch (error) {
    console.error('✗ Failed to initialize Gemini AI:', error.message);
}

// Load fish behavior patterns
let fishPatterns = '';
const patternsPath = path.join(__dirname, 'fish-behavior-patterns.md');
if (fs.existsSync(patternsPath)) {
    try {
        fishPatterns = fs.readFileSync(patternsPath, 'utf-8');
        console.log('✓ Fish behavior patterns loaded');
    } catch (error) {
        console.warn('⚠ Failed to load fish patterns:', error.message);
    }
}

// Load scientific fishing datasets
let fishingData = { species_data: [] };
const fishingDataPath = path.join(__dirname, 'fishingData.json');
if (fs.existsSync(fishingDataPath)) {
    try {
        fishingData = JSON.parse(fs.readFileSync(fishingDataPath, 'utf-8'));
        console.log('✓ Scientific species data loaded');
    } catch (error) {
        console.warn('⚠ Failed to load fishing data:', error.message);
    }
} else {
    console.warn('⚠ fishingData.json not found - scientific engine will use fallbacks');
}

let lureData = { lure_catalog: [] };
const lureDataPath = path.join(__dirname, 'lures.json');
if (fs.existsSync(lureDataPath)) {
    try {
        lureData = JSON.parse(fs.readFileSync(lureDataPath, 'utf-8'));
        console.log('✓ Lure catalog loaded');
    } catch (error) {
        console.warn('⚠ Failed to load lure data:', error.message);
    }
} else {
    console.warn('⚠ lures.json not found - lure recommendations will be unavailable');
}

// ============================================================================
// WEATHER SERVICE - Enhanced with multi-source fallback
// ============================================================================

/**
 * Fetch weather data for a free-form location string.
 *
 * Strategy:
 * 1) Use IPGeolocation Timezone API to resolve the location to coordinates
 *    and query current conditions from Open-Meteo (no API key required).
 * 2) If that fails for any reason, fall back to OpenWeather's city search
 *    using intelligent search-term variations.
 *
 * @param {string} location - Location name or body of water
 * @returns {Promise<Object|null>} Normalized weather object or null if all providers fail
 */
async function getWeatherData(location) {
	// ---------------------------------------------------------------------
	// 1) Preferred path: IPGeolocation (geocoding) + Open-Meteo (current wx)
	// ---------------------------------------------------------------------
	const ipGeoKey = process.env.IPGEOLOCATION_API_KEY;
	if (ipGeoKey) {
	    try {
	        const coords = await resolveLocationToCoordinates(location, ipGeoKey);
	        if (coords) {
	            const openMeteoWeather = await fetchFromOpenMeteo(coords);
	            if (openMeteoWeather) {
	                return openMeteoWeather;
	            }
	        }
	    } catch (error) {
	        console.warn('Weather Fetch Warning (Open-Meteo/IPGeolocation):', error.message);
	    }
	} else {
	    console.warn('Weather Fetch Notice: IPGEOLOCATION_API_KEY is not set, skipping geocoding-based provider.');
	}

	// -------------------------------------------------------------
	// 2) Fallback path: existing OpenWeather name-based lookups
	// -------------------------------------------------------------
	const apiKey = process.env.OPENWEATHER_API_KEY;
	if (!apiKey) {
	    console.warn('Weather Fetch Warning: OPENWEATHER_API_KEY is not set.');
	    return null;
	}

	// Generate multiple search variations for better location matching
	const searchTerms = generateSearchVariations(location);
	
	for (const term of searchTerms) {
	    try {
	        const weatherData = await fetchFromOpenWeather(term, apiKey);
	        if (weatherData) {
	            return transformWeatherData(weatherData);
	        }
	    } catch (error) {
	        console.warn(`Weather Fetch Warning for "${term}":`, error.message);
	    }
	}

	console.error('Weather Fetch Error: All location variations failed.');
	return null;
}

/**
 * Generate intelligent search variations for location
 * @param {string} location - Original location string
 * @returns {Array<string>} Array of search terms to try
 */
function generateSearchVariations(location) {
    const variations = new Set();
    const cleanLocation = location.trim();
    
    // Add original location
    variations.add(cleanLocation);
    
    // Try extracting city/state if comma-separated
    if (cleanLocation.includes(',')) {
        const parts = cleanLocation.split(',').map(p => p.trim());
        variations.add(parts[0]); // Just the body of water
        if (parts.length > 1) {
            variations.add(parts.slice(1).join(', ')); // The city/state
            variations.add(parts[1]); // Just the city
        }
    }
    
    // Remove common water body words and try again
    const waterBodyWords = ['lake', 'river', 'pond', 'reservoir', 'bay', 'creek', 'stream'];
    const cleaned = cleanLocation.split(' ').filter(word => 
        !waterBodyWords.includes(word.toLowerCase().replace(/[^a-z]/g, ''))
    ).join(' ');
    
    if (cleaned && cleaned !== cleanLocation) {
        variations.add(cleaned);
    }
    
    return Array.from(variations).filter(term => term.length > 0);
}

/**
 * Fetch data from OpenWeather API
 * @param {string} term - Search term
 * @param {string} apiKey - API key
 * @returns {Promise<Object|null>} Raw weather data
 */
async function fetchFromOpenWeather(term, apiKey) {
    const currentUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(term)}&appid=${apiKey}&units=imperial`;
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(term)}&appid=${apiKey}&units=imperial`;

    try {
        const [currentRes, forecastRes] = await Promise.all([
            fetch(currentUrl, { signal: AbortSignal.timeout(5000) }),
            fetch(forecastUrl, { signal: AbortSignal.timeout(5000) })
        ]);

        if (currentRes.status === 404) return null;
        if (!currentRes.ok) throw new Error(`Weather service returned ${currentRes.status}`);

        const currentData = await currentRes.json();
        const forecastData = forecastRes.ok ? await forecastRes.json() : null;

        return { current: currentData, forecast: forecastData };
    } catch (error) {
        console.error('Weather Fetch Error:', error);
        throw error;
    }
}

/**
 * Transform raw weather data into standardized format
 * @param {Object} data - Raw weather data from API
 * @returns {Object} Transformed weather data
 */

function transformWeatherData(data) {
    if (!data || !data.current) return null;
    const current = data.current;

    // Process 12-hour forecast (4 intervals of 3 hours each from OpenWeather)
    const forecast_12h = [];
    if (data.forecast && data.forecast.list) {
        data.forecast.list.slice(0, 4).forEach(item => {
            forecast_12h.push({
                time: item.dt_txt,
                temp: Math.round(item.main.temp),
                pressure: item.main.pressure
            });
        });
    }

    return {
        temp: Math.round(current.main.temp),
        feels_like: Math.round(current.main.feels_like),
        humidity: current.main.humidity,
        pressure: current.main.pressure,
        desc: current.weather?.[0]?.description || 'Unknown',
        icon: current.weather?.[0]?.icon || '01d',
        wind: {
            speed: Math.round(current.wind.speed),
            direction: current.wind.deg
        },
        visibility: current.visibility ? (current.visibility / 1609.34).toFixed(1) : null,
        forecast_12h: forecast_12h
    };
}


/**
 * Resolve a user-entered body of water or location string to coordinates
 * using IPGeolocation's Timezone API.
 *
 * @param {string} location
 * @param {string} apiKey
 * @returns {Promise<{ lat: number, lon: number } | null>}
 */
async function resolveLocationToCoordinates(location, apiKey) {
	const url = `https://api.ipgeolocation.io/v3/timezone?apiKey=${apiKey}&location=${encodeURIComponent(location)}`;

	const response = await fetch(url, {
	    headers: {
	        'Accept': 'application/json',
	        'User-Agent': 'FishSmart-Pro/2.0'
	    },
	    signal: AbortSignal.timeout(5000)
	});

	if (response.status === 404) {
	    return null; // Invalid or unknown location string
	}

	if (!response.ok) {
	    throw new Error(`IPGeolocation returned ${response.status}`);
	}

	const data = await response.json();
	const loc = data && data.location;
	if (!loc || !loc.latitude || !loc.longitude) {
	    throw new Error('IPGeolocation response missing coordinates');
	}

	const lat = parseFloat(loc.latitude);
	const lon = parseFloat(loc.longitude);
	if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
	    throw new Error('Invalid coordinates from IPGeolocation');
	}

	return { lat, lon };
}

/**
 * Fetch current conditions from Open-Meteo using coordinates and
 * normalize into the same structure used elsewhere in the app.
 *
 * @param {{ lat: number, lon: number }} coords
 * @returns {Promise<Object|null>} Normalized weather data
 */
async function fetchFromOpenMeteo(coords) {
	const { lat, lon } = coords;
	if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
	    throw new Error('fetchFromOpenMeteo received invalid coordinates');
	}

	const params = new URLSearchParams({
	    latitude: String(lat),
	    longitude: String(lon),
	    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,pressure_msl,wind_speed_10m,wind_direction_10m,cloud_cover,visibility',
	    temperature_unit: 'fahrenheit',
	    wind_speed_unit: 'mph',
	    timezone: 'auto'
	});

	const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;

	const response = await fetch(url, {
	    headers: {
	        'Accept': 'application/json',
	        'User-Agent': 'FishSmart-Pro/2.0'
	    },
	    signal: AbortSignal.timeout(5000)
	});

	if (!response.ok) {
	    throw new Error(`Open-Meteo returned ${response.status}`);
	}

	const data = await response.json();
	if (!data || !data.current) {
	    throw new Error('Open-Meteo response missing current weather');
	}

	const current = data.current;

	// Build a pseudo OpenWeather-style object so we can reuse transformWeatherData
	const pseudo = {
	    main: {
	        temp: typeof current.temperature_2m === 'number' ? current.temperature_2m : 0,
	        temp_min: typeof current.temperature_2m === 'number' ? current.temperature_2m : 0,
	        temp_max: typeof current.temperature_2m === 'number' ? current.temperature_2m : 0,
	        feels_like: typeof current.apparent_temperature === 'number'
	            ? current.apparent_temperature
	            : (typeof current.temperature_2m === 'number' ? current.temperature_2m : 0),
	        pressure: typeof current.pressure_msl === 'number' ? Math.round(current.pressure_msl) : 0,
	        humidity: typeof current.relative_humidity_2m === 'number' ? current.relative_humidity_2m : 0
	    },
	    wind: {
	        speed: typeof current.wind_speed_10m === 'number' ? current.wind_speed_10m : 0,
	        deg: typeof current.wind_direction_10m === 'number' ? current.wind_direction_10m : 0
	    },
	    weather: [{
	        description: describeCloudCover(current.cloud_cover),
	        // Map to a simple OpenWeather-style icon code for UI compatibility
	        icon: cloudCoverToIconCode(current.cloud_cover)
	    }],
	    visibility: typeof current.visibility === 'number' ? current.visibility : null,
	    clouds: { all: typeof current.cloud_cover === 'number' ? current.cloud_cover : 0 }
	};

	return transformWeatherData(pseudo);
}

/**
 * Convert cloud cover percentage into a simple text description.
 * @param {number} cloudCover
 * @returns {string}
 */
function describeCloudCover(cloudCover) {
	if (typeof cloudCover !== 'number') return 'Unknown';
	if (cloudCover < 20) return 'clear sky';
	if (cloudCover < 50) return 'few clouds';
	if (cloudCover < 80) return 'scattered clouds';
	return 'overcast clouds';
}

/**
 * Map cloud cover percentage to a basic OpenWeather-style icon code.
 * @param {number} cloudCover
 * @returns {string}
 */
function cloudCoverToIconCode(cloudCover) {
	if (typeof cloudCover !== 'number') return '01d';
	if (cloudCover < 20) return '01d';
	if (cloudCover < 50) return '02d';
	if (cloudCover < 80) return '03d';
	return '04d';
}

// ============================================================================
// AI STRATEGY GENERATION - Enhanced with better prompts
// ============================================================================

/**
 * Generate fishing strategy using Gemini AI
 * @param {Object} params - Generation parameters
 * @returns {Promise<Object>} Generated strategy data
 */
async function generateFishingStrategy(params) {
    const { location, species, clarity, engine, isBoat, currentTime } = params;

    // Fetch weather data for context
    const weather = await getWeatherData(location);
    const scientificData = calculateScientificStrategy({
        speciesName: species,
        waterColor: clarity
    }, weather, { useLureCatalog: false });
    const weatherContext = weather
        ? `CURRENT WEATHER: ${weather.temp}°F (feels like ${weather.feels_like}°F), ${weather.desc}, Wind: ${weather.wind.speed} mph ${getWindDirection(weather.wind.direction)}, Pressure: ${weather.pressure}mb, Humidity: ${weather.humidity}%, Visibility: ${weather.visibility ? weather.visibility + ' mi' : 'N/A'}`
        : "WEATHER DATA: Unavailable (use seasonal averages)";
    const scientificContext = scientificData
        ? `SCIENTIFIC ENGINE: Bite ${scientificData.biteProbability}% (${scientificData.biteRank}); Metabolic Efficiency ${scientificData.metabolicEfficiency}%; Pressure Trend ${scientificData.pressureTrend}; Recommended Strategy ${scientificData.strategyType}`
        : 'SCIENTIFIC ENGINE: Unavailable';

    if (!genAI) {
        return buildOfflineFishingStrategy(params, weather, 'AI service unavailable');
    }

	    const model = genAI.getGenerativeModel({
	        model: engine || 'gemini-3-flash-preview',
	        generationConfig: { responseMimeType: "application/json" }
	    });

	    const prompt = buildGenerationPrompt({
        species,
        location,
        clarity,
        isBoat,
        currentTime,
        weatherContext,
	        scientificContext,
	        fishPatterns: fishPatterns.substring(0, 5000)
	    });
		
		    try {
		        // Call Gemini and robustly parse the JSON it returns
		        const result = await model.generateContent(prompt);
		        const rawText = result.response.text();
		        // Security: Only log in development mode
		        if (process.env.NODE_ENV === 'development') {
		            console.log('\n[Gemini raw response]\n', rawText, '\n');
		        }
		
		        let responseJson;
		        try {
		            responseJson = JSON.parse(rawText);
		        } catch (err) {
		            console.error('Gemini JSON parse error:', err.message);
		            throw new Error('AI response could not be parsed');
		        }
		
		        const activity = Array.isArray(responseJson.activity_forecast) &&
		            responseJson.activity_forecast.length === 12
		                ? responseJson.activity_forecast
		                : generateDefaultActivity();
		
		        const biteMetrics = scientificData
		            ? {
		                score: scientificData.biteProbability,
		                rank: scientificData.biteRank,
		                reasoning: scientificData.biteReasoning
		            }
		            : calculateScientificBiteProbability(weather);
		
		        // Fallback text if Gemini ever omits expected fields
		        const fallbackStrategy = `No detailed AI strategy was returned, so here is a baseline
		        approach: focus on key structure, adjust lure size and color to match local forage,
		        and use slower presentations during tougher, high-pressure conditions.`;
		
		        const fallbackSafety = `Always wear a life jacket, monitor changing weather closely,
		        and follow all local boating and fishing regulations for this body of water.`;
		
		        const fallbackIntel = `Target obvious structure such as points, docks, weed edges,
		        and depth transitions. Use your electronics or mapping app to refine the best lines.`;
		
		        return {
		            strategy: ensureString(responseJson.strategy) || fallbackStrategy,
		            safety: ensureString(responseJson.safety) || fallbackSafety,
		            intel: ensureString(responseJson.intel) || fallbackIntel,
		            activity,
		            weather: weather,
		            scientific_data: scientificData,
		            recommended_lures: [],
		            solunar: {
		                moon_phase: responseJson.solunar?.moon_phase || 'Unknown',
		                assessment: responseJson.solunar?.assessment || 'No assessment available'
		            },
		            map_url: `https://www.google.com/maps/search/${encodeURIComponent(location)}`,
		            bite_probability: biteMetrics.score,
		            bite_rank: biteMetrics.rank,
		            bite_reasoning: biteMetrics.reasoning
		        };
		    } catch (error) {
		        console.error('❌ AI GENERATION ERROR:', error.message);
        console.log('💡 Note: Check your GEMINI_API_KEY in Render environment variables.');
		        return buildOfflineFishingStrategy(params, weather, error.message);
		    }
}

function buildOfflineFishingStrategy(params, weather, reason) {
    const { location, species, clarity } = params;
    const scientificData = calculateScientificStrategy({
        speciesName: species,
        waterColor: clarity
    }, weather, { useLureCatalog: true });

    const topLure = scientificData?.recommendedLures?.[0] || null;
    const backupLure = scientificData?.recommendedLures?.[1] || null;
    const strategy = topLure
        ? `Offline mode strategy for ${species}: start with ${topLure.name} around ${topLure.cover}. ${topLure.presentation || 'Match lure depth and cadence to fish activity.'} ${backupLure ? `If needed, rotate to ${backupLure.name} as a secondary option.` : ''}`
        : `Offline mode strategy for ${species}: focus on structure, adjust lure size and color to water clarity, and slow down presentations when conditions are tough.`;

    const intel = topLure
        ? `Offline catalog match: ${topLure.reason || 'Local lure catalog selected this option.'}`
        : 'Offline catalog fallback: use local forage, clarity, and structure cues to narrow lure choice.';

    return {
        strategy,
        safety: `Offline mode: verify weather locally before launch, wear a life jacket, and follow all local regulations. ${reason ? `Fallback reason: ${reason}.` : ''}`,
        intel,
        activity: generateDefaultActivity(),
        weather,
        scientific_data: scientificData,
        recommended_lures: scientificData?.recommendedLures || [],
        solunar: {
            moon_phase: 'Unknown',
            assessment: 'Offline mode does not include live solunar data.'
        },
        map_url: `https://www.google.com/maps/search/${encodeURIComponent(location)}`,
        bite_probability: scientificData?.biteProbability || 50,
        bite_rank: scientificData?.biteRank || 'Fair',
        bite_reasoning: scientificData?.biteReasoning || 'Offline scientific fallback applied.',
        forecast_12h: [],
        offline_mode: true
    };
}

/**
 * Build the AI generation prompt
 */
function buildGenerationPrompt(params) {
    return `
You are an Elite Pro Fishing Guide with 30+ years of experience. Generate a highly detailed, actionable strategy for ${params.species} at ${params.location}.

INPUTS:
- Water Clarity: ${params.clarity}
- Style: ${params.isBoat ? 'Boat' : 'Shore'}
- Local Time: ${params.currentTime}
- Behavior Data: ${params.fishPatterns}
- Live Weather: ${params.weatherContext}
- Scientific Guidance: ${params.scientificContext}

OUTPUT FORMAT (JSON):
{
    "strategy": "Your detailed strategy here. Use Markdown formatting. Include specific techniques, lure recommendations, depth ranges, and how current conditions affect the bite. Be specific and actionable.",
    "safety": "3-5 specific safety tips based on current weather and location. Include boat safety if applicable, weather warnings, and local regulations.",
    "intel": "Specific location intelligence: best areas to fish, structure to target, forage to mimic, expected depths, and any local patterns.",
    "activity_forecast": [6, 8, 9, 10, 8, 7, 5, 4, 3, 4, 6, 8],
    "solunar": {
        "moon_phase": "Current moon phase based on today's date",
        "assessment": "Brief assessment of how moon phase and weather conditions are currently affecting fish activity"
    }
}

STRICT RULES:
- The "activity_forecast" must be an array of 12 integers (1-10) representing the next 12 hours of fish activity
- Consider barometric pressure trends, moon phase, and weather conditions in your assessment
- Use the scientific guidance when choosing lure style, depth, and presentation
- Provide specific, actionable advice - not generic tips
- Include depth ranges and specific techniques for the conditions
`;
}

/**
 * Get wind direction from degrees
 */
function getWindDirection(degrees) {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return directions[Math.round(degrees / 22.5) % 16];
}

/**
 * Ensure value is a string
 */
function ensureString(val) {
    if (Array.isArray(val)) return val.join('\n');
    if (typeof val === 'string') return val;
    return String(val || '');
}

	/**
	 * Generate default activity forecast
	 */
	function generateDefaultActivity() {
	    return [6, 7, 8, 9, 8, 7, 6, 5, 4, 5, 6, 7];
	}

	// --- Scientific strategy engine ---
	function getSpeciesMetrics(speciesName) {
	    return fishingData?.species_data?.find(entry => entry.name === speciesName)?.scientific_metrics || null;
	}

	function getLureCatalog() {
	    if (Array.isArray(lureData?.lure_catalog)) return lureData.lure_catalog;
	    if (Array.isArray(lureData)) return lureData;
	    return [];
	}

	function getLureSpecies(lure) {
	    if (Array.isArray(lure?.primary_species)) return lure.primary_species;
	    if (Array.isArray(lure?.species)) return lure.species;
	    return [];
	}

	function getLureCategory(lure) {
	    return lure?.category || lure?.type || 'Unknown';
	}

	function getWaterClarityScore(lure, waterColor) {
	    return lure?.best_conditions?.water_clarity?.[waterColor] ?? 0.5;
	}

	function rankScientificBiteProbability(score) {
	    if (score >= 76) return 'Excellent';
	    if (score >= 56) return 'Good';
	    if (score >= 36) return 'Fair';
	    return 'Tough';
	}

	function buildScientificReasoning(result) {
	    return `Metabolic efficiency is ${result.metabolicEfficiency}% with a ${result.pressureTrend.toLowerCase()} pressure profile, supporting a ${result.strategyType.toLowerCase()} approach.`;
	}

	function calculateScientificBiteProbability(weather) {
		    const result = calculateScientificStrategy({ speciesName: null, waterColor: 'Clear' }, weather, { useLureCatalog: false });
	    return {
	        score: result.biteProbability,
	        rank: result.biteRank,
	        reasoning: result.biteReasoning
	    };
	}

		function calculateScientificStrategy(input, weather, options = {}) {
	    try {
		        const { useLureCatalog = false } = options;
	        const { speciesName, waterColor } = input;
	        const metrics = getSpeciesMetrics(speciesName) || { opt: 65, dorm: 45, sensitivity: 'Medium' };
	        const currentTemp = weather?.temp || 65;
	        const currentPressureHpa = weather?.pressure || 1013.25;
	        const currentPressureInHg = currentPressureHpa * 0.02953;

	        // Pressure Trend Logic based on fishing rules:
	        // High Pressure (30.50+/Clear Skies) - Fish bite Medium to Slow in deeper water
	        // Medium Pressure (29.70-30.40/Fair Weather) - Normal Fishing
	        // Low Pressure (29.60 and under/Cloudy/Rainy) - Fishing Slows
	        // Rising Pressure/Improving Weather – Fish slightly active, go slow
	        // Stable Pressure/Fair Weather - Normal Fishing
	        // Falling Pressure/Degrading Weather - Best Fishing, fish take anything
	        
	        let pressureTrend = 'Stable';
	        let pressureCoeff = 1.0; // Normal fishing
	        
	        if (currentPressureInHg >= 30.50) {
	            pressureTrend = 'High (Clear Skies)';
	            pressureCoeff = 0.5; // Medium to slow bite
	        } else if (currentPressureInHg >= 29.70 && currentPressureInHg <= 30.40) {
	            pressureTrend = 'Medium (Fair Weather)';
	            pressureCoeff = 1.0; // Normal fishing
	        } else if (currentPressureInHg <= 29.60) {
	            pressureTrend = 'Low (Cloudy/Rainy)';
	            pressureCoeff = 0.6; // Fishing slows
	        }
	        
	        // Note: Rising/Falling pressure detection would require historical data
	        // Currently using static pressure readings; could be enhanced with trend tracking

	        const sensitivityMap = { High: 0.8, Medium: 1.0, Low: 1.2 };
	        const sensitivityMult = sensitivityMap[metrics.sensitivity] || 1.0;
	        const sigmaLow = Math.max(1, ((metrics.opt - metrics.dorm) * sensitivityMult) / 2);
	        const sigmaHigh = Math.max(1, sigmaLow / 2);
	        const diff = currentTemp - metrics.opt;

	        const metabolicEfficiency = diff <= 0
	            ? Math.exp(-Math.pow(diff, 2) / (2 * Math.pow(sigmaLow, 2)))
	            : Math.exp(-Math.pow(diff, 2) / (2 * Math.pow(sigmaHigh, 2)));

	        let biteProb = (metabolicEfficiency * pressureCoeff) / 1.2;
	        biteProb = Math.min(1.0, Math.max(0.01, biteProb));

	        let strategyType = 'Balanced';
	        if (biteProb > 0.75) strategyType = 'Reaction';
	        else if (biteProb < 0.35) strategyType = 'Finesse';

		        const isIceFishing = currentTemp <= 32;
		        const scoredLures = useLureCatalog ? getLureCatalog()
	            .map(lure => {
	                const speciesMatch = !speciesName || getLureSpecies(lure).includes(speciesName);
	                if (!speciesMatch || (isIceFishing && !lure.ice_only) || (!isIceFishing && lure.ice_only)) {
	                    return { ...lure, finalScore: 0 };
	                }

	                let typeMatch = 1.0;
	                const category = getLureCategory(lure);
	                if (strategyType === 'Reaction' && ['Crankbait', 'Spinnerbait', 'Topwater', 'Spoon'].includes(category)) typeMatch = 1.5;
	                if (strategyType === 'Finesse' && ['Jig', 'Soft Plastic'].includes(category)) typeMatch = 1.5;

	                const clarityScore = getWaterClarityScore(lure, waterColor || 'Clear');
	                return { ...lure, finalScore: clarityScore * typeMatch * biteProb };
	            })
	            .filter(lure => lure.finalScore > 0)
		            .sort((a, b) => b.finalScore - a.finalScore) : [];

	        const biteProbability = Math.round(biteProb * 100);
	        const result = {
	            biteProbability,
	            biteRank: rankScientificBiteProbability(biteProbability),
	            metabolicEfficiency: Math.round(metabolicEfficiency * 100),
	            pressureTrend,
	            strategyType,
	            recommendedLures: scoredLures.slice(0, 3).map(lure => ({
	                name: lure.name,
	                rank: lure.finalScore * 100 > 85 ? 'Excellent' : lure.finalScore * 100 > 65 ? 'Very Good' : 'Good',
		                cover: Array.isArray(lure.target_cover) && lure.target_cover.length ? lure.target_cover[0] : 'Key structure',
		                presentation: lure.presentation?.retrieve || lure.presentation?.notes || 'Match local forage and structure.',
		                reason: lure.offline_match_reason || 'Offline lure catalog match.'
	            }))
	        };
	        result.biteReasoning = buildScientificReasoning(result);
	        return result;
	    } catch (error) {
	        console.error('Scientific engine error:', error.message);
	        return {
	            biteProbability: 50,
	            biteRank: 'Fair',
	            biteReasoning: 'Baseline analysis — scientific engine fallback applied.',
	            metabolicEfficiency: 50,
	            pressureTrend: 'Balanced',
	            strategyType: 'Balanced',
	            recommendedLures: []
	        };
	    }
	}

// ============================================================================
// API ROUTES
// ============================================================================

// Serve main application
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
            ai: !!genAI,
            weather: !!process.env.OPENWEATHER_API_KEY
        }
    });
});

// Generate strategy endpoint
app.post('/api/generate', async (req, res) => {
    const { location, species, clarity, engine, isBoat, currentTime } = req.body;

    // Input validation and sanitization
    const MAX_INPUT_LENGTH = 500;
    const allowedSpecies = ['Largemouth Bass', 'Smallmouth Bass', 'Walleye', 'Northern Pike', 'Crappie', 'Trout', 'Catfish', 'Bluegill', 'Yellow Perch', 'White Bass', 'Striped Bass', 'Brown Trout', 'Steelhead', 'Salmon', 'Saugeye', 'Brook Trout', 'Muskellunge', 'Rainbow Trout', 'Bullhead', 'Channel Catfish'];
    const allowedClarity = ['Muddy', 'Stained', 'Clear', 'Gin Clear'];

    if (!location || typeof location !== 'string' || location.length > MAX_INPUT_LENGTH) {
        return res.status(400).json({ success: false, error: 'Invalid location parameter' });
    }

    if (species && !allowedSpecies.includes(species)) {
        return res.status(400).json({ success: false, error: 'Invalid species parameter' });
    }

    if (clarity && !allowedClarity.includes(clarity)) {
        return res.status(400).json({ success: false, error: 'Invalid clarity parameter' });
    }

    // Sanitize location input to prevent injection
    const sanitizedLocation = location.replace(/[<>'"]/g, '').trim();

    try {
        const result = await generateFishingStrategy({
            location: sanitizedLocation,
            species,
            clarity,
            engine,
            isBoat,
            currentTime
        });

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Generation Route Error:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        success: false, 
        error: 'Endpoint not found' 
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ 
        success: false, 
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error' 
    });
});

// ============================================================================
// START SERVER
// ============================================================================

function logServerStart(port) {
    console.log('\n🎣 FishSmart Pro - Advanced Fishing Intelligence Platform');
    console.log(`🌐 Server running at http://localhost:${port}`);
    console.log(`🤖 AI Service: ${genAI ? '✓ Online' : '✗ Offline'}`);
    console.log(`🌤️  Weather Service: ${process.env.OPENWEATHER_API_KEY ? '✓ Online' : '✗ Offline'}`);
    console.log(`\nPress Ctrl+C to stop\n`);
}

function startServer(port, remainingFallbackAttempts = MAX_PORT_FALLBACK_ATTEMPTS) {
    const server = app.listen(port, '0.0.0.0', () => {
        logServerStart(port);
    });

    server.once('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            if (HAS_EXPLICIT_PORT || process.env.NODE_ENV === 'production' || remainingFallbackAttempts <= 0) {
                console.error(`✗ Port ${port} is already in use.`);
                console.error(HAS_EXPLICIT_PORT
                    ? 'Set a different PORT value and try again.'
                    : 'Free the port or set PORT to a different value and try again.');
                process.exit(1);
            }

            const nextPort = port + 1;
            console.warn(`⚠ Port ${port} is already in use. Trying port ${nextPort}...`);
            startServer(nextPort, remainingFallbackAttempts - 1);
            return;
        }

        console.error('✗ Failed to start server:', error);
        process.exit(1);
    });
}

startServer(PORT);
