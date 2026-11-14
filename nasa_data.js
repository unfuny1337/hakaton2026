/**
 * NASA Space Mission Design Game — balance-patched dataset.
 * Real NASA mission/instrument identities and verifiedSpecs are source-attributed.
 * Parameters in gameOnlyFields are illustrative game assumptions, not NASA specifications.
 * Launch maxPayloadKg refers to LEO and does NOT validate transfers to the Moon or Mars.
 * Original design constraints: exactly 3 missions, 4 launchers, 4 orbits, 8 instruments, 3 crises.
 */
const NASA_DATA = {
  "metadata": {
    "title": "NASA Space Mission Design Game — sourced dataset",
    "units": {
      "cost": "million USD (game assumption)",
      "mass": "kg",
      "power": "W",
      "batteryCapacity": "Wh",
      "dataTransferRate": "Gb per communication hour (game assumption)",
      "dataGenerationRate": "Gb/day (game assumption)"
    },
    "methodology": "Exact NASA mission/instrument names and documented specifications are in verifiedSpecs. Numeric gameplay constraints not published for those exact configurations are illustrative game assumptions, NOT NASA figures. Launch LEO capacity is not capability to a lunar or Martian orbit. Game solarEfficiency is a simplified factor, not a substitute for actual heliocentric irradiance or array sizing; do not apply it to real MRO output.",
    "references": [
      "https://www.nasa.gov/smallsat-institute/sst-soa/",
      "https://science.nasa.gov/mission/lro/spacecraft-and-instruments/",
      "https://science.nasa.gov/mission/mars-reconnaissance-orbiter/science-instruments/",
      "https://science.nasa.gov/mission/landsat-9/",
      "https://ntrs.nasa.gov/api/citations/20240001680/downloads/HU-CAS-Seminar_2024-02-12.pdf",
      "https://www.nasa.gov/wp-content/uploads/2024/01/routine-payloads-ea.pdf",
      "https://ntrs.nasa.gov/api/citations/20210025775/downloads/MIT%20APETS%20Presentation_Paul%20Gradl_Final.pdf",
      "https://www.nasa.gov/smallsat-institute/sst-soa/power-subsystems/",
      "https://www.nasa.gov/smallsat-institute/sst-soa/soa-communications/",
      "https://science.nasa.gov/wp-content/uploads/2024/03/44745_mro-arrival.pdf"
    ],
    "balancePatchNotes": [
      "Added the second real Landsat 9 instrument TIRS-2. To preserve the challenge limit of 6–8 instruments, omitted Diviner Lunar Radiometer from the earlier dataset; the omitted instrument remains real.",
      "Added alternative spacecraft components for every category; all chosen component performance values are illustrative.",
      "Added stronger solar-array option; NASA MRO reference produces about 2000 W at farthest Sun distance, whereas this 1400 W game array is not asserted to be original MRO hardware.",
      "Changed SLS cost from 2000 to 320 million game USD; this is not an actual NASA cost.",
      "Kept exactly 4 NASA-named launchers, so their LEO capacities are not changed just to force gameplay choice. The engine may need per-destination launch feasibility, not a simple multiplier."
    ]
  },
  "missions": [
    {
      "id": "m1",
      "title": "Lunar Reconnaissance Orbiter (LRO)",
      "targetBody": "Moon",
      "description": "Картографування поверхні Місяця, полярного освітлення, температур і потенційних запасів льоду.",
      "maxBudget": 450,
      "maxTimeMonths": 48,
      "requiredOrbitId": "orb_lunar_polar",
      "minScienceScore": 110,
      "radiationLevel": 3,
      "solarEfficiency": 1.0,
      "verifiedSpecs": {
        "launchDate": "2009-06-18",
        "initialScienceOrbitAltitudeKm": 50,
        "spacecraftMassAtLaunchKg": 1850
      },
      "gameOnlyFields": [
        "maxBudget",
        "maxTimeMonths",
        "minScienceScore",
        "radiationLevel",
        "solarEfficiency"
      ],
      "nasaSourceUrl": "https://science.nasa.gov/mission/lro/about/"
    },
    {
      "id": "m2",
      "title": "Mars Reconnaissance Orbiter (MRO)",
      "targetBody": "Mars",
      "description": "Дослідження поверхні Марса, мінералів, атмосферних умов та підповерхневого льоду.",
      "maxBudget": 700,
      "maxTimeMonths": 72,
      "requiredOrbitId": "orb_mars_polar",
      "minScienceScore": 115,
      "radiationLevel": 4,
      "solarEfficiency": 0.43,
      "verifiedSpecs": {
        "launchDate": "2005-08-12",
        "launchMassKg": 2180,
        "marsOrbitInsertionDate": "2006-03-10"
      },
      "gameOnlyFields": [
        "maxBudget",
        "maxTimeMonths",
        "minScienceScore",
        "radiationLevel",
        "solarEfficiency"
      ],
      "nasaSourceUrl": "https://science.nasa.gov/mission/mars-reconnaissance-orbiter/"
    },
    {
      "id": "m3",
      "title": "Landsat 9",
      "targetBody": "Earth",
      "description": "Моніторинг поверхні Землі за допомогою оптичних та теплових спектральних спостережень.",
      "maxBudget": 400,
      "maxTimeMonths": 48,
      "requiredOrbitId": "orb_earth_sso",
      "minScienceScore": 100,
      "radiationLevel": 2,
      "solarEfficiency": 1.0,
      "verifiedSpecs": {
        "launchDate": "2021-09-27",
        "orbitAltitudeKm": 705,
        "inclinationDeg": 98.2,
        "orbitPeriodMinutes": 99
      },
      "gameOnlyFields": [
        "maxBudget",
        "maxTimeMonths",
        "minScienceScore",
        "radiationLevel",
        "solarEfficiency"
      ],
      "nasaSourceUrl": "https://science.nasa.gov/mission/landsat-9/"
    }
  ],
  "orbits": [
    {
      "id": "orb_lunar_polar",
      "name": "Low Lunar Polar Orbit (LRO science orbit)",
      "targetBody": "Moon",
      "altitudeKm": 50,
      "massPenaltyMultiplier": 0.27,
      "commWindowHoursPerDay": 8,
      "eclipseRatio": 0.35,
      "verifiedSpecs": {
        "LROInitialScienceOrbitAltitudeKm": 50
      },
      "gameOnlyFields": [
        "massPenaltyMultiplier",
        "commWindowHoursPerDay",
        "eclipseRatio"
      ],
      "nasaSourceUrl": "https://science.nasa.gov/mission/lro/about/"
    },
    {
      "id": "orb_mars_polar",
      "name": "Mars Reconnaissance Orbiter Science Orbit",
      "targetBody": "Mars",
      "altitudeKmMin": 255,
      "altitudeKmMax": 320,
      "massPenaltyMultiplier": 0.12,
      "commWindowHoursPerDay": 6,
      "eclipseRatio": 0.3,
      "verifiedSpecs": {
        "orbitalPeriapsisKm": 255,
        "orbitalApoapsisKm": 320,
        "orbitalPeriodMinutes": 112
      },
      "gameOnlyFields": [
        "massPenaltyMultiplier",
        "commWindowHoursPerDay",
        "eclipseRatio"
      ],
      "nasaSourceUrl": "https://science.nasa.gov/wp-content/uploads/2024/03/44745_mro-arrival.pdf"
    },
    {
      "id": "orb_earth_sso",
      "name": "Sun-Synchronous Earth Orbit (Landsat 9)",
      "targetBody": "Earth",
      "altitudeKm": 705,
      "inclinationDeg": 98.2,
      "massPenaltyMultiplier": 0.85,
      "commWindowHoursPerDay": 5,
      "eclipseRatio": 0.35,
      "verifiedSpecs": {
        "altitudeKm": 705,
        "inclinationDeg": 98.2,
        "periodMinutes": 99
      },
      "gameOnlyFields": [
        "massPenaltyMultiplier",
        "commWindowHoursPerDay",
        "eclipseRatio"
      ],
      "nasaSourceUrl": "https://science.nasa.gov/mission/landsat-9/"
    },
    {
      "id": "orb_earth_leo",
      "name": "Low Earth Orbit (LEO)",
      "targetBody": "Earth",
      "altitudeKm": 400,
      "massPenaltyMultiplier": 1,
      "commWindowHoursPerDay": 5,
      "eclipseRatio": 0.35,
      "verifiedSpecs": {
        "category": "Low Earth Orbit (LEO)",
        "representativeAltitudeKm": 400
      },
      "gameOnlyFields": [
        "altitudeKm",
        "massPenaltyMultiplier",
        "commWindowHoursPerDay",
        "eclipseRatio"
      ],
      "nasaSourceUrl": "https://science.nasa.gov/earth/earth-observatory/catalog-of-earth-satellite-orbits/"
    }
  ],
  "launchVehicles": [
    {
      "id": "lv_falcon_med",
      "name": "Falcon 9 Block 5",
      "cost": 70,
      "maxPayloadKg": 22800,
      "reliability": 0.98,
      "verifiedSpecs": {
        "payloadToLEOKg": 22800,
        "configuration": "Falcon 9 Block 5"
      },
      "gameOnlyFields": [
        "cost",
        "reliability"
      ],
      "nasaSourceUrl": "https://ntrs.nasa.gov/api/citations/20240001680/downloads/HU-CAS-Seminar_2024-02-12.pdf",
      "gameplayNotes": "Ціна, надійність і коефіцієнти доступності орбіт — ігрові припущення; макс. вантажопідйомність вказана для LEO."
    },
    {
      "id": "lv_falcon_heavy",
      "name": "Falcon Heavy",
      "cost": 125,
      "maxPayloadKg": 63800,
      "reliability": 0.97,
      "verifiedSpecs": {
        "payloadToLEOKg": 63800
      },
      "gameOnlyFields": [
        "cost",
        "reliability"
      ],
      "nasaSourceUrl": "https://ntrs.nasa.gov/api/citations/20240001680/downloads/HU-CAS-Seminar_2024-02-12.pdf",
      "gameplayNotes": "Ціна, надійність і коефіцієнти доступності орбіт — ігрові припущення; макс. вантажопідйомність вказана для LEO."
    },
    {
      "id": "lv_atlas_v",
      "name": "Atlas V 551",
      "cost": 125,
      "maxPayloadKg": 18500,
      "reliability": 0.98,
      "verifiedSpecs": {
        "payloadToLEOKg": 18500
      },
      "gameOnlyFields": [
        "cost",
        "reliability"
      ],
      "nasaSourceUrl": "https://www.nasa.gov/wp-content/uploads/2024/01/routine-payloads-ea.pdf",
      "gameplayNotes": "Ціна, надійність і коефіцієнти доступності орбіт — ігрові припущення; макс. вантажопідйомність вказана для LEO."
    },
    {
      "id": "lv_sls",
      "name": "Space Launch System (SLS) Block 1",
      "cost": 320,
      "maxPayloadKg": 95000,
      "reliability": 0.97,
      "verifiedSpecs": {
        "payloadToLEOKg": 95000,
        "payloadToMoonTLIKg": "more than 27000"
      },
      "gameOnlyFields": [
        "cost",
        "reliability"
      ],
      "nasaSourceUrl": "https://www.nasa.gov/reference/space-launch-system/",
      "gameplayNotes": "Ціна, надійність і коефіцієнти доступності орбіт — ігрові припущення; макс. вантажопідйомність вказана для LEO."
    }
  ],
  "busComponents": [
    {
      "id": "ch_std",
      "category": "chassis",
      "name": "Spacecraft Structure (aluminum honeycomb bus)",
      "mass": 350,
      "cost": 20,
      "powerGeneration": 0,
      "powerConsumption": 15,
      "batteryCapacity": 0,
      "dataTransferRate": 0,
      "radiationResistance": 3,
      "prepTimeMonths": 8,
      "verifiedSpecs": {
        "subsystemType": "Spacecraft Structure (aluminum honeycomb bus)"
      },
      "gameOnlyFields": [
        "mass",
        "cost",
        "powerGeneration",
        "powerConsumption",
        "batteryCapacity",
        "dataTransferRate",
        "radiationResistance",
        "prepTimeMonths"
      ],
      "nasaSourceUrl": "https://www.nasa.gov/smallsat-institute/sst-soa/structures-materials-and-mechanisms/"
    },
    {
      "id": "pw_solar_m",
      "category": "power",
      "name": "Deployable Solar Array",
      "mass": 120,
      "cost": 18,
      "powerGeneration": 600,
      "powerConsumption": 0,
      "batteryCapacity": 0,
      "dataTransferRate": 0,
      "radiationResistance": 3,
      "prepTimeMonths": 6,
      "verifiedSpecs": {
        "subsystemType": "Deployable Solar Array"
      },
      "gameOnlyFields": [
        "mass",
        "cost",
        "powerGeneration",
        "powerConsumption",
        "batteryCapacity",
        "dataTransferRate",
        "radiationResistance",
        "prepTimeMonths"
      ],
      "nasaSourceUrl": "https://www.nasa.gov/smallsat-institute/sst-soa/power-subsystems/"
    },
    {
      "id": "bat_liion",
      "category": "battery",
      "name": "Lithium-Ion Spacecraft Battery",
      "mass": 85,
      "cost": 12,
      "powerGeneration": 0,
      "powerConsumption": 5,
      "batteryCapacity": 400,
      "dataTransferRate": 0,
      "radiationResistance": 3,
      "prepTimeMonths": 4,
      "verifiedSpecs": {
        "subsystemType": "Lithium-Ion Spacecraft Battery"
      },
      "gameOnlyFields": [
        "mass",
        "cost",
        "powerGeneration",
        "powerConsumption",
        "batteryCapacity",
        "dataTransferRate",
        "radiationResistance",
        "prepTimeMonths"
      ],
      "nasaSourceUrl": "https://www.nasa.gov/smallsat-institute/sst-soa/power-subsystems/"
    },
    {
      "id": "com_xband",
      "category": "comms",
      "name": "High-Gain Antenna / Communications Subsystem",
      "mass": 65,
      "cost": 15,
      "powerGeneration": 0,
      "powerConsumption": 80,
      "batteryCapacity": 0,
      "dataTransferRate": 25,
      "radiationResistance": 4,
      "prepTimeMonths": 5,
      "verifiedSpecs": {
        "subsystemType": "High-Gain Antenna / Communications Subsystem"
      },
      "gameOnlyFields": [
        "mass",
        "cost",
        "powerGeneration",
        "powerConsumption",
        "batteryCapacity",
        "dataTransferRate",
        "radiationResistance",
        "prepTimeMonths"
      ],
      "nasaSourceUrl": "https://science.nasa.gov/mission/lro/spacecraft-and-instruments/"
    },
    {
      "id": "cpu_rad750",
      "category": "computer",
      "name": "Command and Data Handling / Attitude Control",
      "mass": 45,
      "cost": 22,
      "powerGeneration": 0,
      "powerConsumption": 65,
      "batteryCapacity": 0,
      "dataTransferRate": 0,
      "radiationResistance": 4,
      "prepTimeMonths": 6,
      "verifiedSpecs": {
        "subsystemType": "Command and Data Handling / Attitude Control"
      },
      "gameOnlyFields": [
        "mass",
        "cost",
        "powerGeneration",
        "powerConsumption",
        "batteryCapacity",
        "dataTransferRate",
        "radiationResistance",
        "prepTimeMonths"
      ],
      "nasaSourceUrl": "https://www.nasa.gov/smallsat-institute/sst-soa/"
    },
    {
      "id": "propulsion",
      "category": "propulsion",
      "name": "Spacecraft Propulsion Subsystem",
      "mass": 100,
      "cost": 30,
      "powerGeneration": 0,
      "powerConsumption": 30,
      "batteryCapacity": 0,
      "dataTransferRate": 0,
      "radiationResistance": 3,
      "prepTimeMonths": 8,
      "verifiedSpecs": {
        "subsystemType": "Spacecraft Propulsion Subsystem"
      },
      "gameOnlyFields": [
        "mass",
        "cost",
        "powerGeneration",
        "powerConsumption",
        "batteryCapacity",
        "dataTransferRate",
        "radiationResistance",
        "prepTimeMonths"
      ],
      "nasaSourceUrl": "https://www.nasa.gov/smallsat-institute/sst-soa/in-space_propulsion/"
    },
    {
      "id": "thermal",
      "category": "thermal",
      "name": "Spacecraft Thermal Control Subsystem",
      "mass": 40,
      "cost": 10,
      "powerGeneration": 0,
      "powerConsumption": 20,
      "batteryCapacity": 0,
      "dataTransferRate": 0,
      "radiationResistance": 3,
      "prepTimeMonths": 5,
      "verifiedSpecs": {
        "subsystemType": "Spacecraft Thermal Control Subsystem"
      },
      "gameOnlyFields": [
        "mass",
        "cost",
        "powerGeneration",
        "powerConsumption",
        "batteryCapacity",
        "dataTransferRate",
        "radiationResistance",
        "prepTimeMonths"
      ],
      "nasaSourceUrl": "https://www.nasa.gov/smallsat-institute/sst-soa/"
    },
    {
      "id": "ch_light",
      "category": "chassis",
      "name": "Lightweight Aluminum Spacecraft Structure",
      "mass": 210,
      "cost": 12,
      "powerGeneration": 0,
      "powerConsumption": 12,
      "batteryCapacity": 0,
      "dataTransferRate": 0,
      "radiationResistance": 2,
      "prepTimeMonths": 6,
      "verifiedSpecs": {
        "subsystemType": "Lightweight Aluminum Spacecraft Structure"
      },
      "gameOnlyFields": [
        "mass",
        "cost",
        "powerGeneration",
        "powerConsumption",
        "batteryCapacity",
        "dataTransferRate",
        "radiationResistance",
        "prepTimeMonths"
      ],
      "nasaSourceUrl": "https://www.nasa.gov/smallsat-institute/sst-soa/structures-materials-and-mechanisms/"
    },
    {
      "id": "pw_solar_l",
      "category": "power",
      "name": "High-Efficiency Deep Space Solar Array (MRO-inspired)",
      "mass": 210,
      "cost": 45,
      "powerGeneration": 1400,
      "powerConsumption": 0,
      "batteryCapacity": 0,
      "dataTransferRate": 0,
      "radiationResistance": 4,
      "prepTimeMonths": 9,
      "verifiedSpecs": {
        "subsystemType": "Spacecraft solar arrays",
        "referenceMission": "Mars Reconnaissance Orbiter",
        "referenceMroSolarPowerAtMarsW": 2000
      },
      "gameOnlyFields": [
        "mass",
        "cost",
        "powerGeneration",
        "powerConsumption",
        "batteryCapacity",
        "dataTransferRate",
        "radiationResistance",
        "prepTimeMonths"
      ],
      "nasaSourceUrl": "https://science.nasa.gov/wp-content/uploads/2024/03/44745_mro-arrival.pdf"
    },
    {
      "id": "bat_highcap",
      "category": "battery",
      "name": "High-Capacity Redundant Spacecraft Battery",
      "mass": 140,
      "cost": 28,
      "powerGeneration": 0,
      "powerConsumption": 10,
      "batteryCapacity": 900,
      "dataTransferRate": 0,
      "radiationResistance": 4,
      "prepTimeMonths": 6,
      "verifiedSpecs": {
        "subsystemType": "High-Capacity Redundant Spacecraft Battery"
      },
      "gameOnlyFields": [
        "mass",
        "cost",
        "powerGeneration",
        "powerConsumption",
        "batteryCapacity",
        "dataTransferRate",
        "radiationResistance",
        "prepTimeMonths"
      ],
      "nasaSourceUrl": "https://www.nasa.gov/smallsat-institute/sst-soa/power-subsystems/"
    },
    {
      "id": "com_kaband",
      "category": "comms",
      "name": "Ka-Band High-Rate Communications Subsystem",
      "mass": 95,
      "cost": 35,
      "powerGeneration": 0,
      "powerConsumption": 110,
      "batteryCapacity": 0,
      "dataTransferRate": 45,
      "radiationResistance": 4,
      "prepTimeMonths": 7,
      "verifiedSpecs": {
        "subsystemType": "Ka-Band High-Rate Communications Subsystem"
      },
      "gameOnlyFields": [
        "mass",
        "cost",
        "powerGeneration",
        "powerConsumption",
        "batteryCapacity",
        "dataTransferRate",
        "radiationResistance",
        "prepTimeMonths"
      ],
      "nasaSourceUrl": "https://www.nasa.gov/smallsat-institute/sst-soa/soa-communications/"
    },
    {
      "id": "com_sband_low",
      "category": "comms",
      "name": "S-Band Low-Gain Communications Subsystem",
      "mass": 25,
      "cost": 8,
      "powerGeneration": 0,
      "powerConsumption": 30,
      "batteryCapacity": 0,
      "dataTransferRate": 12,
      "radiationResistance": 3,
      "prepTimeMonths": 3,
      "verifiedSpecs": {
        "subsystemType": "S-Band Low-Gain Communications Subsystem"
      },
      "gameOnlyFields": [
        "mass",
        "cost",
        "powerGeneration",
        "powerConsumption",
        "batteryCapacity",
        "dataTransferRate",
        "radiationResistance",
        "prepTimeMonths"
      ],
      "nasaSourceUrl": "https://www.nasa.gov/smallsat-institute/sst-soa/soa-communications/"
    },
    {
      "id": "cpu_economy",
      "category": "computer",
      "name": "Basic Spacecraft Command and Data Handling",
      "mass": 30,
      "cost": 12,
      "powerGeneration": 0,
      "powerConsumption": 40,
      "batteryCapacity": 0,
      "dataTransferRate": 0,
      "radiationResistance": 2,
      "prepTimeMonths": 4,
      "verifiedSpecs": {
        "subsystemType": "Basic Spacecraft Command and Data Handling"
      },
      "gameOnlyFields": [
        "mass",
        "cost",
        "powerGeneration",
        "powerConsumption",
        "batteryCapacity",
        "dataTransferRate",
        "radiationResistance",
        "prepTimeMonths"
      ],
      "nasaSourceUrl": "https://www.nasa.gov/smallsat-institute/sst-soa/"
    },
    {
      "id": "propulsion_light",
      "category": "propulsion",
      "name": "Low-Thrust Small Spacecraft Propulsion Subsystem",
      "mass": 55,
      "cost": 16,
      "powerGeneration": 0,
      "powerConsumption": 15,
      "batteryCapacity": 0,
      "dataTransferRate": 0,
      "radiationResistance": 2,
      "prepTimeMonths": 5,
      "verifiedSpecs": {
        "subsystemType": "Low-Thrust Small Spacecraft Propulsion Subsystem"
      },
      "gameOnlyFields": [
        "mass",
        "cost",
        "powerGeneration",
        "powerConsumption",
        "batteryCapacity",
        "dataTransferRate",
        "radiationResistance",
        "prepTimeMonths"
      ],
      "nasaSourceUrl": "https://www.nasa.gov/smallsat-institute/sst-soa/in-space_propulsion/"
    },
    {
      "id": "thermal_passive",
      "category": "thermal",
      "name": "Passive Spacecraft Thermal Control Subsystem",
      "mass": 25,
      "cost": 6,
      "powerGeneration": 0,
      "powerConsumption": 8,
      "batteryCapacity": 0,
      "dataTransferRate": 0,
      "radiationResistance": 2,
      "prepTimeMonths": 4,
      "verifiedSpecs": {
        "subsystemType": "Passive Spacecraft Thermal Control Subsystem"
      },
      "gameOnlyFields": [
        "mass",
        "cost",
        "powerGeneration",
        "powerConsumption",
        "batteryCapacity",
        "dataTransferRate",
        "radiationResistance",
        "prepTimeMonths"
      ],
      "nasaSourceUrl": "https://www.nasa.gov/smallsat-institute/sst-soa/"
    }
  ],
  "instruments": [
    {
      "id": "inst_lola",
      "name": "Lunar Orbiter Laser Altimeter (LOLA)",
      "type": "Laser Altimeter",
      "mass": 25,
      "cost": 15,
      "powerConsumption": 30,
      "dataGenerationRate": 20,
      "sciencePoints": 55,
      "compatibleTargets": [
        "Moon"
      ],
      "prepTimeMonths": 10,
      "nasaInfo": "Лазерний висотомір LRO створює топографічні карти місячної поверхні.",
      "verifiedSpecs": {},
      "gameOnlyFields": [
        "cost",
        "dataGenerationRate",
        "sciencePoints",
        "prepTimeMonths",
        "mass",
        "powerConsumption"
      ],
      "nasaSourceUrl": "https://science.nasa.gov/mission/lro/spacecraft-and-instruments/"
    },
    {
      "id": "inst_lend",
      "name": "Lunar Exploration Neutron Detector (LEND)",
      "type": "Neutron Detector",
      "mass": 27,
      "cost": 25,
      "powerConsumption": 15,
      "dataGenerationRate": 15,
      "sciencePoints": 60,
      "compatibleTargets": [
        "Moon"
      ],
      "prepTimeMonths": 10,
      "nasaInfo": "Нейтронний детектор LRO досліджує водень поблизу поверхні Місяця.",
      "verifiedSpecs": {},
      "gameOnlyFields": [
        "cost",
        "dataGenerationRate",
        "sciencePoints",
        "prepTimeMonths",
        "mass",
        "powerConsumption"
      ],
      "nasaSourceUrl": "https://science.nasa.gov/mission/lro/spacecraft-and-instruments/"
    },
    {
      "id": "inst_lroc",
      "name": "Lunar Reconnaissance Orbiter Camera (LROC)",
      "type": "Camera",
      "mass": 35,
      "cost": 35,
      "powerConsumption": 40,
      "dataGenerationRate": 80,
      "sciencePoints": 75,
      "compatibleTargets": [
        "Moon"
      ],
      "prepTimeMonths": 10,
      "nasaInfo": "Камери LRO отримують детальні знімки поверхні Місяця та районів посадки.",
      "verifiedSpecs": {},
      "gameOnlyFields": [
        "cost",
        "dataGenerationRate",
        "sciencePoints",
        "prepTimeMonths",
        "mass",
        "powerConsumption"
      ],
      "nasaSourceUrl": "https://science.nasa.gov/mission/lro/spacecraft-and-instruments/"
    },
    {
      "id": "inst_hirise",
      "name": "High Resolution Imaging Experiment (HiRISE)",
      "type": "Camera",
      "mass": 65,
      "cost": 50,
      "powerConsumption": 60,
      "dataGenerationRate": 120,
      "sciencePoints": 90,
      "compatibleTargets": [
        "Mars"
      ],
      "prepTimeMonths": 10,
      "nasaInfo": "Камера MRO з високою роздільною здатністю фотографує рельєф Марса.",
      "verifiedSpecs": {
        "massKg": 65,
        "powerW": 60,
        "maximumImageDataGigabits": 28
      },
      "gameOnlyFields": [
        "cost",
        "dataGenerationRate",
        "sciencePoints",
        "prepTimeMonths"
      ],
      "nasaSourceUrl": "https://science.nasa.gov/mission/mars-reconnaissance-orbiter/science-instruments/"
    },
    {
      "id": "inst_crism",
      "name": "Compact Reconnaissance Imaging Spectrometer for Mars (CRISM)",
      "type": "Spectrometer",
      "mass": 32.92,
      "cost": 42,
      "powerConsumption": 47.3,
      "dataGenerationRate": 50,
      "sciencePoints": 80,
      "compatibleTargets": [
        "Mars"
      ],
      "prepTimeMonths": 10,
      "nasaInfo": "Спектрометр MRO визначає мінеральний склад поверхні Марса.",
      "verifiedSpecs": {
        "massKg": 32.92,
        "operatingPowerWattsRange": [
          44.4,
          47.3
        ],
        "wavelengthNmRange": [
          362,
          3920
        ]
      },
      "gameOnlyFields": [
        "cost",
        "dataGenerationRate",
        "sciencePoints",
        "prepTimeMonths"
      ],
      "nasaSourceUrl": "https://science.nasa.gov/mission/mars-reconnaissance-orbiter/science-instruments/"
    },
    {
      "id": "inst_sharad",
      "name": "Shallow Radar (SHARAD)",
      "type": "Radar",
      "mass": 15,
      "cost": 25,
      "powerConsumption": 25,
      "dataGenerationRate": 40,
      "sciencePoints": 70,
      "compatibleTargets": [
        "Mars"
      ],
      "prepTimeMonths": 10,
      "nasaInfo": "Радар MRO досліджує підповерхневі шари та поклади льоду на Марсі.",
      "verifiedSpecs": {
        "massKg": 15,
        "radioFrequencyMHzRange": [
          15,
          25
        ],
        "transmittedPeakPowerW": 10
      },
      "gameOnlyFields": [
        "cost",
        "dataGenerationRate",
        "sciencePoints",
        "prepTimeMonths",
        "powerConsumption"
      ],
      "nasaSourceUrl": "https://science.nasa.gov/mission/mars-reconnaissance-orbiter/science-instruments/"
    },
    {
      "id": "inst_oli2",
      "name": "Operational Land Imager 2 (OLI-2)",
      "type": "Imager",
      "mass": 100,
      "cost": 40,
      "powerConsumption": 95,
      "dataGenerationRate": 100,
      "sciencePoints": 80,
      "compatibleTargets": [
        "Earth"
      ],
      "prepTimeMonths": 10,
      "nasaInfo": "Оптичний сенсор Landsat 9 відстежує рослинність, воду й зміни земної поверхні.",
      "verifiedSpecs": {
        "spectralBands": 9,
        "spatialResolutionMetersVisibleSwir": 30,
        "panchromaticResolutionMeters": 15
      },
      "gameOnlyFields": [
        "cost",
        "dataGenerationRate",
        "sciencePoints",
        "prepTimeMonths",
        "mass",
        "powerConsumption"
      ],
      "nasaSourceUrl": "https://science.nasa.gov/mission/landsat-9/"
    },
    {
      "id": "inst_tirs2",
      "name": "Thermal Infrared Sensor 2 (TIRS-2)",
      "type": "Thermal Imager",
      "mass": 48,
      "cost": 35,
      "powerConsumption": 65,
      "dataGenerationRate": 60,
      "sciencePoints": 65,
      "compatibleTargets": [
        "Earth"
      ],
      "prepTimeMonths": 9,
      "nasaInfo": "Тепловий інфрачервоний прилад Landsat 9 для вимірювання температури земної поверхні у двох спектральних каналах.",
      "verifiedSpecs": {
        "spectralBands": 2,
        "spatialResolutionMeters": 100,
        "thermalBandsMicrometers": [
          [
            10.6,
            11.19
          ],
          [
            11.5,
            12.51
          ]
        ]
      },
      "gameOnlyFields": [
        "mass",
        "cost",
        "powerConsumption",
        "dataGenerationRate",
        "sciencePoints",
        "prepTimeMonths"
      ],
      "nasaSourceUrl": "https://science.nasa.gov/mission/landsat-9/"
    }
  ],
  "crisisEvents": [
    {
      "id": "cr_solar_flare",
      "targetBody": "Moon",
      "title": "Solar Radiation Event / Safe Mode",
      "description": "Підвищена активність Сонця: потрібно захистити бортові системи та обмежити роботу приладів. Це навчальний сценарій, а не конкретний інцидент місії LRO.",
      "options": [
        {
          "text": "Перейти в Safe Mode",
          "requiredRadResistance": 0,
          "scienceMultiplier": 0.7,
          "survivalChance": 0.99
        },
        {
          "text": "Продовжити скорочені спостереження із захистом",
          "requiredRadResistance": 4,
          "scienceMultiplier": 0.9,
          "survivalChance": 0.95
        },
        {
          "text": "Ігнорувати попередження",
          "requiredRadResistance": 0,
          "scienceMultiplier": 1,
          "survivalChance": 0.4
        }
      ],
      "gameOnlyFields": [
        "scienceMultiplier",
        "survivalChance",
        "requiredRadResistance"
      ],
      "nasaSourceUrl": "https://soho.nascom.nasa.gov/soc/esr/"
    },
    {
      "id": "cr_wheel",
      "targetBody": "Mars",
      "title": "Reaction Wheel Failure",
      "description": "Втрата маховика системи орієнтації погіршує точність наведення апарата. За мотивами реального збою двох маховиків телескопа Kepler.",
      "options": [
        {
          "text": "Перейти у безпечний режим і перерахувати план",
          "requiredRadResistance": 0,
          "scienceMultiplier": 0.65,
          "survivalChance": 0.98
        },
        {
          "text": "Використати резервну стратегію наведення",
          "requiredRadResistance": 0,
          "scienceMultiplier": 0.85,
          "survivalChance": 0.85
        },
        {
          "text": "Продовжити без змін",
          "requiredRadResistance": 0,
          "scienceMultiplier": 1,
          "survivalChance": 0.5
        }
      ],
      "gameOnlyFields": [
        "scienceMultiplier",
        "survivalChance",
        "requiredRadResistance"
      ],
      "nasaSourceUrl": "https://www.nasa.gov/news-release/nasa-ends-attempts-to-fully-recover-kepler-spacecraft-potential-new-missions-considered/"
    },
    {
      "id": "cr_comm",
      "targetBody": "Earth",
      "title": "Communications Loss / Antenna Misalignment",
      "description": "Помилка наведення антени спричиняє втрату зв’язку. Сценарій натхненний реальною паузою зв’язку Voyager 2 у 2023 році.",
      "options": [
        {
          "text": "Перенацілити антену та поновити сеанс",
          "requiredRadResistance": 0,
          "scienceMultiplier": 0.85,
          "survivalChance": 0.98
        },
        {
          "text": "Дочекатися автоматичного відновлення орієнтації",
          "requiredRadResistance": 0,
          "scienceMultiplier": 0.7,
          "survivalChance": 0.95
        },
        {
          "text": "Продовжувати збір даних без зв’язку",
          "requiredRadResistance": 0,
          "scienceMultiplier": 1,
          "survivalChance": 0.6
        }
      ],
      "gameOnlyFields": [
        "scienceMultiplier",
        "survivalChance",
        "requiredRadResistance"
      ],
      "nasaSourceUrl": "https://www.nasa.gov/missions/voyager-program/voyager-2/nasa-mission-update-voyager-2-communications-pause/"
    }
  ]
};
