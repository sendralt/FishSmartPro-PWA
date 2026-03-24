# Scientific Engine: Bite Score Analysis Report

## 1. Executive Summary
This report details the logic and implementation of the "Scientific Engine" in FishSmart Pro-PWA, specifically focusing on how environmental and biological factors are synthesized to calculate the **Bite Score** (presented as Bite Probability).

## 2. Component Analysis

### 2.1 Scientific Data (`scientificData`)
- **Definition**: An object returned by the `calculateScientificStrategy` function in `server.js`.
- **Role**: It acts as the central state for all scientific calculations, containing raw metrics, qualitative rankings, and recommended strategies.

### 2.2 Metabolic Efficiency
- **Function**: `calculateScientificStrategy` (lines ~460-470 in `server.js`).
- **Logic**: Calculated using a Gaussian distribution formula based on the current water temperature relative to a species' optimal (`opt`) and dormant (`dorm`) temperatures.
- **Formula Reference**:
  ```javascript
  const metabolicEfficiency = diff <= 0
      ? Math.exp(-Math.pow(diff, 2) / (2 * Math.pow(sigmaLow, 2)))
      : Math.exp(-Math.pow(diff, 2) / (2 * Math.pow(sigmaHigh, 2)));
  ```
- **Impact**: This is the baseline potential for fish activity. If the temperature is far from the species' optimal range, efficiency drops, directly lowering the bite score.

### 2.3 Pressure Trend
- **Logic**: Derived from current barometric pressure (hPa/inHg).
- **Mapping**:
  - `> 30.2 inHg`: "Steady High (Post-Frontal)" (Pressure Coefficient: **0.4**)
  - `< 29.8 inHg`: "Steady Low" (Pressure Coefficient: **1.2**)
  - `Other`: "Balanced" (Pressure Coefficient: **1.0**)
- **Impact**: Pressure acts as a significant multiplier. High pressure (post-frontal) severely penalizes the bite score (60% reduction), while low pressure provides a 20% boost.

### 2.4 Bite Probability (The 'Bite Score')
- **Calculation**: 
  ```javascript
  let biteProb = (metabolicEfficiency * pressureCoeff) / 1.2;
  biteProb = Math.min(1.0, Math.max(0.01, biteProb));
  const biteProbability = Math.round(biteProb * 100);
  ```
- **Interpretation**: It represents the percentage chance of active feeding. It combines biological state (metabolism) with environmental triggers (pressure).

### 2.5 biteRank
- **Function**: `rankScientificBiteProbability(score)`
- **Thresholds**:
  - `76+`: Excellent
  - `56-75`: Good
  - `36-55`: Fair
  - `< 36`: Tough
- **Impact**: Provides a human-readable assessment for the UI and AI context.

## 3. Data Flow & Integration

1.  **Species Metrics**: Loaded from `fishingData.json` (e.g., Largemouth Bass: `opt: 72, dorm: 45, sensitivity: Medium`).
2.  **Environment**: Weather data (Temp/Pressure) is fetched from APIs and passed into the engine.
3.  **Engine Processing**: `calculateScientificStrategy` processes the inputs into the `scientificData` object.
4.  **AI Context**: The `scientificContext` string is injected into the Gemini AI prompt to ensure AI strategies align with scientific calculations.
5.  **Frontend**: The `public/index.html` script receives the JSON response and updates the DOM elements `biteProbability` and `bite_rank`.

## 4. Conclusion
The "Bite Score" is not a random number but a deterministic calculation where **Water Temperature** (via Metabolic Efficiency) and **Barometric Pressure** (via Pressure Trend) are the primary drivers. Species-specific sensitivity further fine-tunes the "curve" of the metabolic calculation, ensuring that a 'Tough' day for a Bass might still be a 'Good' day for a Walleye under the same conditions.
