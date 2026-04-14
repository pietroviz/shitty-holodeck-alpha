#!/usr/bin/env node
/**
 * Batch-create stock environment JSON files.
 * Run: node scripts/create-environments.js
 */

const fs = require('fs');
const path = require('path');

const BASE = 'public/holodeck/global_assets/environments';

const ENVS = [
  // ═══ URBAN ═══
  {
    id: 'env_rooftop_bar', name: 'Rooftop Bar', category: 'urban',
    tags: ['urban', 'nightlife', 'rooftop'],
    description: 'A stylish rooftop lounge overlooking the city skyline at dusk',
    skyTop: '#1a1a3e', skyHorizon: '#ff6b35', ground: '#3d3d3d',
    wallCount: 1, musicId: 'mus_tokyo_nights',
  },
  {
    id: 'env_subway_platform', name: 'Subway Platform', category: 'urban',
    tags: ['urban', 'underground', 'transit'],
    description: 'A fluorescent-lit subway platform with tile walls',
    skyTop: '#2a2a2a', skyHorizon: '#4a4a4a', ground: '#555555',
    wallCount: 2, musicId: 'mus_neon_pulse',
  },
  {
    id: 'env_rainy_alley', name: 'Rainy Alley', category: 'urban',
    tags: ['urban', 'rain', 'noir'],
    description: 'A narrow alley slick with rain, neon signs reflected in puddles',
    skyTop: '#2d2d3f', skyHorizon: '#4a4a5e', ground: '#333340',
    wallCount: 2, musicId: 'mus_rainy_window',
  },

  // ═══ NATURE ═══
  {
    id: 'env_forest_clearing', name: 'Forest Clearing', category: 'nature',
    tags: ['nature', 'forest', 'peaceful'],
    description: 'A sunlit clearing in an ancient forest with moss-covered ground',
    skyTop: '#87ceeb', skyHorizon: '#c8e6c9', ground: '#3a5c2e',
    wallCount: 0, musicId: 'mus_forest_canopy',
  },
  {
    id: 'env_mountain_peak', name: 'Mountain Peak', category: 'nature',
    tags: ['nature', 'mountain', 'epic'],
    description: 'A windswept mountain summit above the clouds',
    skyTop: '#1565c0', skyHorizon: '#e3f2fd', ground: '#78909c',
    wallCount: 0, musicId: 'mus_mountain_wind',
  },
  {
    id: 'env_ocean_shore', name: 'Ocean Shore', category: 'nature',
    tags: ['nature', 'beach', 'ocean'],
    description: 'A sandy beach with gentle waves lapping at the shore',
    skyTop: '#4fc3f7', skyHorizon: '#e0f7fa', ground: '#d7ccc8',
    wallCount: 0, musicId: 'mus_ocean_waves',
  },
  {
    id: 'env_desert_dunes', name: 'Desert Dunes', category: 'nature',
    tags: ['nature', 'desert', 'hot'],
    description: 'Rolling sand dunes stretching to the horizon under a blazing sun',
    skyTop: '#ff8f00', skyHorizon: '#fff8e1', ground: '#e6c87a',
    wallCount: 0, musicId: 'mus_desert_caravan',
  },

  // ═══ HOME INTERIORS ═══
  {
    id: 'env_cozy_living_room', name: 'Cozy Living Room', category: 'home-interiors',
    tags: ['interior', 'home', 'cozy'],
    description: 'A warm living room with soft lighting and comfortable furniture',
    skyTop: '#5d4037', skyHorizon: '#8d6e63', ground: '#6d4c41',
    wallCount: 2, musicId: 'mus_vinyl_memories',
  },
  {
    id: 'env_modern_kitchen', name: 'Modern Kitchen', category: 'home-interiors',
    tags: ['interior', 'kitchen', 'modern'],
    description: 'A sleek modern kitchen with stainless steel and marble counters',
    skyTop: '#eceff1', skyHorizon: '#cfd8dc', ground: '#e0e0e0',
    wallCount: 2, musicId: 'mus_late_night_lofi',
  },

  // ═══ OFFICE INTERIORS ═══
  {
    id: 'env_corner_office', name: 'Corner Office', category: 'office-interiors',
    tags: ['interior', 'office', 'corporate'],
    description: 'A prestigious corner office with floor-to-ceiling windows',
    skyTop: '#90caf9', skyHorizon: '#e3f2fd', ground: '#455a64',
    wallCount: 2, musicId: 'mus_morning_fog',
  },
  {
    id: 'env_startup_loft', name: 'Startup Loft', category: 'office-interiors',
    tags: ['interior', 'office', 'casual'],
    description: 'An open-plan loft workspace with exposed brick and whiteboards',
    skyTop: '#ffcc80', skyHorizon: '#fff3e0', ground: '#8d6e63',
    wallCount: 1, musicId: 'mus_late_night_lofi',
  },

  // ═══ HOLY PLACES ═══
  {
    id: 'env_ancient_temple', name: 'Ancient Temple', category: 'holy-places',
    tags: ['sacred', 'temple', 'ancient'],
    description: 'A crumbling stone temple with shafts of golden light through the ceiling',
    skyTop: '#4e342e', skyHorizon: '#d7ccc8', ground: '#795548',
    wallCount: 2, musicId: 'mus_crystal_cave',
  },
  {
    id: 'env_zen_garden', name: 'Zen Garden', category: 'holy-places',
    tags: ['sacred', 'zen', 'peaceful'],
    description: 'A meticulously raked sand garden with carefully placed stones',
    skyTop: '#90a4ae', skyHorizon: '#eceff1', ground: '#d7ccc8',
    wallCount: 1, musicId: 'mus_morning_fog',
  },

  // ═══ FANTASY ═══
  {
    id: 'env_enchanted_grove', name: 'Enchanted Grove', category: 'fantasy',
    tags: ['fantasy', 'magical', 'forest'],
    description: 'A mystical grove with glowing mushrooms and floating fireflies',
    skyTop: '#1a237e', skyHorizon: '#7c4dff', ground: '#1b5e20',
    wallCount: 0, musicId: 'mus_celtic_meadow',
  },
  {
    id: 'env_dragon_lair', name: "Dragon's Lair", category: 'fantasy',
    tags: ['fantasy', 'dragon', 'cave'],
    description: 'A vast cavern filled with treasure and the glow of molten rock',
    skyTop: '#1a0a00', skyHorizon: '#bf360c', ground: '#3e2723',
    wallCount: 2, musicId: 'mus_epic_dawn',
  },
  {
    id: 'env_floating_islands', name: 'Floating Islands', category: 'fantasy',
    tags: ['fantasy', 'sky', 'magical'],
    description: 'Grassy islands suspended in a pastel sky with waterfalls cascading into clouds',
    skyTop: '#7e57c2', skyHorizon: '#e1bee7', ground: '#4caf50',
    wallCount: 0, musicId: 'mus_deep_space_drift',
  },

  // ═══ SCI-FI ═══
  {
    id: 'env_space_station', name: 'Space Station', category: 'sci-fi',
    tags: ['sci-fi', 'space', 'station'],
    description: 'A gleaming orbital station with panoramic views of Earth below',
    skyTop: '#000011', skyHorizon: '#0d47a1', ground: '#37474f',
    wallCount: 2, musicId: 'mus_deep_space_drift',
  },
  {
    id: 'env_neon_district', name: 'Neon District', category: 'sci-fi',
    tags: ['sci-fi', 'cyberpunk', 'neon'],
    description: 'A rain-soaked cyberpunk district pulsing with holographic advertisements',
    skyTop: '#0a0a1a', skyHorizon: '#e040fb', ground: '#1a1a2e',
    wallCount: 1, musicId: 'mus_cyber_chase',
  },
  {
    id: 'env_alien_landscape', name: 'Alien Landscape', category: 'sci-fi',
    tags: ['sci-fi', 'alien', 'exotic'],
    description: 'A bizarre alien world with bioluminescent flora and twin suns',
    skyTop: '#880e4f', skyHorizon: '#f8bbd0', ground: '#4a148c',
    wallCount: 0, musicId: 'mus_glitch_groove',
  },

  // ═══ DREAMSCAPES ═══
  {
    id: 'env_cloud_palace', name: 'Cloud Palace', category: 'dreamscapes',
    tags: ['dream', 'clouds', 'surreal'],
    description: 'A palace made of shifting clouds, staircases leading to nowhere',
    skyTop: '#e1bee7', skyHorizon: '#f3e5f5', ground: '#f5f5f5',
    wallCount: 0, musicId: 'mus_peaceful_ending',
  },
  {
    id: 'env_mirror_lake', name: 'Mirror Lake', category: 'dreamscapes',
    tags: ['dream', 'lake', 'reflection'],
    description: 'A perfectly still lake reflecting an impossible sky of two moons',
    skyTop: '#1a237e', skyHorizon: '#9fa8da', ground: '#263238',
    wallCount: 0, musicId: 'mus_crystal_cave',
  },
  {
    id: 'env_infinite_library', name: 'Infinite Library', category: 'dreamscapes',
    tags: ['dream', 'books', 'surreal'],
    description: 'Endless shelves of books stretching into a warm amber infinity',
    skyTop: '#4e342e', skyHorizon: '#ffcc80', ground: '#5d4037',
    wallCount: 2, musicId: 'mus_vinyl_memories',
  },
];

// Create category folders and write JSON files
const manifest = { categories: {} };
const now = new Date().toISOString();

for (const env of ENVS) {
  const catDir = path.join(BASE, env.category);
  if (!fs.existsSync(catDir)) fs.mkdirSync(catDir, { recursive: true });

  const asset = {
    id: env.id,
    type: 'environment',
    name: env.name,
    tags: env.tags,
    meta: {
      created: now,
      modified: now,
      origin: 'template',
      version: 1,
    },
    payload: {
      description: env.description,
      format: 'environment_scene',
      skybox: {
        type: 'gradient',
        topColor: env.skyTop,
        bottomColor: env.skyHorizon,
      },
      ground: {
        color: env.ground,
        material: 'default',
      },
      state: {
        groundColor: env.ground,
        skyTopColor: env.skyTop,
        skyHorizonColor: env.skyHorizon,
        wallCount: env.wallCount || 0,
        musicId: env.musicId || '',
      },
      walls: [],
      objects: [],
    },
  };

  const filePath = path.join(catDir, `${env.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(asset, null, 2) + '\n');

  // Track in manifest
  if (!manifest.categories[env.category]) {
    // Capitalize category name
    const name = env.category.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    manifest.categories[env.category] = { name, count: 0, files: [] };
  }
  manifest.categories[env.category].files.push(`${env.id}.json`);
  manifest.categories[env.category].count++;
}

// Write manifest
fs.writeFileSync(path.join(BASE, 'manifest.json'), JSON.stringify(manifest, null, 4) + '\n');

console.log(`Created ${ENVS.length} environment assets across ${Object.keys(manifest.categories).length} categories.`);
