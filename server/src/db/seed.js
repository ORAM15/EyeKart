/**
 * EyeKart Phase 6.8 Database Seeder
 * Canonical reconciliation: Synchronizes all 13 canonical products from assets/js/catalog-data.js
 * Strictly preserves EK-902 SOURCE CONFLICT safeguard and reconciles established prices/names.
 */
const { query } = require('./pool');
const { hashPassword } = require('../services/authService');

async function seed() {
  console.info('[EyeKart Seed] Starting Phase 6.8 database seeding (13 Canonical SKUs)...');

  // 1. Roles
  const roles = [
    { name: 'CUSTOMER', desc: 'Default retail optical customer account' },
    { name: 'STAFF', desc: 'Atelier retail & customer service operations' },
    { name: 'STORE_STAFF', desc: 'Store staff for packing, dispatch, and delivery handover' },
    { name: 'LAB_TECH', desc: 'Optical laboratory technician for lens surfacing and quality checks' },
    { name: 'OPTOMETRIST', desc: 'Licensed clinical optometrist for prescription review' },
    { name: 'ADMIN', desc: 'System administrator with full catalog & operational oversight' }
  ];

  for (const r of roles) {
    await query(
      `INSERT INTO roles (name, description) VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description`,
      [r.name, r.desc]
    );
  }

  // 2. Categories
  const categories = [
    { id: 'eyeglasses', name: 'Prescription Eyeglasses', slug: 'eyeglasses', desc: 'Optical prescription frames with digital surfacing' },
    { id: 'sunglasses', name: 'Polarized Sunglasses', slug: 'sunglasses', desc: 'UV400 protective fashion & outdoor optics' },
    { id: 'screen', name: 'Screen & Blue Light Glasses', slug: 'screen', desc: 'High-energy blue light filtering for digital eye strain' }
  ];

  for (const c of categories) {
    await query(
      `INSERT INTO categories (id, name, slug, description) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description`,
      [c.id, c.name, c.slug, c.desc]
    );
  }

  // 3. Collections (12 Canonical Series)
  const collections = [
    {
        "id": "nairobi_precision",
        "name": "The Nairobi Precision Series",
        "desc": "Lightweight beta-titanium engineered for African facial ergonomics"
    },
    {
        "id": "equatorial_edition",
        "name": "Equatorial Edition",
        "desc": "Italian Mazzucchelli bio-acetate frames hand-crafted for equatorial wear"
    },
    {
        "id": "savannah_air",
        "name": "Savannah Air",
        "desc": "Equatorial teardrop silhouette engineered for East African solar protection"
    },
    {
        "id": "executive_club",
        "name": "Executive Club",
        "desc": "Heavy architectural browline silhouettes for boardroom presence"
    },
    {
        "id": "crystal_series",
        "name": "Crystal Series",
        "desc": "High-clarity bio-derived crystal lucent polymer frames"
    },
    {
        "id": "cat_eye_atelier",
        "name": "Cat-Eye Atelier",
        "desc": "Sculpted brow contour designed for cheekbone clearance"
    },
    {
        "id": "pure_rimless",
        "name": "Pure Rimless",
        "desc": "Screwless compression bushing system in Japanese beta-titanium"
    },
    {
        "id": "bold_silhouette",
        "name": "Bold Silhouette",
        "desc": "Substantial 8mm milled acetate faceplate with beveled chamfers"
    },
    {
        "id": "nairobi_tech",
        "name": "Nairobi Tech",
        "desc": "Flexible TR90 memory polymer with integrated silicone temple grips"
    },
    {
        "id": "semi_rimless",
        "name": "Semi-Rimless",
        "desc": "High-tensile nylon cord suspension with titanium chassis"
    },
    {
        "id": "equatorial_sun_rx",
        "name": "Equatorial Sun Rx",
        "desc": "Dual-curved polarized optics with rear anti-reflective multi-coating"
    },
    {
        "id": "bespoke_horn",
        "name": "Bespoke Horn",
        "desc": "Hand-carved organic horn with 24K gold electroplated precision joints"
    }
];

  for (const col of collections) {
    await query(
      `INSERT INTO collections (id, name, description) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description`,
      [col.id, col.name, col.desc]
    );
  }

  // 4. Products & Canonical Data (All 13 Canonical SKUs, preserving EK-902 Safeguard)
  const products = [
    {
        "sku": "EK-902",
        "name": "Kibera Minimalist Titanium",
        "brand": "EyeKart Nairobi Atelier",
        "category_id": "eyeglasses",
        "collection_id": "nairobi_precision",
        "gender": "unisex",
        "shape": "round",
        "material": "Japanese Beta-Titanium",
        "base_price": 18500,
        "compare_at_price": null,
        "dimensions": "50 □ 19 - 140",
        "weight": "14.2g",
        "bridge": 19,
        "temple": 140,
        "lens_width": 50,
        "lens_height": 44,
        "pantoscopic_angle": "8.5°",
        "base_curve": "4.0",
        "frame_total_width": 136,
        "stock": 14,
        "source_conflict": "EK-902 SOURCE CONFLICT — BUSINESS CONFIRMATION REQUIRED",
        "source_conflict_details": "3D Studio displays KSh 14,800 (compare-at KSh 17,500, 51x19x145mm, 12.8g, Hexagonal). Checkout Ledger & Homepage Hero display KSh 18,500 (52x18x140mm, 12g). Pre-Auth Insurance Modal displays KSh 11,400 copay/tariff.",
        "gallery": "[\"https://lh3.googleusercontent.com/aida-public/AB6AXuBKQv_VnLuN8ds7xO3zgoSxc0DRFCJbfyaP_3BAYw_00SEWiB3Q_5TDyc0SW-uSuW8A1McFkE6u6wAyZ36yJ3KYBIaEo3fhghOFtSuKhqQjVYCRu4YQg3KlRXs4ZwFcFsTA4LWWJucRzbzAR1y7iNyPeejKz5L-iO4zNyLSMrgbnW_gTA7dWVgP6G4O3sqCMB16_opTwdRLhvzw3urr-e0ykitbgWDQ6YA1dV34BbvuJvRVYVLl6WYZyw\"]",
        "prescription_compatibility": "{\"sphMin\":-10,\"sphMax\":6,\"cylMax\":-4,\"supportsHighIndex\":true}",
        "asset_3d": "{\"modelUrl\":\"assets/models/ek902.glb\",\"hasCadBlueprint\":true,\"defaultFov\":45}",
        "asset_vto": "{\"overlayUrl\":\"assets/vto/ek902_vto.png\",\"scaleFactor\":1,\"bridgeOffset\":[0,1.2,0]}",
        "variants": [
            {
                "name": "Brushed Champagne Titanium",
                "colorHex": "#E5D7B7",
                "skuSuffix": "-GLD",
                "priceDelta": 0
            },
            {
                "name": "Matte Obsidian Black",
                "colorHex": "#202224",
                "skuSuffix": "-OBS",
                "priceDelta": 0
            },
            {
                "name": "Raw Brushed Platinum",
                "colorHex": "#D1D5DB",
                "skuSuffix": "-PLT",
                "priceDelta": 0
            },
            {
                "name": "Havana Tortoise & Rose Titanium",
                "colorHex": "#6B3E11",
                "skuSuffix": "-TOR",
                "priceDelta": 0
            }
        ]
    },
    {
        "sku": "EK-804",
        "name": "The Westlands Octagonal",
        "brand": "EyeKart Nairobi Atelier",
        "category_id": "eyeglasses",
        "collection_id": "nairobi_precision",
        "gender": "unisex",
        "shape": "octagonal",
        "material": "Hand-milled Japanese titanium with laser-cut bridge filigree",
        "base_price": 13800,
        "compare_at_price": 17500,
        "dimensions": "51 □ 19 - 145",
        "weight": "14.2g",
        "bridge": 19,
        "temple": 145,
        "lens_width": 51,
        "lens_height": 46,
        "pantoscopic_angle": "8.5°",
        "base_curve": "4.0",
        "frame_total_width": 138,
        "stock": 8,
        "source_conflict": null,
        "source_conflict_details": null,
        "gallery": "[\"https://lh3.googleusercontent.com/aida-public/AB6AXuDAiAxgQStqP2fpBMr1KV0eNYXhnrJzO0BxktJHz8RDGKJSrtvFRjxTTR6DHYoryotAM43W2Zfp4SrRi2hfACWnGiKyFdAI-mAk80Mb_L7tox9xVA_GmIHG4kNi_UGBGVeyDYisE7Vra2dukE3cWSEIXzlXn1MaRpaOHHDO4fKfRdo7l6cBeIdjbwh9JjcApDCP9BIx8vgedH9YlWWW_t3o59ryRrMbQGKXszp2VPRi1p_zZWSlmb5fsw\"]",
        "prescription_compatibility": "{\"sphMin\":-8,\"sphMax\":5,\"cylMax\":-3.5,\"supportsHighIndex\":true}",
        "asset_3d": "{\"modelUrl\":\"assets/models/ek804.glb\",\"hasCadBlueprint\":true,\"defaultFov\":45}",
        "asset_vto": "{\"overlayUrl\":\"assets/vto/ek804_vto.png\",\"scaleFactor\":1.02,\"bridgeOffset\":[0,1.1,0]}",
        "variants": [
            {
                "name": "Champagne Gold",
                "colorHex": "#E5C158",
                "skuSuffix": "-GLD",
                "priceDelta": 0
            },
            {
                "name": "Matte Platinum",
                "colorHex": "#D5D8DC",
                "skuSuffix": "-PLT",
                "priceDelta": 0
            }
        ]
    },
    {
        "sku": "EK-102",
        "name": "The Karen Round Acetate",
        "brand": "EyeKart Nairobi Atelier",
        "category_id": "eyeglasses",
        "collection_id": "equatorial_edition",
        "gender": "women",
        "shape": "round",
        "material": "Mazzucchelli Havana amber with triple-barrel optical hinges",
        "base_price": 11200,
        "compare_at_price": 13960,
        "dimensions": "49 □ 20 - 140",
        "weight": "19.8g",
        "bridge": 20,
        "temple": 140,
        "lens_width": 49,
        "lens_height": 45,
        "pantoscopic_angle": "8.5°",
        "base_curve": "4.0",
        "frame_total_width": 138,
        "stock": 19,
        "source_conflict": null,
        "source_conflict_details": null,
        "gallery": "[\"https://lh3.googleusercontent.com/aida-public/AB6AXuDyC-v6VxnC0NXIdlMdvyrFGSUlq-Q1-Sx96zmcvL6dSqM2l3lbeirEoKr3_Lb1lgRfgzZfQ2vA4-Y_27yyVOw0flONl6lfTm6fEYR2zPOD8-_8VJFOboYefIhbEcFeCOdyBa9kv6GwTTVXCpp65x2LFOzO-IZxcRxch6tkjJrv6gDT2HoTWkosgSzO0914jIPxOnBXAvOjAddggnGHhO-OlMKq_QXZk8UxNHWJAlWIaZVI5uNKOOQRiA\"]",
        "prescription_compatibility": "{\"sphMin\":-12,\"sphMax\":8,\"cylMax\":-5,\"supportsHighIndex\":true}",
        "asset_3d": "{\"modelUrl\":\"assets/models/ek102.glb\",\"hasCadBlueprint\":true,\"defaultFov\":45}",
        "asset_vto": "{\"overlayUrl\":\"assets/vto/ek102_vto.png\",\"scaleFactor\":0.98,\"bridgeOffset\":[0,1,0]}",
        "variants": [
            {
                "name": "Havana Amber",
                "colorHex": "#6E3900",
                "skuSuffix": "-TOR",
                "priceDelta": 0
            },
            {
                "name": "Polished Onyx",
                "colorHex": "#0B1C30",
                "skuSuffix": "-ONX",
                "priceDelta": 0
            }
        ]
    },
    {
        "sku": "EK-915",
        "name": "The Safari Aviator Wire",
        "brand": "EyeKart Nairobi Atelier",
        "category_id": "sunglasses",
        "collection_id": "savannah_air",
        "gender": "men",
        "shape": "aviator",
        "material": "Laser-welded beta titanium brow bar for low bridge stability",
        "base_price": 15200,
        "compare_at_price": 19000,
        "dimensions": "54 □ 17 - 145",
        "weight": "11.9g",
        "bridge": 17,
        "temple": 145,
        "lens_width": 54,
        "lens_height": 48,
        "pantoscopic_angle": "8.5°",
        "base_curve": "4.0",
        "frame_total_width": 138,
        "stock": 11,
        "source_conflict": null,
        "source_conflict_details": null,
        "gallery": "[\"https://lh3.googleusercontent.com/aida-public/AB6AXuCPpciKRtSKwCuJlr9xYFHz7K-nIepSb6hRIDV2iOEWML4o3YXHr8UOBASbOljE6s7GvpnnM2dGglS5r3ZgkQGWLMb4s5umi9ihiu4SDGuwe9Oqiu2ML3bTjrFCp7T6C9_h9sJQzsw14myOKb71CMfBHb13lpq_ORIFZ0962slMHqKZu21q0MlI0Ry4SVJnMo73l6CgZuq9Q4evwP3XKxXhRKburtGGArE_hLHQZhy4EwDGzoUqo1mwfg\"]",
        "prescription_compatibility": "{\"sphMin\":-6,\"sphMax\":4,\"cylMax\":-2.5,\"supportsHighIndex\":true}",
        "asset_3d": "{\"modelUrl\":\"assets/models/ek915.glb\",\"hasCadBlueprint\":true,\"defaultFov\":45}",
        "asset_vto": "{\"overlayUrl\":\"assets/vto/ek915_vto.png\",\"scaleFactor\":1.05,\"bridgeOffset\":[0,1.3,0]}",
        "variants": [
            {
                "name": "Savannah Gold",
                "colorHex": "#D4AF37",
                "skuSuffix": "-GLD",
                "priceDelta": 0
            },
            {
                "name": "Gunmetal Shadow",
                "colorHex": "#4A4D52",
                "skuSuffix": "-GUN",
                "priceDelta": 0
            }
        ]
    },
    {
        "sku": "EK-505",
        "name": "The Gigiri Browline Hybrid",
        "brand": "EyeKart Nairobi Atelier",
        "category_id": "eyeglasses",
        "collection_id": "executive_club",
        "gender": "unisex",
        "shape": "browline",
        "material": "Heavy architectural top frame with titanium cable temple tips",
        "base_price": 14500,
        "compare_at_price": 17200,
        "dimensions": "52 □ 18 - 145",
        "weight": "21.0g",
        "bridge": 18,
        "temple": 145,
        "lens_width": 52,
        "lens_height": 42,
        "pantoscopic_angle": "8.5°",
        "base_curve": "4.0",
        "frame_total_width": 138,
        "stock": 6,
        "source_conflict": null,
        "source_conflict_details": null,
        "gallery": "[\"https://lh3.googleusercontent.com/aida-public/AB6AXuB-fX2muVk1-2as94SW4TZ46Bu2v58NgacAB2MSskVoRZhNXzi2IHbrjFvTtbJyPjSZq02BoMLQun5Ke-M0GqaiUGT5PWW9wdO-aNiRKzxKdoDHQZs0Y9Qj8VHjtmOzVNRqCOWyIREkkyCYxyEuqU1o8WsbOTdXGWSY7XZrdhcQdlI08t70_ko3jgKOQNEZjvcE-PZzTDBqJnQIPvRIRrUwFzhk1ufaEC0OHysTN__CvxnoVsSOVjo0Pg\"]",
        "prescription_compatibility": "{\"sphMin\":-9,\"sphMax\":6,\"cylMax\":-3.5}",
        "asset_3d": "{\"modelUrl\":\"assets/models/ek505.glb\",\"hasCadBlueprint\":true}",
        "asset_vto": "{\"overlayUrl\":\"assets/vto/ek505_vto.png\",\"scaleFactor\":1}",
        "variants": [
            {
                "name": "Rose Titanium",
                "colorHex": "#B76E79",
                "skuSuffix": "-RSE",
                "priceDelta": 0
            },
            {
                "name": "Graphite Silver",
                "colorHex": "#2A2E35",
                "skuSuffix": "-SLV",
                "priceDelta": 0
            }
        ]
    },
    {
        "sku": "EK-308",
        "name": "The Muthaiga Lucent Poly",
        "brand": "EyeKart Nairobi Atelier",
        "category_id": "eyeglasses",
        "collection_id": "crystal_series",
        "gender": "unisex",
        "shape": "square",
        "material": "High-clarity bio-derived acetate with interior wire core engraving",
        "base_price": 9800,
        "compare_at_price": 12000,
        "dimensions": "50 □ 19 - 142",
        "weight": "17.6g",
        "bridge": 19,
        "temple": 142,
        "lens_width": 50,
        "lens_height": 40,
        "pantoscopic_angle": "8.5°",
        "base_curve": "4.0",
        "frame_total_width": 138,
        "stock": 22,
        "source_conflict": null,
        "source_conflict_details": null,
        "gallery": "[\"https://lh3.googleusercontent.com/aida-public/AB6AXuAuFb_bKqK8EsG_JW7ds-LqeLchHTxDDpiMCAuOI7Su5zAJuL8K10LxD1wnGPFf3HZn1jYmwbRBPVcascO5pt13fcZ6Mwp4uZuPsOZ9SRKd5dsRvudAYmJzDWCqWlWF8gvJ0qyyaVi1RWG10BLgAVG1kRKYNrYt4B7qxxIfQWQRRnZlTpI_WMzG6Ros3ioJkB326o10Wu0KMIFWh_PPLfeAyu76C77lGUdPiAS9ZZ_4445NL0oo4D5Zig\"]",
        "prescription_compatibility": "{\"sphMin\":-10,\"sphMax\":6,\"cylMax\":-4}",
        "asset_3d": "{\"modelUrl\":\"assets/models/ek308.glb\",\"hasCadBlueprint\":true}",
        "asset_vto": "{\"overlayUrl\":\"assets/vto/ek308_vto.png\",\"scaleFactor\":1}",
        "variants": [
            {
                "name": "Crystal Lucent",
                "colorHex": "#F4F3F0",
                "skuSuffix": "-CLR",
                "priceDelta": 0
            },
            {
                "name": "Smoked Amber",
                "colorHex": "#D97706",
                "skuSuffix": "-AMB",
                "priceDelta": 0
            }
        ]
    },
    {
        "sku": "EK-612",
        "name": "The Lavington Winged Cat-Eye",
        "brand": "EyeKart Nairobi Atelier",
        "category_id": "eyeglasses",
        "collection_id": "cat_eye_atelier",
        "gender": "women",
        "shape": "cat-eye",
        "material": "Sculpted brow contour designed for comfortable cheekbone clearance",
        "base_price": 12900,
        "compare_at_price": 16000,
        "dimensions": "53 □ 17 - 140",
        "weight": "16.1g",
        "bridge": 17,
        "temple": 140,
        "lens_width": 53,
        "lens_height": 43,
        "pantoscopic_angle": "8.5°",
        "base_curve": "4.0",
        "frame_total_width": 138,
        "stock": 12,
        "source_conflict": null,
        "source_conflict_details": null,
        "gallery": "[\"https://lh3.googleusercontent.com/aida-public/AB6AXuCOCrR6e4vpjW2L90tmMvhM0INIQtTkela_BUbm_UcolrASIB-vhX5RxVCTxEYBA4WgCrlStkflxXZHC17brTP_S94yTvfJcShjdcYy7IKJ6MWQLAv7l0QEMW6Hj3ACZhJn8s_IMPiUQcwlmMQEuN4kezEPvUDjIaRCCy7L1oQgL9AyNuXA5NR682mgRT99ubOGWNvvbzDMSBEnhMa38bdmbFbQaDfCOF3xoaZPM8dbIL6WhQ3Q6Meavw\"]",
        "prescription_compatibility": "{\"sphMin\":-8,\"sphMax\":5,\"cylMax\":-3}",
        "asset_3d": "{\"modelUrl\":\"assets/models/ek612.glb\",\"hasCadBlueprint\":true}",
        "asset_vto": "{\"overlayUrl\":\"assets/vto/ek612_vto.png\",\"scaleFactor\":1}",
        "variants": [
            {
                "name": "Merlot Acetate",
                "colorHex": "#8E3B46",
                "skuSuffix": "-MRL",
                "priceDelta": 0
            },
            {
                "name": "Piano Black",
                "colorHex": "#18191B",
                "skuSuffix": "-BLK",
                "priceDelta": 0
            },
            {
                "name": "Rose Champagne",
                "colorHex": "#D4AF37",
                "skuSuffix": "-CHP",
                "priceDelta": 0
            },
            {
                "name": "Lavington Bronze",
                "colorHex": "#A0522D",
                "skuSuffix": "-BRZ",
                "priceDelta": 0
            }
        ]
    },
    {
        "sku": "EK-007",
        "name": "The Upper Hill Zero-Rim",
        "brand": "EyeKart Nairobi Atelier",
        "category_id": "eyeglasses",
        "collection_id": "pure_rimless",
        "gender": "men",
        "shape": "rimless",
        "material": "Screwless compression bushing system crafted from Japanese beta-titanium",
        "base_price": 18900,
        "compare_at_price": 22500,
        "dimensions": "52 □ 18 - 140",
        "weight": "9.4g",
        "bridge": 18,
        "temple": 140,
        "lens_width": 52,
        "lens_height": 38,
        "pantoscopic_angle": "8.5°",
        "base_curve": "4.0",
        "frame_total_width": 138,
        "stock": 5,
        "source_conflict": null,
        "source_conflict_details": null,
        "gallery": "[\"https://lh3.googleusercontent.com/aida-public/AB6AXuBoE6tqDlXeVN3NwAaZVjBbrK6z9F3x1beyLRBOqtRXQg8KCOi6j-LSIHShkkAt-yRs6rqthZqwuBU9Dp63pZSaS1AFjdgsNBxhXTGih82De-EnTw6VnXAGgStKIOuR1gsuoWS7jR9YXyWGaxIulpnunl80Fv1WWBzUF--5yLHTGNcsRH8AdqZq0Yl0KAvT0iwjEby__aPh4hA-2t6EDdAGfNDeO6G4QuflLIkm4l_N_xepAJisTKXjHw\"]",
        "prescription_compatibility": "{\"sphMin\":-6,\"sphMax\":4,\"cylMax\":-2,\"supportsHighIndex\":true}",
        "asset_3d": "{\"modelUrl\":\"assets/models/ek007.glb\",\"hasCadBlueprint\":true}",
        "asset_vto": "{\"overlayUrl\":\"assets/vto/ek007_vto.png\",\"scaleFactor\":0.96}",
        "variants": [
            {
                "name": "Satin Titanium",
                "colorHex": "#A8A9AD",
                "skuSuffix": "-SAT",
                "priceDelta": 0
            },
            {
                "name": "DLC Matte Black",
                "colorHex": "#1A1A1A",
                "skuSuffix": "-DLC",
                "priceDelta": 0
            },
            {
                "name": "Polished Platinum",
                "colorHex": "#D5D8DC",
                "skuSuffix": "-PLT",
                "priceDelta": 0
            }
        ]
    },
    {
        "sku": "EK-420",
        "name": "The Kilimani Heavy Square",
        "brand": "EyeKart Nairobi Atelier",
        "category_id": "eyeglasses",
        "collection_id": "bold_silhouette",
        "gender": "men",
        "shape": "square",
        "material": "8mm milled Mazzucchelli faceplate with beveled temple chamfers",
        "base_price": 13200,
        "compare_at_price": 15800,
        "dimensions": "53 □ 20 - 148",
        "weight": "24.5g",
        "bridge": 20,
        "temple": 148,
        "lens_width": 53,
        "lens_height": 44,
        "pantoscopic_angle": "8.5°",
        "base_curve": "4.0",
        "frame_total_width": 138,
        "stock": 15,
        "source_conflict": null,
        "source_conflict_details": null,
        "gallery": "[\"https://lh3.googleusercontent.com/aida-public/AB6AXuCDPWwa77Rc6v27IDcx5fO-H2kiVRUa6Nxpy_aGrh2VI2DIORTNziNNJRiNo7B17ZdQ1u2QdCwh72SZ3LVOsQuXsd-mx1lHKiSAOJYUF27nDI_PAWdpi0ieEuEBX1iDOJcNh1C_PQ_0PSDGjWpZRQXQXTGP0g-lIVbQdnQPsE8xiFHhtU7EwVsdrHjraKvzs1vISyWLevFORebtrnKbBjDq85ZJkXlbZ4FoYKM0E13iwW1YQc3DT9Davg\"]",
        "prescription_compatibility": "{\"sphMin\":-14,\"sphMax\":8,\"cylMax\":-5}",
        "asset_3d": "{\"modelUrl\":\"assets/models/ek420.glb\",\"hasCadBlueprint\":true}",
        "asset_vto": "{\"overlayUrl\":\"assets/vto/ek420_vto.png\",\"scaleFactor\":1.04}",
        "variants": [
            {
                "name": "Olive Green",
                "colorHex": "#2C3E2D",
                "skuSuffix": "-OLV",
                "priceDelta": 0
            },
            {
                "name": "Polished Jet",
                "colorHex": "#111111",
                "skuSuffix": "-JET",
                "priceDelta": 0
            },
            {
                "name": "Cigar Havana",
                "colorHex": "#4A2E1B",
                "skuSuffix": "-HAV",
                "priceDelta": 0
            }
        ]
    },
    {
        "sku": "EK-204",
        "name": "The Silicon TR90 Flex",
        "brand": "EyeKart Nairobi Atelier",
        "category_id": "screen",
        "collection_id": "nairobi_tech",
        "gender": "unisex",
        "shape": "rectangle",
        "material": "Flexible memory polymer with integrated silicone temple grip sleeves",
        "base_price": 7500,
        "compare_at_price": 9000,
        "dimensions": "51 □ 17 - 142",
        "weight": "12.5g",
        "bridge": 17,
        "temple": 142,
        "lens_width": 51,
        "lens_height": 38,
        "pantoscopic_angle": "8.5°",
        "base_curve": "4.0",
        "frame_total_width": 138,
        "stock": 30,
        "source_conflict": null,
        "source_conflict_details": null,
        "gallery": "[\"https://lh3.googleusercontent.com/aida-public/AB6AXuDtO29rxtvj_nQvvRheicN0lw2n3GDhqGr0O0abmygEmMjEmfOKiPARjcTsX4u4TsuUAVVPluul6v9x98eYJwTp4g38GRa1uBYzRxb86pwEU5Q7UWdNHcl4JmjHlS3He9vG1IyU4Z2yh6-xMAV4HNCE1CfEPvwtLtH3LZjzlsjJh2I9UeFsx24Ih4Z2052ODM0jhN01y88W-Xi1WUQgKTGBbb4D3EwjjHoQ1AfoS2HoHjtN4Kc040JIiQ\"]",
        "prescription_compatibility": "{\"sphMin\":-6,\"sphMax\":4,\"cylMax\":-2}",
        "asset_3d": "{\"modelUrl\":\"assets/models/ek204.glb\",\"hasCadBlueprint\":true}",
        "asset_vto": "{\"overlayUrl\":\"assets/vto/ek204_vto.png\",\"scaleFactor\":1}",
        "variants": [
            {
                "name": "Matte Smoke",
                "colorHex": "#4F5B66",
                "skuSuffix": "-SMK",
                "priceDelta": 0
            },
            {
                "name": "Midnight Navy",
                "colorHex": "#101720",
                "skuSuffix": "-NVY",
                "priceDelta": 0
            }
        ]
    },
    {
        "sku": "EK-714",
        "name": "The Parklands Supra Wire",
        "brand": "EyeKart Nairobi Atelier",
        "category_id": "eyeglasses",
        "collection_id": "semi_rimless",
        "gender": "unisex",
        "shape": "semi-rimless",
        "material": "High-tensile nylon cord suspension with titanium top chassis",
        "base_price": 14200,
        "compare_at_price": 16800,
        "dimensions": "53 □ 18 - 142",
        "weight": "15.0g",
        "bridge": 18,
        "temple": 142,
        "lens_width": 53,
        "lens_height": 41,
        "pantoscopic_angle": "8.5°",
        "base_curve": "4.0",
        "frame_total_width": 138,
        "stock": 9,
        "source_conflict": null,
        "source_conflict_details": null,
        "gallery": "[\"https://lh3.googleusercontent.com/aida-public/AB6AXuAIMMsFsxMyab0qihyQRW9YRZQ9O9zN5kZDSnTsBhBK4XKiidSILL1_pn4E-TMUK9MsceHu6sjYvaquWXVTh9-0USeKqjQB5l7qJkKxC--1Z5RYe1KUTUBYkrOZBAuIV-dHy3ClVa6M7Mo6byzCkidtXxPBl3RGYFkddidnJ3UHUw0HgAPvaFTLzvpRArTHhisZ1SminxpdT_llK7FGl6Yn_73Rgg3nzpfYa19JijSxkINIC_c4elQoLw\"]",
        "prescription_compatibility": "{\"sphMin\":-8,\"sphMax\":5,\"cylMax\":-3}",
        "asset_3d": "{\"modelUrl\":\"assets/models/ek714.glb\",\"hasCadBlueprint\":true}",
        "asset_vto": "{\"overlayUrl\":\"assets/vto/ek714_vto.png\",\"scaleFactor\":1}",
        "variants": [
            {
                "name": "Deep Gunmetal",
                "colorHex": "#43464B",
                "skuSuffix": "-GUN",
                "priceDelta": 0
            },
            {
                "name": "Titanium Khaki",
                "colorHex": "#A89F91",
                "skuSuffix": "-KHK",
                "priceDelta": 0
            }
        ]
    },
    {
        "sku": "EK-522",
        "name": "The Naivasha Polarized Sun-Rx",
        "brand": "EyeKart Nairobi Atelier",
        "category_id": "sunglasses",
        "collection_id": "equatorial_sun_rx",
        "gender": "unisex",
        "shape": "aviator",
        "material": "Dual-curved base 4 optics with rear anti-reflective multi-coating",
        "base_price": 16800,
        "compare_at_price": 19500,
        "dimensions": "54 □ 19 - 145",
        "weight": "18.2g",
        "bridge": 19,
        "temple": 145,
        "lens_width": 54,
        "lens_height": 46,
        "pantoscopic_angle": "8.5°",
        "base_curve": "4.0",
        "frame_total_width": 138,
        "stock": 14,
        "source_conflict": null,
        "source_conflict_details": null,
        "gallery": "[\"https://lh3.googleusercontent.com/aida-public/AB6AXuDX1XqO8_voZwDID86-7nFIw5Yc2gwVd9l5pQoekaKtYOuzIsTsKwAwLfX4p7XmQxj4BVCB1FEZhgL1IVNb_EIiFdRl6Q6e1c76pFWjatfOweY48F3cLZRTaUEWnHbPhqPBb_IdblhsaloEEfb1flWC2aWVgIY5kqmkoSNBYSwPnSjjZeg7T0Sm0j36clzTJgQ-tEznG1GvME0JDi8f3oxqmehVV-k6wY_zEpw2RE-8lQn--dw5lB0B7w\"]",
        "prescription_compatibility": "{\"sphMin\":-6,\"sphMax\":4,\"cylMax\":-2.5}",
        "asset_3d": "{\"modelUrl\":\"assets/models/ek522.glb\",\"hasCadBlueprint\":true}",
        "asset_vto": "{\"overlayUrl\":\"assets/vto/ek522_vto.png\",\"scaleFactor\":1}",
        "variants": [
            {
                "name": "Polarized Amber",
                "colorHex": "#3B2F2F",
                "skuSuffix": "-AMB",
                "priceDelta": 0
            },
            {
                "name": "Neutral G-15 Green",
                "colorHex": "#111111",
                "skuSuffix": "-GRN",
                "priceDelta": 0
            }
        ]
    },
    {
        "sku": "EK-001",
        "name": "The Grand Rift Artisan Horn",
        "brand": "EyeKart Nairobi Atelier",
        "category_id": "eyeglasses",
        "collection_id": "bespoke_horn",
        "gender": "unisex",
        "shape": "round",
        "material": "Hand-carved organic horn with 24K gold electroplated precision joints",
        "base_price": 36500,
        "compare_at_price": 42000,
        "dimensions": "52 □ 20 - 145",
        "weight": "22.4g",
        "bridge": 20,
        "temple": 145,
        "lens_width": 52,
        "lens_height": 45,
        "pantoscopic_angle": "8.5°",
        "base_curve": "4.0",
        "frame_total_width": 138,
        "stock": 4,
        "source_conflict": null,
        "source_conflict_details": null,
        "gallery": "[\"https://lh3.googleusercontent.com/aida-public/AB6AXuD2bNV8Py6CdG-28KY9TyjteO5zkkeYXFJTocGA6fY_OMLt4PAz1cKnZfGSbuMagOPDfvWhLqUvewp0Bv5vP3SSrRUzgSH2v6pUFgnrv67CALDoMAn9L3tzhoKOsQeaIOsiDJnjp70kjm6eb3ZpE_NVoWjQIb9E6dK2p8LpW3x3fGhGJotNS2xoRXTSXyb8Zatt_e1X1H29FtYeJ-vuvC0hwgrUjvIu8h-XYiFrN0xweJcxUiqFrcQQnQ\"]",
        "prescription_compatibility": "{\"sphMin\":-10,\"sphMax\":6,\"cylMax\":-3.5}",
        "asset_3d": "{\"modelUrl\":\"assets/models/ek001.glb\",\"hasCadBlueprint\":true}",
        "asset_vto": "{\"overlayUrl\":\"assets/vto/ek001_vto.png\",\"scaleFactor\":1}",
        "variants": [
            {
                "name": "Natural Striated Horn",
                "colorHex": "#654321",
                "skuSuffix": "-HRN",
                "priceDelta": 0
            },
            {
                "name": "Blonde Horn",
                "colorHex": "#D2B48C",
                "skuSuffix": "-BLN",
                "priceDelta": 0
            }
        ]
    }
];

  for (const p of products) {
    await query(
      `INSERT INTO products (
        sku, name, brand, category_id, collection_id, gender, shape, material,
        base_price, compare_at_price, dimensions, weight, bridge, temple, lens_width, lens_height,
        pantoscopic_angle, base_curve, frame_total_width, stock, source_conflict, source_conflict_details,
        gallery, prescription_compatibility, asset_3d, asset_vto, is_active
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26, TRUE)
      ON CONFLICT (sku) DO UPDATE SET
        name = EXCLUDED.name,
        brand = EXCLUDED.brand,
        category_id = EXCLUDED.category_id,
        collection_id = EXCLUDED.collection_id,
        gender = EXCLUDED.gender,
        shape = EXCLUDED.shape,
        material = EXCLUDED.material,
        base_price = EXCLUDED.base_price,
        compare_at_price = EXCLUDED.compare_at_price,
        dimensions = EXCLUDED.dimensions,
        weight = EXCLUDED.weight,
        bridge = EXCLUDED.bridge,
        temple = EXCLUDED.temple,
        lens_width = EXCLUDED.lens_width,
        lens_height = EXCLUDED.lens_height,
        pantoscopic_angle = EXCLUDED.pantoscopic_angle,
        base_curve = EXCLUDED.base_curve,
        frame_total_width = EXCLUDED.frame_total_width,
        stock = EXCLUDED.stock,
        source_conflict = EXCLUDED.source_conflict,
        source_conflict_details = EXCLUDED.source_conflict_details,
        gallery = EXCLUDED.gallery,
        prescription_compatibility = EXCLUDED.prescription_compatibility,
        asset_3d = EXCLUDED.asset_3d,
        asset_vto = EXCLUDED.asset_vto,
        is_active = TRUE,
        updated_at = CURRENT_TIMESTAMP`,
      [
        p.sku, p.name, p.brand, p.category_id, p.collection_id, p.gender, p.shape, p.material,
        p.base_price, p.compare_at_price, p.dimensions, p.weight, p.bridge, p.temple, p.lens_width, p.lens_height,
        p.pantoscopic_angle, p.base_curve, p.frame_total_width, p.stock, p.source_conflict, p.source_conflict_details,
        p.gallery, p.prescription_compatibility, p.asset_3d, p.asset_vto
      ]
    );

    // Variants
    for (const v of p.variants) {
      await query(
        `INSERT INTO product_variants (sku, name, color_hex, sku_suffix, price_delta, is_active)
         VALUES ($1, $2, $3, $4, $5, TRUE)
         ON CONFLICT (sku, sku_suffix) DO UPDATE SET
           name = EXCLUDED.name,
           color_hex = EXCLUDED.color_hex,
           price_delta = EXCLUDED.price_delta,
           is_active = TRUE`,
        [p.sku, v.name, v.colorHex, v.skuSuffix, v.priceDelta]
      );
    }
  }

  // 5. Clearly Marked DEV/TEST User Accounts
  const devUsers = [
    {
      email: 'dev-admin@eyekart.test',
      phone: '+254700000001',
      fullName: 'Development Admin (TEST ONLY)',
      password: 'EyeKartDevAdmin2026!',
      role: 'ADMIN'
    },
    {
      email: 'dev-optom@eyekart.test',
      phone: '+254700000002',
      fullName: 'Development Optometrist (TEST ONLY)',
      password: 'EyeKartDevOptom2026!',
      role: 'OPTOMETRIST'
    },
    {
      email: 'dev-staff@eyekart.test',
      phone: '+254700000003',
      fullName: 'Development Staff (TEST ONLY)',
      password: 'EyeKartDevStaff2026!',
      role: 'STAFF'
    },
    {
      email: 'dev-storestaff@eyekart.test',
      phone: '+254700000005',
      fullName: 'Development Store Staff (TEST ONLY)',
      password: 'EyeKartDevStaff2026!',
      role: 'STORE_STAFF'
    },
    {
      email: 'dev-labtech@eyekart.test',
      phone: '+254700000006',
      fullName: 'Development Lab Technician (TEST ONLY)',
      password: 'EyeKartDevLab2026!',
      role: 'LAB_TECH'
    },
    {
      email: 'dev-customer@eyekart.test',
      phone: '+254700000004',
      fullName: 'Development Customer (TEST ONLY)',
      password: 'EyeKartDevCustomer2026!',
      role: 'CUSTOMER'
    }
  ];

  for (const u of devUsers) {
    const pHash = await hashPassword(u.password);
    await query(
      `INSERT INTO users (email, phone, full_name, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET
         phone = EXCLUDED.phone,
         full_name = EXCLUDED.full_name,
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role`,
      [u.email, u.phone, u.fullName, pHash, u.role]
    );
  }

  // 6. Clinics (Phase 6.4)
  const clinics = [
    {
      id: 'westlands',
      name: 'Westlands Square Flagship & Central Lab',
      leadClinician: 'Dr. Farida Maina, OD (TEST ONLY)',
      address: '2nd Floor, Ring Rd Parklands, Westlands, Nairobi',
      phone: '+254 700 393 527',
      timezone: 'Africa/Nairobi'
    },
    {
      id: 'sarit_centre',
      name: 'Sarit Centre Atelier',
      leadClinician: 'Dr. Kevin Omondi, MCOptom (TEST ONLY)',
      address: 'Ground Floor, New Wing, Karuna Rd, Westlands, Nairobi',
      phone: '+254 700 393 528',
      timezone: 'Africa/Nairobi'
    },
    {
      id: 'junction_mall',
      name: 'The Junction Mall Atelier',
      leadClinician: 'Dr. Amina Patel, OD (TEST ONLY)',
      address: '1st Floor, Ngong Road, Nairobi',
      phone: '+254 700 393 529',
      timezone: 'Africa/Nairobi'
    },
    {
      id: 'village_market',
      name: 'Village Market Suite',
      leadClinician: 'Dr. David Kiprop, OD (TEST ONLY)',
      address: 'Courtyard Level, Limuru Road, Gigiri, Nairobi',
      phone: '+254 700 393 530',
      timezone: 'Africa/Nairobi'
    }
  ];

  for (const cl of clinics) {
    await query(
      `INSERT INTO clinics (id, name, lead_clinician, address, phone, timezone)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         lead_clinician = EXCLUDED.lead_clinician,
         address = EXCLUDED.address,
         phone = EXCLUDED.phone,
         timezone = EXCLUDED.timezone`,
      [cl.id, cl.name, cl.leadClinician, cl.address, cl.phone, cl.timezone]
    );
  }

  // 7. Appointment Types (Phase 6.4)
  const aptTypes = [
    {
      id: 'signature_28_point',
      name: 'Signature 28-Point Comprehensive Exam',
      duration: 45,
      price: 3500.00,
      rebate: 100.00,
      description: 'Full clinical ophthalmic evaluation covering dual wavefront refraction, tonometry, fundus photography, and 3D vertex sizing.'
    },
    {
      id: 'pediatric_myopia',
      name: 'Pediatric Myopia & Visual Acuity Assessment',
      duration: 30,
      price: 2500.00,
      rebate: 100.00,
      description: 'Specialized pediatric visual testing, tumbling-E optotypes, and myopia progression modeling.'
    },
    {
      id: 'contact_lens_corneal',
      name: 'Contact Lens Specialty & Corneal Fitting',
      duration: 45,
      price: 4500.00,
      rebate: 100.00,
      description: 'Corneal topography, keratometric curvature calibration, and custom trial lens fitting.'
    },
    {
      id: 'rapid_refraction',
      name: 'Express Digital Refractive Check',
      duration: 20,
      price: 1500.00,
      rebate: 100.00,
      description: 'Rapid 20-minute autorefractor diopter verification for frame updates.'
    }
  ];

  for (const at of aptTypes) {
    await query(
      `INSERT INTO appointment_types (id, name, duration_minutes, price, rebate_percentage, description)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         duration_minutes = EXCLUDED.duration_minutes,
         price = EXCLUDED.price,
         rebate_percentage = EXCLUDED.rebate_percentage,
         description = EXCLUDED.description`,
      [at.id, at.name, at.duration, at.price, at.rebate, at.description]
    );
  }

  // 8. Seed Appointment Slots (Upcoming Days in EAT / Africa/Nairobi)
  const now = new Date();
  for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
    const slotDate = new Date(now.getTime() + dayOffset * 86400000);
    const dateStr = slotDate.toISOString().split('T')[0];
    
    const slotHoursEAT = [
      { h: 9, m: 0 },
      { h: 9, m: 45 },
      { h: 10, m: 30 },
      { h: 11, m: 15 },
      { h: 14, m: 0 },
      { h: 14, m: 45 },
      { h: 15, m: 30 },
      { h: 16, m: 15 },
      { h: 18, m: 0 }
    ];

    for (const cl of clinics) {
      for (const t of slotHoursEAT) {
        const utcHour = t.h - 3;
        const startTimeISO = `${dateStr}T${String(utcHour).padStart(2, '0')}:${String(t.m).padStart(2, '0')}:00.000Z`;
        const endTimeDate = new Date(new Date(startTimeISO).getTime() + 45 * 60000);
        const endTimeISO = endTimeDate.toISOString();

        await query(
          `INSERT INTO appointment_slots (clinic_id, practitioner_name, start_time, end_time, timezone, is_available)
           VALUES ($1, $2, $3, $4, 'Africa/Nairobi', TRUE)
           ON CONFLICT (clinic_id, start_time) DO NOTHING`,
          [cl.id, cl.leadClinician, startTimeISO, endTimeISO]
        );
      }
    }
  }

  console.info('[EyeKart Seed] Phase 6.8 Database seeding completed successfully.');
  return { 
    success: true, 
    seededProducts: products.length, 
    seededUsers: devUsers.length,
    seededClinics: clinics.length,
    seededAppointmentTypes: aptTypes.length
  };
}

if (require.main === module) {
  seed()
    .then((result) => {
      console.info('[EyeKart Seed CLI] Finished successfully:', result);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[EyeKart Seed CLI] Execution error:', err);
      process.exit(1);
    });
}

module.exports = { seed };
