function toNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampPositiveCurrency(value, floor = 10000) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(floor, Math.round(numeric));
}

const FHFA_STATE_JSON_URL = "https://www.fhfa.gov/hpi-state/json";
const FHFA_CITY_JSON_URL = "https://www.fhfa.gov/hpi-city/json";
const CENSUS_GEOCODER_URL = "https://geocoding.geo.census.gov/geocoder/geographies/address";
const fhfaCache = {
  state: null,
  city: null,
  geocode: new Map(),
};

function hashString(value = "") {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function seededUnit(seed, offset = 0) {
  const raw = Math.sin(seed + offset * 12.9898) * 43758.5453123;
  return raw - Math.floor(raw);
}

function buildAddressLine(subject = {}) {
  return [
    subject.street_1 || subject.property_address,
    [subject.city, subject.state, subject.postal_code].filter(Boolean).join(", "),
  ]
    .filter(Boolean)
    .join(", ");
}

function normalizeText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getStateName(stateCode = "") {
  const stateNames = {
    AL: "Alabama",
    AK: "Alaska",
    AZ: "Arizona",
    AR: "Arkansas",
    CA: "California",
    CO: "Colorado",
    CT: "Connecticut",
    DE: "Delaware",
    FL: "Florida",
    GA: "Georgia",
    HI: "Hawaii",
    ID: "Idaho",
    IL: "Illinois",
    IN: "Indiana",
    IA: "Iowa",
    KS: "Kansas",
    KY: "Kentucky",
    LA: "Louisiana",
    ME: "Maine",
    MD: "Maryland",
    MA: "Massachusetts",
    MI: "Michigan",
    MN: "Minnesota",
    MS: "Mississippi",
    MO: "Missouri",
    MT: "Montana",
    NE: "Nebraska",
    NV: "Nevada",
    NH: "New Hampshire",
    NJ: "New Jersey",
    NM: "New Mexico",
    NY: "New York",
    NC: "North Carolina",
    ND: "North Dakota",
    OH: "Ohio",
    OK: "Oklahoma",
    OR: "Oregon",
    PA: "Pennsylvania",
    RI: "Rhode Island",
    SC: "South Carolina",
    SD: "South Dakota",
    TN: "Tennessee",
    TX: "Texas",
    UT: "Utah",
    VT: "Vermont",
    VA: "Virginia",
    WA: "Washington",
    WV: "West Virginia",
    WI: "Wisconsin",
    WY: "Wyoming",
    DC: "District of Columbia",
  };

  return stateNames[String(stateCode || "").toUpperCase()] || "";
}

function _getStateCode(stateName = "") {
  const normalizedState = normalizeText(stateName);
  const statePairs = {
    alabama: "AL",
    alaska: "AK",
    arizona: "AZ",
    arkansas: "AR",
    california: "CA",
    colorado: "CO",
    connecticut: "CT",
    delaware: "DE",
    florida: "FL",
    georgia: "GA",
    hawaii: "HI",
    idaho: "ID",
    illinois: "IL",
    indiana: "IN",
    iowa: "IA",
    kansas: "KS",
    kentucky: "KY",
    louisiana: "LA",
    maine: "ME",
    maryland: "MD",
    massachusetts: "MA",
    michigan: "MI",
    minnesota: "MN",
    mississippi: "MS",
    missouri: "MO",
    montana: "MT",
    nebraska: "NE",
    nevada: "NV",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new mexico": "NM",
    "new york": "NY",
    "north carolina": "NC",
    "north dakota": "ND",
    ohio: "OH",
    oklahoma: "OK",
    oregon: "OR",
    pennsylvania: "PA",
    "rhode island": "RI",
    "south carolina": "SC",
    "south dakota": "SD",
    tennessee: "TN",
    texas: "TX",
    utah: "UT",
    vermont: "VT",
    virginia: "VA",
    washington: "WA",
    "west virginia": "WV",
    wisconsin: "WI",
    wyoming: "WY",
    "district of columbia": "DC",
  };

  return statePairs[normalizedState] || String(stateName || "").toUpperCase();
}

async function fetchJsonWithCache(kind, url) {
  if (fhfaCache[kind]) return fhfaCache[kind];
  if (typeof fetch !== "function") return null;

  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data)) return null;
    fhfaCache[kind] = data;
    return data;
  } catch {
    return null;
  }
}

async function geocodeSubjectAddress(subject = {}) {
  const street = subject.street_1 || subject.property_address || "";
  const city = subject.city || "";
  const state = subject.state || "";
  const zip = subject.postal_code || "";
  const cacheKey = `${street}|${city}|${state}|${zip}`;

  if (!street || !city || !state || typeof fetch !== "function") return null;
  if (fhfaCache.geocode.has(cacheKey)) return fhfaCache.geocode.get(cacheKey);

  try {
    const params = new URLSearchParams({
      street,
      city,
      state,
      zip,
      benchmark: "Public_AR_Current",
      vintage: "Current_Current",
      format: "json",
    });
    const response = await fetch(`${CENSUS_GEOCODER_URL}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      fhfaCache.geocode.set(cacheKey, null);
      return null;
    }
    const data = await response.json();
    const result = data?.result?.addressMatches?.[0] || null;
    if (!result) {
      fhfaCache.geocode.set(cacheKey, null);
      return null;
    }

    const countyRecord = result?.geographies?.Counties?.[0] || null;
    const geocoded = {
      matched_address: result.matchedAddress || null,
      city: result.addressComponents?.city || city,
      state: result.addressComponents?.state || state,
      postal_code: result.addressComponents?.zip || zip,
      county: countyRecord?.NAME || subject.county || "",
      coordinates: result.coordinates || null,
      raw_payload: result,
    };
    fhfaCache.geocode.set(cacheKey, geocoded);
    return geocoded;
  } catch {
    fhfaCache.geocode.set(cacheKey, null);
    return null;
  }
}

function findStateHpiSignal(stateRows = [], stateCode = "") {
  const stateName = getStateName(stateCode);
  if (!stateName) return null;
  const normalizedState = normalizeText(stateName);
  return stateRows.find((row) => normalizeText(row.name) === normalizedState) || null;
}

function scoreMetroSignal(row, city = "", stateCode = "", county = "") {
  const normalizedName = normalizeText(row?.name);
  if (!normalizedName) return 0;

  const normalizedCity = normalizeText(city);
  const normalizedState = normalizeText(stateCode);
  const normalizedCounty = normalizeText(String(county || "").replace(/\s+county$/i, ""));
  if (!normalizedCity || !normalizedState) return 0;

  let score = 0;
  if (normalizedName.includes(normalizedState)) score += 2.4;
  if (normalizedName.includes(normalizedCity)) score += 4.2;
  if (normalizedCounty && normalizedName.includes(normalizedCounty)) score += 1.1;

  const cityTokens = normalizedCity.split(" ").filter(Boolean);
  score += cityTokens.filter((token) => token.length > 2 && normalizedName.includes(token)).length * 0.35;

  return score;
}

function findMetroHpiSignal(cityRows = [], city = "", stateCode = "", county = "") {
  const bestMatch = cityRows
    .map((row) => ({ row, score: scoreMetroSignal(row, city, stateCode, county) }))
    .sort((left, right) => right.score - left.score)[0];

  return bestMatch && bestMatch.score >= 4.4 ? bestMatch.row : null;
}

function annualizedGrowthFromFiveYear(fiveYearPercent = null) {
  const numeric = toNumber(fiveYearPercent);
  if (numeric === null) return null;
  return Math.pow(1 + numeric / 100, 1 / 5) - 1;
}

async function buildOfficialHpiMarketSources(subject = {}, subjectEstimate = null) {
  const geocodedSubject = await geocodeSubjectAddress(subject);
  const marketCity = geocodedSubject?.city || subject.city;
  const marketState = geocodedSubject?.state || subject.state;
  const marketCounty = geocodedSubject?.county || subject.county;

  return Promise.all([
    fetchJsonWithCache("state", FHFA_STATE_JSON_URL),
    fetchJsonWithCache("city", FHFA_CITY_JSON_URL),
  ]).then(([stateRows, cityRows]) => {
    const stateSignal = findStateHpiSignal(stateRows || [], marketState);
    const metroSignal = findMetroHpiSignal(cityRows || [], marketCity, marketState, marketCounty);
    const lastPurchasePrice = toNumber(subject.last_purchase_price);
    const lastPurchaseDate = subject.last_purchase_date ? new Date(subject.last_purchase_date) : null;
    const now = new Date();
    const purchaseYears =
      lastPurchaseDate && !Number.isNaN(lastPurchaseDate.getTime())
        ? Math.max(
            0,
            (now.getUTCFullYear() - lastPurchaseDate.getUTCFullYear()) +
              (now.getUTCMonth() - lastPurchaseDate.getUTCMonth()) / 12
          )
        : null;

    const signals = [];

    if (stateSignal) {
      const annualizedGrowth = annualizedGrowthFromFiveYear(stateSignal.sa_5y);
      const estimate =
        lastPurchasePrice !== null && purchaseYears !== null && annualizedGrowth !== null
          ? Math.round(lastPurchasePrice * Math.pow(1 + clamp(annualizedGrowth, -0.04, 0.12), purchaseYears))
          : subjectEstimate !== null
            ? Math.round(subjectEstimate * (1 + clamp(toNumber(stateSignal.sa_1y, 0) / 100, -0.04, 0.08) * 0.22))
            : null;

      if (estimate !== null) {
        signals.push({
          source_name: "FHFA state market trend",
          estimate,
          confidence: metroSignal ? 0.54 : 0.5,
          notes: [
            `Official FHFA state HPI read for ${stateSignal.name}.`,
            `1-year change ${stateSignal.sa_1y}% and 5-year change ${stateSignal.sa_5y}%.`,
          ],
          raw_payload: stateSignal,
        });
      }
    }

    if (metroSignal) {
      const annualizedGrowth = annualizedGrowthFromFiveYear(metroSignal.nsa_5y);
      const estimate =
        lastPurchasePrice !== null && purchaseYears !== null && annualizedGrowth !== null
          ? Math.round(lastPurchasePrice * Math.pow(1 + clamp(annualizedGrowth, -0.05, 0.14), purchaseYears))
          : subjectEstimate !== null
            ? Math.round(subjectEstimate * (1 + clamp(toNumber(metroSignal.nsa_1y, 0) / 100, -0.05, 0.1) * 0.28))
            : null;

      if (estimate !== null) {
        signals.push({
          source_name: "FHFA metro market trend",
          estimate,
          confidence: 0.58,
          notes: [
            `Official FHFA metro HPI read for ${metroSignal.name}.`,
            `1-year change ${metroSignal.nsa_1y}% and 5-year change ${metroSignal.nsa_5y}%.`,
          ],
          raw_payload: metroSignal,
        });
      }
    }

    return {
      signals,
      metadata: {
        state_signal: stateSignal,
        metro_signal: metroSignal,
        geocoded_subject: geocodedSubject,
        market_city: marketCity || null,
        market_state: marketState || null,
        market_county: marketCounty || null,
        official_source_used: signals.length > 0,
      },
    };
  });
}

function getTypeProfile(propertyTypeKey) {
  const profiles = {
    primary_residence: { basePpsf: 340, lotWeight: 3.2, bedWeight: 4800, bathWeight: 7600, yearWeight: 280 },
    investment_property: { basePpsf: 315, lotWeight: 2.8, bedWeight: 4200, bathWeight: 6800, yearWeight: 240 },
    second_home: { basePpsf: 355, lotWeight: 3.2, bedWeight: 4500, bathWeight: 7200, yearWeight: 260 },
    vacation_property: { basePpsf: 375, lotWeight: 3.5, bedWeight: 4200, bathWeight: 7000, yearWeight: 250 },
    condo_unit: { basePpsf: 410, lotWeight: 0.5, bedWeight: 3200, bathWeight: 5600, yearWeight: 220 },
    townhome_property: { basePpsf: 360, lotWeight: 1.4, bedWeight: 3600, bathWeight: 6100, yearWeight: 230 },
    multifamily_property: { basePpsf: 275, lotWeight: 2.1, bedWeight: 2600, bathWeight: 4600, yearWeight: 180 },
    vacant_land: { basePpsf: 22, lotWeight: 1.8, bedWeight: 0, bathWeight: 0, yearWeight: 0 },
    rental_property_generic: { basePpsf: 305, lotWeight: 2.5, bedWeight: 3900, bathWeight: 6500, yearWeight: 220 },
    property_generic: { basePpsf: 325, lotWeight: 2.6, bedWeight: 4100, bathWeight: 6600, yearWeight: 230 },
  };

  return profiles[propertyTypeKey] || profiles.property_generic;
}

function getStateMultiplier(state = "") {
  const multipliers = {
    CA: 1.28,
    WA: 1.17,
    OR: 1.08,
    AZ: 1.06,
    NV: 1.07,
    CO: 1.1,
    TX: 0.96,
    FL: 1.04,
    NY: 1.22,
    NJ: 1.16,
    MA: 1.2,
    IL: 0.94,
    GA: 0.92,
    NC: 0.95,
    SC: 0.9,
    TN: 0.91,
    UT: 1.03,
  };

  return multipliers[String(state || "").toUpperCase()] || 1;
}

function buildLocalMarketProfile(subject = {}, subjectModel = {}, officialMarketSignals = {}, seed = 0) {
  const subjectSquareFeet = toNumber(subject.square_feet, 2200);
  const subjectLotSize = toNumber(subject.lot_size, 6500);
  const metroOneYear = toNumber(officialMarketSignals.metadata?.metro_signal?.nsa_1y);
  const metroFiveYear = toNumber(officialMarketSignals.metadata?.metro_signal?.nsa_5y);
  const stateOneYear = toNumber(officialMarketSignals.metadata?.state_signal?.sa_1y);
  const stateFiveYear = toNumber(officialMarketSignals.metadata?.state_signal?.sa_5y);
  const marketOneYear = metroOneYear ?? stateOneYear ?? 4.5;
  const marketFiveYear = metroFiveYear ?? stateFiveYear ?? 24;
  const annualGrowth = annualizedGrowthFromFiveYear(marketFiveYear) ?? clamp(marketOneYear / 100, -0.02, 0.08);
  const neighborhoodFactor = 0.96 + seededUnit(seed, 210) * 0.12;
  const zipFactor = 0.97 + seededUnit(seed, 211) * 0.1;
  const currentEstimate = toNumber(subjectModel.estimate, 0);
  const baselinePpsf =
    subjectSquareFeet > 0
      ? currentEstimate / Math.max(subjectSquareFeet, 1)
      : currentEstimate / Math.max(subjectLotSize, 2000);

  return {
    current_ppsf: Number((baselinePpsf * neighborhoodFactor * zipFactor).toFixed(2)),
    annual_growth_rate: clamp(annualGrowth, -0.03, 0.12),
    neighborhood_factor: Number(neighborhoodFactor.toFixed(2)),
    zip_factor: Number(zipFactor.toFixed(2)),
    market_one_year_change: marketOneYear,
    market_five_year_change: marketFiveYear,
  };
}

function buildMarketRealityFloorSource(subject = {}, marketProfile = {}, officialMarketSignals = {}) {
  const subjectSquareFeet = toNumber(subject.square_feet);
  const lastPurchasePrice = toNumber(subject.last_purchase_price);
  const currentPpsf = toNumber(marketProfile.current_ppsf);
  const stateSignal = officialMarketSignals.metadata?.state_signal || null;
  const metroSignal = officialMarketSignals.metadata?.metro_signal || null;
  const lastPurchaseDate = subject.last_purchase_date ? new Date(subject.last_purchase_date) : null;
  const now = new Date();
  const purchaseYears =
    lastPurchaseDate && !Number.isNaN(lastPurchaseDate.getTime())
      ? Math.max(
          0,
          (now.getUTCFullYear() - lastPurchaseDate.getUTCFullYear()) +
            (now.getUTCMonth() - lastPurchaseDate.getUTCMonth()) / 12
        )
      : null;

  const annualGrowth =
    annualizedGrowthFromFiveYear(toNumber(metroSignal?.nsa_5y) ?? toNumber(stateSignal?.sa_5y)) ??
    clamp((toNumber(metroSignal?.nsa_1y) ?? toNumber(stateSignal?.sa_1y) ?? 4.5) / 100, -0.02, 0.08);

  const anchoredPurchaseEstimate =
    lastPurchasePrice !== null && purchaseYears !== null
      ? Math.round(lastPurchasePrice * Math.pow(1 + clamp(annualGrowth, -0.03, 0.12), purchaseYears))
      : null;
  const subjectPpsfFloor =
    subjectSquareFeet && currentPpsf
      ? Math.round(subjectSquareFeet * currentPpsf * (subjectSquareFeet >= 3500 ? 0.84 : 0.8))
      : null;

  const floorEstimate = Math.max(anchoredPurchaseEstimate || 0, subjectPpsfFloor || 0);
  if (!Number.isFinite(floorEstimate) || floorEstimate <= 0) return null;

  return {
    source_name: "Market reality floor",
    estimate: floorEstimate,
    confidence:
      anchoredPurchaseEstimate !== null && subjectPpsfFloor !== null
        ? 0.58
        : anchoredPurchaseEstimate !== null
          ? 0.52
          : 0.46,
    notes: [
      "Prevents the blended estimate from drifting materially below purchase-growth and local price-per-foot support.",
      anchoredPurchaseEstimate !== null
        ? `Purchase-growth anchor contributes at roughly ${anchoredPurchaseEstimate.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}.`
        : "No recorded purchase-growth anchor was available.",
      subjectPpsfFloor !== null
        ? `Local market floor contributes at roughly ${subjectPpsfFloor.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}.`
        : "No local price-per-foot floor was available.",
    ],
    raw_payload: {
      anchored_purchase_estimate: anchoredPurchaseEstimate,
      subject_ppsf_floor: subjectPpsfFloor,
      annual_growth_rate: annualGrowth,
    },
  };
}

function buildSubjectEstimate(subject = {}, seed) {
  const squareFeet = toNumber(subject.square_feet, 2200);
  const beds = toNumber(subject.beds, 3);
  const baths = toNumber(subject.baths, 2.5);
  const yearBuilt = toNumber(subject.year_built, 2000);
  const lotSize = toNumber(subject.lot_size, 6500);
  const propertyType = subject.property_type_key || "property_generic";
  const occupancyType = subject.occupancy_type || "";
  const profile = getTypeProfile(propertyType);
  const stateMultiplier = getStateMultiplier(subject.state);
  const countyFactor = 0.96 + seededUnit(seed, 1) * 0.14;
  const postalFactor = 0.97 + seededUnit(seed, 2) * 0.12;
  const demandFactor = 0.98 + seededUnit(seed, 3) * 0.11;
  const occupancyFactor =
    occupancyType === "tenant_occupied" ? 0.97 : occupancyType === "vacant" ? 0.94 : 1;
  const sizeCurve = squareFeet > 0 ? clamp(1.06 - Math.min(squareFeet, 5000) / 30000, 0.9, 1.05) : 1;
  const largeHomePremium = squareFeet >= 3500 ? 1 + Math.min((squareFeet - 3500) / 7000, 0.16) : 1;
  const lotPremium =
    lotSize >= 12000 && propertyType !== "vacant_land"
      ? 1 + Math.min((lotSize - 12000) / 60000, 0.08)
      : 1;
  const ageValue = Math.max(yearBuilt - 1975, 0) * profile.yearWeight;
  const lotContribution =
    propertyType === "vacant_land"
      ? Math.min(lotSize, 250000) * profile.lotWeight
      : Math.min(lotSize, 18000) * profile.lotWeight;

  const estimate =
    squareFeet *
      profile.basePpsf *
      stateMultiplier *
      countyFactor *
      postalFactor *
      demandFactor *
      occupancyFactor *
      sizeCurve *
      largeHomePremium *
      lotPremium +
    beds * profile.bedWeight +
    baths * profile.bathWeight +
    ageValue +
    lotContribution;

  return {
    estimate: Math.round(estimate),
    context: {
      square_feet: squareFeet,
      beds,
      baths,
      year_built: yearBuilt,
      lot_size: lotSize,
      property_type: propertyType,
      state_multiplier: Number(stateMultiplier.toFixed(2)),
      county_factor: Number(countyFactor.toFixed(2)),
      postal_factor: Number(postalFactor.toFixed(2)),
      demand_factor: Number(demandFactor.toFixed(2)),
      occupancy_factor: Number(occupancyFactor.toFixed(2)),
      size_curve: Number(sizeCurve.toFixed(2)),
      large_home_premium: Number(largeHomePremium.toFixed(2)),
      lot_premium: Number(lotPremium.toFixed(2)),
    },
  };
}

function buildCandidateComp(subject = {}, subjectEstimate, marketProfile = {}, seed, index) {
  const subjectSquareFeet = toNumber(subject.square_feet, 2200);
  const subjectBeds = toNumber(subject.beds, 3);
  const subjectBaths = toNumber(subject.baths, 2.5);
  const subjectYearBuilt = toNumber(subject.year_built, 2000);
  const lotSize = toNumber(subject.lot_size, 6500);
  const propertyType = subject.property_type_key || "property_generic";
  const city = subject.city || "Unknown City";
  const state = subject.state || "CA";
  const postalCode = subject.postal_code || "00000";
  const baseDistance = [0.12, 0.21, 0.34, 0.47, 0.58, 0.72, 0.88, 1.05, 1.28, 1.5, 1.74, 2.08, 2.35, 2.7, 3.1, 3.45][index] || 2.2;
  const distance = Number((baseDistance + seededUnit(seed, 10 + index) * 0.16).toFixed(2));
  const squareFeet = Math.max(
    propertyType === "vacant_land" ? 0 : 700,
    Math.round(subjectSquareFeet * (0.84 + seededUnit(seed, 30 + index) * 0.32))
  );
  const beds = propertyType === "vacant_land"
    ? 0
    : Math.max(1, Math.round(subjectBeds + [-1, 0, 1][index % 3] + (seededUnit(seed, 40 + index) > 0.72 ? 1 : 0) - (seededUnit(seed, 41 + index) < 0.18 ? 1 : 0)));
  const baths = propertyType === "vacant_land"
    ? 0
    : Math.max(1, Number((subjectBaths + (seededUnit(seed, 50 + index) - 0.5) * 1.1).toFixed(1)));
  const yearBuilt = Math.max(1900, Math.round(subjectYearBuilt + (seededUnit(seed, 60 + index) - 0.5) * 18));
  const monthsAgo = Math.max(1, Math.round(1 + index * 1.6 + seededUnit(seed, 70 + index) * 6));
  const saleDate = new Date();
  saleDate.setUTCMonth(saleDate.getUTCMonth() - monthsAgo);
  saleDate.setUTCDate(Math.min(28, 5 + index * 2));
  const compLotSize = Math.max(1000, Math.round(lotSize * (0.8 + seededUnit(seed, 90 + index) * 0.45)));
  const addressNumber = 100 + index * 17 + Math.round(seededUnit(seed, 100 + index) * 9);
  const streetNames = ["Maple", "Summit", "Redwood", "Canyon", "River", "Oak", "Cedar", "Vista", "Sycamore", "Park"];
  const suffixes = ["Ln", "Dr", "Ct", "Way", "Ave"];
  const street = streetNames[index % streetNames.length];
  const suffix = suffixes[index % suffixes.length];
  const currentPpsf =
    toNumber(marketProfile.current_ppsf) ||
    (subjectSquareFeet > 0 ? subjectEstimate / Math.max(subjectSquareFeet, 1) : subjectEstimate / Math.max(lotSize, 1));
  const annualGrowthRate = toNumber(marketProfile.annual_growth_rate, 0.045);
  const salePpsf = currentPpsf / Math.pow(1 + annualGrowthRate, monthsAgo / 12);
  const neighborhoodCompFactor = 0.94 + seededUnit(seed, 110 + index) * 0.14;
  const conditionFactor = 0.96 + seededUnit(seed, 111 + index) * 0.1;
  const bedPriceAdjust = propertyType === "vacant_land" ? 0 : (beds - subjectBeds) * 5200;
  const bathPriceAdjust = propertyType === "vacant_land" ? 0 : (baths - subjectBaths) * 7400;
  const yearPriceAdjust = subjectYearBuilt ? (yearBuilt - subjectYearBuilt) * 280 : 0;
  const lotPriceAdjust =
    propertyType === "vacant_land"
      ? (compLotSize - lotSize) * 1.9
      : (compLotSize - lotSize) * 0.75;
  const rawSalePrice =
    (squareFeet > 0 ? squareFeet * salePpsf : compLotSize * salePpsf) * neighborhoodCompFactor * conditionFactor +
      bedPriceAdjust +
      bathPriceAdjust +
      yearPriceAdjust +
      lotPriceAdjust;
  const salePrice = clampPositiveCurrency(rawSalePrice);
  const pricePerSqft =
    salePrice !== null
      ? squareFeet > 0
        ? Number((salePrice / squareFeet).toFixed(2))
        : Number((salePrice / Math.max(compLotSize, 1)).toFixed(2))
      : null;

  const sizePenalty = subjectSquareFeet > 0 ? Math.abs(squareFeet - subjectSquareFeet) / subjectSquareFeet : 0.18;
  const bedPenalty = propertyType === "vacant_land" ? 0 : Math.abs(beds - subjectBeds) * 0.08;
  const bathPenalty = propertyType === "vacant_land" ? 0 : Math.abs(baths - subjectBaths) * 0.05;
  const yearPenalty = subjectYearBuilt ? Math.abs(yearBuilt - subjectYearBuilt) / 90 : 0.08;
  const recencyPenalty = monthsAgo / 60;
  const distancePenalty = distance / 4;
  const marketPpsfPenalty =
    currentPpsf > 0 && pricePerSqft > 0 ? Math.abs(pricePerSqft - currentPpsf) / currentPpsf : 0.12;
  const similarityScore = Number(
    clamp(
      1 -
        (sizePenalty * 0.28 +
          bedPenalty * 0.16 +
          bathPenalty * 0.12 +
          yearPenalty * 0.14 +
          recencyPenalty * 0.12 +
          distancePenalty * 0.1 +
          marketPpsfPenalty * 0.08),
      0.35,
      0.97
    ).toFixed(2)
  );

  return {
    source_name: index % 2 === 0 ? "Local MLS-style comp" : "County-record comp",
    comp_address: `${addressNumber} ${street} ${suffix}`,
    city,
    state,
    postal_code: postalCode,
    distance_miles: distance,
    sale_price: salePrice,
    sale_date: saleDate.toISOString().slice(0, 10),
    beds,
    baths,
    square_feet: squareFeet,
    lot_size: compLotSize,
    year_built: yearBuilt,
    price_per_sqft: pricePerSqft,
    property_type: propertyType,
    status: "sold",
    raw_payload: {
      similarity_score: similarityScore,
      months_ago: monthsAgo,
      generated_seed: seed,
      market_ppsf: Number(currentPpsf.toFixed(2)),
      sale_ppsf: Number(salePpsf.toFixed(2)),
      annual_growth_rate: Number(annualGrowthRate.toFixed(4)),
      neighborhood_factor: Number(neighborhoodCompFactor.toFixed(2)),
      condition_factor: Number(conditionFactor.toFixed(2)),
    },
  };
}

function selectBestComps(candidateComps = []) {
  return [...candidateComps]
    .filter((comp) => {
      const similarity = comp.raw_payload?.similarity_score ?? 0;
      const monthsAgo = comp.raw_payload?.months_ago ?? null;
      const distance = comp.distance_miles ?? null;
      if (similarity < 0.58) return false;
      if (distance !== null && distance > 2.25) return false;
      if (monthsAgo !== null && monthsAgo > 30) return false;
      return true;
    })
    .sort((left, right) => {
      const leftScore = left.raw_payload?.similarity_score ?? 0;
      const rightScore = right.raw_payload?.similarity_score ?? 0;
      if (rightScore !== leftScore) return rightScore - leftScore;
      return (left.distance_miles ?? 99) - (right.distance_miles ?? 99);
    })
    .slice(0, 6);
}

export async function runMockValuationProvider(subject = {}) {
  const addressLine = buildAddressLine(subject) || "Subject Property";
  const propertyType = subject.property_type_key || "property_generic";
  const city = subject.city || "Unknown City";
  const state = subject.state || "CA";
  const postalCode = subject.postal_code || "00000";
  const county = subject.county || "";
  const seed = hashString(`${addressLine}|${city}|${state}|${postalCode}|${county}|${propertyType}`);
  const subjectModel = buildSubjectEstimate(subject, seed);
  const officialMarketSignals = await buildOfficialHpiMarketSources(subject, subjectModel.estimate);
  const marketProfile = buildLocalMarketProfile(subject, subjectModel, officialMarketSignals, seed);
  const marketRealityFloorSource = buildMarketRealityFloorSource(subject, marketProfile, officialMarketSignals);
  const recentPurchasePrice = toNumber(subject.last_purchase_price);
  const recentPurchaseEstimate =
    recentPurchasePrice !== null
      ? Math.round(recentPurchasePrice * (1.03 + seededUnit(seed, 150) * 0.08))
      : null;

  const candidateComps = Array.from({ length: 16 }, (_, index) =>
    buildCandidateComp(subject, subjectModel.estimate, marketProfile, seed, index)
  );
  const comps = selectBestComps(candidateComps);
  const compMedianEstimate =
    comps.length > 0
      ? clampPositiveCurrency(
          comps
            .map((comp) => comp.sale_price)
            .sort((left, right) => left - right)[Math.floor(comps.length / 2)]
        )
      : null;
  const compWeightedEstimate =
    comps.length > 0
      ? clampPositiveCurrency(
          comps.reduce((sum, comp) => sum + comp.sale_price * (comp.raw_payload?.similarity_score || 0.5), 0) /
            Math.max(comps.reduce((sum, comp) => sum + (comp.raw_payload?.similarity_score || 0.5), 0), 1)
        )
      : null;
  const countyAnchorEstimate = clampPositiveCurrency(subjectModel.estimate * (0.9 + seededUnit(seed, 170) * 0.08));

  const sources = [
    {
      source_name: "Local heuristic AVM",
      estimate: clampPositiveCurrency(subjectModel.estimate),
      confidence: 0.56,
      notes: [
        "Built from subject property facts, regional pricing profile, and deterministic market context.",
      ],
    },
    {
      source_name: "Weighted comp market blend",
      estimate: compWeightedEstimate ?? compMedianEstimate,
      confidence: comps.length >= 5 ? 0.66 : comps.length >= 3 ? 0.56 : 0.44,
      notes: [
        `${comps.length} best-fit comparable sale${comps.length === 1 ? "" : "s"} selected from a larger local comp pool.`,
        "Comp pricing reflects local price-per-foot context, sale recency, and subject-fit adjustments.",
      ],
    },
    {
      source_name: "County-style assessment anchor",
      estimate: countyAnchorEstimate,
      confidence: 0.4,
      notes: ["Anchored to assessment-style value behavior with a conservative discount to market pricing."],
    },
    ...(marketRealityFloorSource ? [marketRealityFloorSource] : []),
    ...(recentPurchaseEstimate !== null
      ? [
          {
            source_name: "Recent purchase anchor",
            estimate: clampPositiveCurrency(recentPurchaseEstimate),
            confidence: 0.38,
            notes: ["Anchored to the recorded purchase price with a light market appreciation adjustment."],
          },
        ]
      : []),
    ...(officialMarketSignals.signals || []),
  ].filter((source) => Number.isFinite(source.estimate));

  return {
    subject: {
      address: addressLine,
      city,
      state,
      postal_code: postalCode,
      county,
      beds: toNumber(subject.beds, propertyType === "vacant_land" ? 0 : 3),
      baths: toNumber(subject.baths, propertyType === "vacant_land" ? 0 : 2.5),
      square_feet: toNumber(subject.square_feet, propertyType === "vacant_land" ? 0 : 2200),
      lot_size: toNumber(subject.lot_size, 6500),
      year_built: toNumber(subject.year_built, 2000),
      property_type: propertyType,
      last_purchase_price: recentPurchasePrice,
      last_purchase_date: subject.last_purchase_date || null,
    },
    sources,
    comps,
    metadata: {
      provider_version: "local_heuristic_v4_strict_truthfulness",
      comp_pool_size: candidateComps.length,
      selected_comp_count: comps.length,
      subject_context: subjectModel.context,
      market_profile: marketProfile,
      official_market_signals: officialMarketSignals.metadata,
    },
  };
}
