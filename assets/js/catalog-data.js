/**
 * EyeKart Centralized Catalog Repository
 * Master source of truth for all optical frames.
 * Schema conforms strictly to Protocol v1.1, Section 9.
 * Certified against verified Stitch catalog text and badges (Amendment 1).
 */
(function (global) {
  'use strict';

  const EyeKartCatalog = [
    {
      sku: "EK-902",
      name: "Kibera Minimalist Titanium",
      brand: "EyeKart Nairobi Atelier",
      category: "eyeglasses",
      gender: "unisex",
      shape: "round",
      material: "Japanese Beta-Titanium",
      color: "Obsidian Black",
      finish: "Matte Anodized",
      price: 18500,
      compareAtPrice: null, // UNVERIFIED / BUSINESS INPUT REQUIRED (No KSh 21,200 in Stitch source)
      sourceConflict: "EK-902 SOURCE CONFLICT — BUSINESS CONFIRMATION REQUIRED",
      sourceConflictDetails: "3D Studio displays KSh 14,800 (compare-at KSh 17,500, 51x19x145mm, 12.8g, Hexagonal). Checkout Ledger & Homepage Hero display KSh 18,500 (52x18x140mm, 12g). Pre-Auth Insurance Modal displays KSh 11,400 copay/tariff.",
      dimensions: "50 □ 19 - 140",
      weight: "14.2g",
      bridge: 19,
      temple: 140,
      lensWidth: 50,
      lensHeight: 44,
      pantoscopicAngle: "8.5°",
      baseCurve: "4.0",
      frameTotalWidth: 136,
      recommendedFaceShapes: ["oval", "round", "heart"],
      lensCompatibility: ["single_vision", "progressive", "office", "polarized"],
      stock: 14,
      variants: [
        { name: "Brushed Champagne Titanium", colorHex: "#E5D7B7", price: 18500, skuSuffix: "-GLD" },
        { name: "Matte Obsidian Black", colorHex: "#202224", price: 18500, skuSuffix: "-OBS" },
        { name: "Raw Brushed Platinum", colorHex: "#D1D5DB", price: 18500, skuSuffix: "-PLT" },
        { name: "Havana Tortoise & Rose Titanium", colorHex: "#6B3E11", price: 18500, skuSuffix: "-TOR" }
      ],
      gallery: [
        "https://lh3.googleusercontent.com/aida-public/AB6AXuBKQv_VnLuN8ds7xO3zgoSxc0DRFCJbfyaP_3BAYw_00SEWiB3Q_5TDyc0SW-uSuW8A1McFkE6u6wAyZ36yJ3KYBIaEo3fhghOFtSuKhqQjVYCRu4YQg3KlRXs4ZwFcFsTA4LWWJucRzbzAR1y7iNyPeejKz5L-iO4zNyLSMrgbnW_gTA7dWVgP6G4O3sqCMB16_opTwdRLhvzw3urr-e0ykitbgWDQ6YA1dV34BbvuJvRVYVLl6WYZyw"
      ],
      asset3D: {
        modelUrl: "assets/models/ek902.glb",
        hasCadBlueprint: true,
        defaultFov: 45
      },
      assetVTO: {
        overlayUrl: "assets/vto/ek902_vto.png",
        scaleFactor: 1.0,
        bridgeOffset: [0, 1.2, 0]
      },
      prescriptionCompatibility: {
        sphMin: -10.00,
        sphMax: 6.00,
        cylMax: -4.00,
        supportsHighIndex: true
      },
      collection: "The Nairobi Precision Series",
      status: "ACTIVE_DEMO",
      seoMetadata: {
        title: "EK-902 Kibera Minimalist Titanium | EyeKart Nairobi",
        description: "Ultra-light Japanese titanium round spectacle frame handcrafted for Nairobi."
      }
    },
    {
      sku: "EK-804",
      name: "The Westlands Octagonal",
      brand: "EyeKart Nairobi Atelier",
      category: "eyeglasses",
      gender: "unisex",
      shape: "octagonal",
      material: "Hand-milled Japanese titanium with laser-cut bridge filigree",
      color: "Champagne Gold",
      finish: "Electrolytic Satin",
      price: 13800,
      compareAtPrice: 17500,
      dimensions: "51 □ 19 - 145",
      weight: "14.2g",
      bridge: 19,
      temple: 145,
      lensWidth: 51,
      lensHeight: 46,
      lensCompatibility: ["single_vision", "progressive", "office", "polarized"],
      stock: 8,
      variants: [
        { name: "Champagne Gold", colorHex: "#E5C158", price: 13800, skuSuffix: "-GLD" },
        { name: "Matte Platinum", colorHex: "#D5D8DC", price: 13800, skuSuffix: "-PLT" }
      ],
      gallery: [
        "https://lh3.googleusercontent.com/aida-public/AB6AXuDAiAxgQStqP2fpBMr1KV0eNYXhnrJzO0BxktJHz8RDGKJSrtvFRjxTTR6DHYoryotAM43W2Zfp4SrRi2hfACWnGiKyFdAI-mAk80Mb_L7tox9xVA_GmIHG4kNi_UGBGVeyDYisE7Vra2dukE3cWSEIXzlXn1MaRpaOHHDO4fKfRdo7l6cBeIdjbwh9JjcApDCP9BIx8vgedH9YlWWW_t3o59ryRrMbQGKXszp2VPRi1p_zZWSlmb5fsw"
      ],
      asset3D: {
        modelUrl: "assets/models/ek804.glb",
        hasCadBlueprint: true,
        defaultFov: 45
      },
      assetVTO: {
        overlayUrl: "assets/vto/ek804_vto.png",
        scaleFactor: 1.02,
        bridgeOffset: [0, 1.1, 0]
      },
      prescriptionCompatibility: {
        sphMin: -8.00,
        sphMax: 5.00,
        cylMax: -3.50,
        supportsHighIndex: true
      },
      collection: "The Nairobi Precision Series",
      status: "ACTIVE_DEMO",
      seoMetadata: {
        title: "EK-804 The Westlands Octagonal | EyeKart Nairobi",
        description: "Architectural octagonal silhouette crafted in featherweight Japanese titanium."
      }
    },
    {
      sku: "EK-102",
      name: "The Karen Round Acetate",
      brand: "EyeKart Nairobi Atelier",
      category: "eyeglasses",
      gender: "women",
      shape: "round",
      material: "Mazzucchelli Havana amber with triple-barrel optical hinges",
      color: "Havana Tortoiseshell",
      finish: "Hand-Polished Gloss",
      price: 11200,
      compareAtPrice: 13960,
      dimensions: "49 □ 20 - 140",
      weight: "19.8g",
      bridge: 20,
      temple: 140,
      lensWidth: 49,
      lensHeight: 45,
      lensCompatibility: ["single_vision", "progressive", "office", "polarized"],
      stock: 19,
      variants: [
        { name: "Havana Amber", colorHex: "#6E3900", price: 11200, skuSuffix: "-TOR" },
        { name: "Polished Onyx", colorHex: "#0B1C30", price: 11200, skuSuffix: "-ONX" }
      ],
      gallery: [
        "https://lh3.googleusercontent.com/aida-public/AB6AXuDyC-v6VxnC0NXIdlMdvyrFGSUlq-Q1-Sx96zmcvL6dSqM2l3lbeirEoKr3_Lb1lgRfgzZfQ2vA4-Y_27yyVOw0flONl6lfTm6fEYR2zPOD8-_8VJFOboYefIhbEcFeCOdyBa9kv6GwTTVXCpp65x2LFOzO-IZxcRxch6tkjJrv6gDT2HoTWkosgSzO0914jIPxOnBXAvOjAddggnGHhO-OlMKq_QXZk8UxNHWJAlWIaZVI5uNKOOQRiA"
      ],
      asset3D: {
        modelUrl: "assets/models/ek102.glb",
        hasCadBlueprint: true,
        defaultFov: 45
      },
      assetVTO: {
        overlayUrl: "assets/vto/ek102_vto.png",
        scaleFactor: 0.98,
        bridgeOffset: [0, 1.0, 0]
      },
      prescriptionCompatibility: {
        sphMin: -12.00,
        sphMax: 8.00,
        cylMax: -5.00,
        supportsHighIndex: true
      },
      collection: "Equatorial Edition",
      status: "ACTIVE_DEMO",
      seoMetadata: {
        title: "EK-102 The Karen Round Acetate | EyeKart Nairobi",
        description: "Italian Mazzucchelli bio-acetate frame with hand-pinned five-barrel hinges."
      }
    },
    {
      sku: "EK-915",
      name: "The Safari Aviator Wire",
      brand: "EyeKart Nairobi Atelier",
      category: "sunglasses",
      gender: "men",
      shape: "aviator",
      material: "Laser-welded beta titanium brow bar for low bridge stability",
      color: "Savannah Gold",
      finish: "Triple-Layer Gold Plated",
      price: 15200,
      compareAtPrice: 19000,
      dimensions: "54 □ 17 - 145",
      weight: "11.9g",
      bridge: 17,
      temple: 145,
      lensWidth: 54,
      lensHeight: 48,
      lensCompatibility: ["single_vision", "progressive", "polarized"],
      stock: 11,
      variants: [
        { name: "Savannah Gold", colorHex: "#D4AF37", price: 15200, skuSuffix: "-GLD" },
        { name: "Gunmetal Shadow", colorHex: "#4A4D52", price: 15200, skuSuffix: "-GUN" }
      ],
      gallery: [
        "https://lh3.googleusercontent.com/aida-public/AB6AXuCPpciKRtSKwCuJlr9xYFHz7K-nIepSb6hRIDV2iOEWML4o3YXHr8UOBASbOljE6s7GvpnnM2dGglS5r3ZgkQGWLMb4s5umi9ihiu4SDGuwe9Oqiu2ML3bTjrFCp7T6C9_h9sJQzsw14myOKb71CMfBHb13lpq_ORIFZ0962slMHqKZu21q0MlI0Ry4SVJnMo73l6CgZuq9Q4evwP3XKxXhRKburtGGArE_hLHQZhy4EwDGzoUqo1mwfg"
      ],
      asset3D: {
        modelUrl: "assets/models/ek915.glb",
        hasCadBlueprint: true,
        defaultFov: 45
      },
      assetVTO: {
        overlayUrl: "assets/vto/ek915_vto.png",
        scaleFactor: 1.05,
        bridgeOffset: [0, 1.3, 0]
      },
      prescriptionCompatibility: {
        sphMin: -6.00,
        sphMax: 4.00,
        cylMax: -2.50,
        supportsHighIndex: true
      },
      collection: "Savannah Air",
      status: "ACTIVE_DEMO",
      seoMetadata: {
        title: "EK-915 The Safari Aviator Wire | EyeKart Nairobi",
        description: "Equatorial teardrop silhouette engineered for East African solar protection."
      }
    },
    {
      sku: "EK-505",
      name: "The Gigiri Browline Hybrid",
      brand: "EyeKart Nairobi Atelier",
      category: "eyeglasses",
      gender: "unisex",
      shape: "browline",
      material: "Heavy architectural top frame with titanium cable temple tips",
      color: "Rose Titanium & Dark Espresso",
      finish: "Brushed Duo-Tone",
      price: 14500,
      compareAtPrice: 17200,
      dimensions: "52 □ 18 - 145",
      weight: "21.0g",
      bridge: 18,
      temple: 145,
      lensWidth: 52,
      lensHeight: 42,
      lensCompatibility: ["single_vision", "progressive", "office"],
      stock: 6,
      variants: [
        { name: "Rose Titanium", colorHex: "#B76E79", price: 14500, skuSuffix: "-RSE" },
        { name: "Graphite Silver", colorHex: "#2A2E35", price: 14500, skuSuffix: "-SLV" }
      ],
      gallery: [
        "https://lh3.googleusercontent.com/aida-public/AB6AXuB-fX2muVk1-2as94SW4TZ46Bu2v58NgacAB2MSskVoRZhNXzi2IHbrjFvTtbJyPjSZq02BoMLQun5Ke-M0GqaiUGT5PWW9wdO-aNiRKzxKdoDHQZs0Y9Qj8VHjtmOzVNRqCOWyIREkkyCYxyEuqU1o8WsbOTdXGWSY7XZrdhcQdlI08t70_ko3jgKOQNEZjvcE-PZzTDBqJnQIPvRIRrUwFzhk1ufaEC0OHysTN__CvxnoVsSOVjo0Pg"
      ],
      asset3D: { modelUrl: "assets/models/ek505.glb", hasCadBlueprint: true },
      assetVTO: { overlayUrl: "assets/vto/ek505_vto.png", scaleFactor: 1.0 },
      prescriptionCompatibility: { sphMin: -9.00, sphMax: 6.00, cylMax: -3.50 },
      collection: "Executive Club",
      status: "ACTIVE_DEMO",
      seoMetadata: { title: "EK-505 The Gigiri Browline Hybrid | EyeKart Nairobi" }
    },
    {
      sku: "EK-308",
      name: "The Muthaiga Lucent Poly",
      brand: "EyeKart Nairobi Atelier",
      category: "eyeglasses",
      gender: "unisex",
      shape: "square",
      material: "High-clarity bio-derived acetate with interior wire core engraving",
      color: "Crystal Lucent",
      finish: "Frosted Matte",
      price: 9800,
      compareAtPrice: 12000,
      dimensions: "50 □ 19 - 142",
      weight: "17.6g",
      bridge: 19,
      temple: 142,
      lensWidth: 50,
      lensHeight: 40,
      lensCompatibility: ["single_vision", "progressive", "office", "polarized"],
      stock: 22,
      variants: [
        { name: "Crystal Lucent", colorHex: "#F4F3F0", price: 9800, skuSuffix: "-CLR" },
        { name: "Smoked Amber", colorHex: "#D97706", price: 9800, skuSuffix: "-AMB" }
      ],
      gallery: [
        "https://lh3.googleusercontent.com/aida-public/AB6AXuAuFb_bKqK8EsG_JW7ds-LqeLchHTxDDpiMCAuOI7Su5zAJuL8K10LxD1wnGPFf3HZn1jYmwbRBPVcascO5pt13fcZ6Mwp4uZuPsOZ9SRKd5dsRvudAYmJzDWCqWlWF8gvJ0qyyaVi1RWG10BLgAVG1kRKYNrYt4B7qxxIfQWQRRnZlTpI_WMzG6Ros3ioJkB326o10Wu0KMIFWh_PPLfeAyu76C77lGUdPiAS9ZZ_4445NL0oo4D5Zig"
      ],
      asset3D: { modelUrl: "assets/models/ek308.glb", hasCadBlueprint: true },
      assetVTO: { overlayUrl: "assets/vto/ek308_vto.png", scaleFactor: 1.0 },
      prescriptionCompatibility: { sphMin: -10.00, sphMax: 6.00, cylMax: -4.00 },
      collection: "Crystal Series",
      status: "ACTIVE_DEMO",
      seoMetadata: { title: "EK-308 Muthaiga Lucent Poly | EyeKart Nairobi" }
    },
    {
      sku: "EK-612",
      name: "The Lavington Winged Cat-Eye",
      brand: "EyeKart Nairobi Atelier",
      category: "eyeglasses",
      gender: "women",
      shape: "cat-eye",
      material: "Sculpted brow contour designed for comfortable cheekbone clearance",
      color: "Lavington Bronze & Tortoise",
      finish: "Hand-Polished Gloss",
      price: 12900,
      compareAtPrice: 16000,
      dimensions: "53 □ 17 - 140",
      weight: "16.1g",
      bridge: 17,
      temple: 140,
      lensWidth: 53,
      lensHeight: 43,
      lensCompatibility: ["single_vision", "progressive", "office"],
      stock: 12,
      variants: [
        { name: "Merlot Acetate", colorHex: "#8E3B46", price: 12900, skuSuffix: "-MRL" },
        { name: "Piano Black", colorHex: "#18191B", price: 12900, skuSuffix: "-BLK" },
        { name: "Rose Champagne", colorHex: "#D4AF37", price: 12900, skuSuffix: "-CHP" },
        { name: "Lavington Bronze", colorHex: "#A0522D", price: 12900, skuSuffix: "-BRZ" }
      ],
      gallery: [
        "https://lh3.googleusercontent.com/aida-public/AB6AXuCOCrR6e4vpjW2L90tmMvhM0INIQtTkela_BUbm_UcolrASIB-vhX5RxVCTxEYBA4WgCrlStkflxXZHC17brTP_S94yTvfJcShjdcYy7IKJ6MWQLAv7l0QEMW6Hj3ACZhJn8s_IMPiUQcwlmMQEuN4kezEPvUDjIaRCCy7L1oQgL9AyNuXA5NR682mgRT99ubOGWNvvbzDMSBEnhMa38bdmbFbQaDfCOF3xoaZPM8dbIL6WhQ3Q6Meavw"
      ],
      asset3D: { modelUrl: "assets/models/ek612.glb", hasCadBlueprint: true },
      assetVTO: { overlayUrl: "assets/vto/ek612_vto.png", scaleFactor: 1.0 },
      prescriptionCompatibility: { sphMin: -8.00, sphMax: 5.00, cylMax: -3.00 },
      collection: "Cat-Eye Atelier",
      status: "ACTIVE_DEMO",
      seoMetadata: { title: "EK-612 The Lavington Winged Cat-Eye | EyeKart Nairobi" }
    },
    {
      sku: "EK-007",
      name: "The Upper Hill Zero-Rim",
      brand: "EyeKart Nairobi Atelier",
      category: "eyeglasses",
      gender: "men",
      shape: "rimless",
      material: "Screwless compression bushing system crafted from Japanese beta-titanium",
      color: "Polished Platinum & Satin Titanium",
      finish: "Sub-Nanometer Polishing",
      price: 18900,
      compareAtPrice: 22500,
      dimensions: "52 □ 18 - 140",
      weight: "9.4g",
      bridge: 18,
      temple: 140,
      lensWidth: 52,
      lensHeight: 38,
      lensCompatibility: ["single_vision", "progressive", "office"],
      stock: 5,
      variants: [
        { name: "Satin Titanium", colorHex: "#A8A9AD", price: 18900, skuSuffix: "-SAT" },
        { name: "DLC Matte Black", colorHex: "#1A1A1A", price: 18900, skuSuffix: "-DLC" },
        { name: "Polished Platinum", colorHex: "#D5D8DC", price: 18900, skuSuffix: "-PLT" }
      ],
      gallery: [
        "https://lh3.googleusercontent.com/aida-public/AB6AXuBoE6tqDlXeVN3NwAaZVjBbrK6z9F3x1beyLRBOqtRXQg8KCOi6j-LSIHShkkAt-yRs6rqthZqwuBU9Dp63pZSaS1AFjdgsNBxhXTGih82De-EnTw6VnXAGgStKIOuR1gsuoWS7jR9YXyWGaxIulpnunl80Fv1WWBzUF--5yLHTGNcsRH8AdqZq0Yl0KAvT0iwjEby__aPh4hA-2t6EDdAGfNDeO6G4QuflLIkm4l_N_xepAJisTKXjHw"
      ],
      asset3D: { modelUrl: "assets/models/ek007.glb", hasCadBlueprint: true },
      assetVTO: { overlayUrl: "assets/vto/ek007_vto.png", scaleFactor: 0.96 },
      prescriptionCompatibility: { sphMin: -6.00, sphMax: 4.00, cylMax: -2.00, supportsHighIndex: true },
      collection: "Pure Rimless",
      status: "ACTIVE_DEMO",
      seoMetadata: { title: "EK-007 The Upper Hill Zero-Rim | EyeKart Nairobi" }
    },
    {
      sku: "EK-420",
      name: "The Kilimani Heavy Square",
      brand: "EyeKart Nairobi Atelier",
      category: "eyeglasses",
      gender: "men",
      shape: "square",
      material: "8mm milled Mazzucchelli faceplate with beveled temple chamfers",
      color: "Olive Green & Cigar Havana Acetate",
      finish: "Raw Brushed Surface",
      price: 13200,
      compareAtPrice: 15800,
      dimensions: "53 □ 20 - 148",
      weight: "24.5g",
      bridge: 20,
      temple: 148,
      lensWidth: 53,
      lensHeight: 44,
      lensCompatibility: ["single_vision", "progressive", "polarized"],
      stock: 15,
      variants: [
        { name: "Olive Green", colorHex: "#2C3E2D", price: 13200, skuSuffix: "-OLV" },
        { name: "Polished Jet", colorHex: "#111111", price: 13200, skuSuffix: "-JET" },
        { name: "Cigar Havana", colorHex: "#4A2E1B", price: 13200, skuSuffix: "-HAV" }
      ],
      gallery: [
        "https://lh3.googleusercontent.com/aida-public/AB6AXuCDPWwa77Rc6v27IDcx5fO-H2kiVRUa6Nxpy_aGrh2VI2DIORTNziNNJRiNo7B17ZdQ1u2QdCwh72SZ3LVOsQuXsd-mx1lHKiSAOJYUF27nDI_PAWdpi0ieEuEBX1iDOJcNh1C_PQ_0PSDGjWpZRQXQXTGP0g-lIVbQdnQPsE8xiFHhtU7EwVsdrHjraKvzs1vISyWLevFORebtrnKbBjDq85ZJkXlbZ4FoYKM0E13iwW1YQc3DT9Davg"
      ],
      asset3D: { modelUrl: "assets/models/ek420.glb", hasCadBlueprint: true },
      assetVTO: { overlayUrl: "assets/vto/ek420_vto.png", scaleFactor: 1.04 },
      prescriptionCompatibility: { sphMin: -14.00, sphMax: 8.00, cylMax: -5.00 },
      collection: "Bold Silhouette",
      status: "ACTIVE_DEMO",
      seoMetadata: { title: "EK-420 The Kilimani Heavy Square | EyeKart Nairobi" }
    },
    {
      sku: "EK-204",
      name: "The Silicon TR90 Flex",
      brand: "EyeKart Nairobi Atelier",
      category: "screen",
      gender: "unisex",
      shape: "rectangle",
      material: "Flexible memory polymer with integrated silicone temple grip sleeves",
      color: "Matte Smoke & Midnight Navy",
      finish: "Soft-Touch Matte",
      price: 7500,
      compareAtPrice: 9000,
      dimensions: "51 □ 17 - 142",
      weight: "12.5g",
      bridge: 17,
      temple: 142,
      lensWidth: 51,
      lensHeight: 38,
      lensCompatibility: ["single_vision", "anti_fatigue", "office"],
      stock: 30,
      variants: [
        { name: "Matte Smoke", colorHex: "#4F5B66", price: 7500, skuSuffix: "-SMK" },
        { name: "Midnight Navy", colorHex: "#101720", price: 7500, skuSuffix: "-NVY" }
      ],
      gallery: [
        "https://lh3.googleusercontent.com/aida-public/AB6AXuDtO29rxtvj_nQvvRheicN0lw2n3GDhqGr0O0abmygEmMjEmfOKiPARjcTsX4u4TsuUAVVPluul6v9x98eYJwTp4g38GRa1uBYzRxb86pwEU5Q7UWdNHcl4JmjHlS3He9vG1IyU4Z2yh6-xMAV4HNCE1CfEPvwtLtH3LZjzlsjJh2I9UeFsx24Ih4Z2052ODM0jhN01y88W-Xi1WUQgKTGBbb4D3EwjjHoQ1AfoS2HoHjtN4Kc040JIiQ"
      ],
      asset3D: { modelUrl: "assets/models/ek204.glb", hasCadBlueprint: true },
      assetVTO: { overlayUrl: "assets/vto/ek204_vto.png", scaleFactor: 1.0 },
      prescriptionCompatibility: { sphMin: -6.00, sphMax: 4.00, cylMax: -2.00 },
      collection: "Nairobi Tech",
      status: "ACTIVE_DEMO",
      seoMetadata: { title: "EK-204 The Silicon TR90 Flex | EyeKart Nairobi" }
    },
    {
      sku: "EK-714",
      name: "The Parklands Supra Wire",
      brand: "EyeKart Nairobi Atelier",
      category: "eyeglasses",
      gender: "unisex",
      shape: "semi-rimless",
      material: "High-tensile nylon cord suspension with titanium top chassis",
      color: "Deep Gunmetal & Titanium Khaki",
      finish: "Brushed Gunmetal",
      price: 14200,
      compareAtPrice: 16800,
      dimensions: "53 □ 18 - 142",
      weight: "15.0g",
      bridge: 18,
      temple: 142,
      lensWidth: 53,
      lensHeight: 41,
      lensCompatibility: ["single_vision", "progressive", "office"],
      stock: 9,
      variants: [
        { name: "Deep Gunmetal", colorHex: "#43464B", price: 14200, skuSuffix: "-GUN" },
        { name: "Titanium Khaki", colorHex: "#A89F91", price: 14200, skuSuffix: "-KHK" }
      ],
      gallery: [
        "https://lh3.googleusercontent.com/aida-public/AB6AXuAIMMsFsxMyab0qihyQRW9YRZQ9O9zN5kZDSnTsBhBK4XKiidSILL1_pn4E-TMUK9MsceHu6sjYvaquWXVTh9-0USeKqjQB5l7qJkKxC--1Z5RYe1KUTUBYkrOZBAuIV-dHy3ClVa6M7Mo6byzCkidtXxPBl3RGYFkddidnJ3UHUw0HgAPvaFTLzvpRArTHhisZ1SminxpdT_llK7FGl6Yn_73Rgg3nzpfYa19JijSxkINIC_c4elQoLw"
      ],
      asset3D: { modelUrl: "assets/models/ek714.glb", hasCadBlueprint: true },
      assetVTO: { overlayUrl: "assets/vto/ek714_vto.png", scaleFactor: 1.0 },
      prescriptionCompatibility: { sphMin: -8.00, sphMax: 5.00, cylMax: -3.00 },
      collection: "Semi-Rimless",
      status: "ACTIVE_DEMO",
      seoMetadata: { title: "EK-714 The Parklands Supra Wire | EyeKart Nairobi" }
    },
    {
      sku: "EK-522",
      name: "The Naivasha Polarized Sun-Rx",
      brand: "EyeKart Nairobi Atelier",
      category: "sunglasses",
      gender: "unisex",
      shape: "aviator",
      material: "Dual-curved base 4 optics with rear anti-reflective multi-coating",
      color: "Deep Espresso Amber",
      finish: "Satin Warm Tortoise",
      price: 16800,
      compareAtPrice: 19500,
      dimensions: "54 □ 19 - 145",
      weight: "18.2g",
      bridge: 19,
      temple: 145,
      lensWidth: 54,
      lensHeight: 46,
      lensCompatibility: ["single_vision", "progressive", "polarized"],
      stock: 14,
      variants: [
        { name: "Polarized Amber", colorHex: "#3B2F2F", price: 16800, skuSuffix: "-AMB" },
        { name: "Neutral G-15 Green", colorHex: "#111111", price: 16800, skuSuffix: "-GRN" }
      ],
      gallery: [
        "https://lh3.googleusercontent.com/aida-public/AB6AXuDX1XqO8_voZwDID86-7nFIw5Yc2gwVd9l5pQoekaKtYOuzIsTsKwAwLfX4p7XmQxj4BVCB1FEZhgL1IVNb_EIiFdRl6Q6e1c76pFWjatfOweY48F3cLZRTaUEWnHbPhqPBb_IdblhsaloEEfb1flWC2aWVgIY5kqmkoSNBYSwPnSjjZeg7T0Sm0j36clzTJgQ-tEznG1GvME0JDi8f3oxqmehVV-k6wY_zEpw2RE-8lQn--dw5lB0B7w"
      ],
      asset3D: { modelUrl: "assets/models/ek522.glb", hasCadBlueprint: true },
      assetVTO: { overlayUrl: "assets/vto/ek522_vto.png", scaleFactor: 1.0 },
      prescriptionCompatibility: { sphMin: -6.00, sphMax: 4.00, cylMax: -2.50 },
      collection: "Equatorial Sun Rx",
      status: "ACTIVE_DEMO",
      seoMetadata: { title: "EK-522 The Naivasha Polarized Sun-Rx | EyeKart Nairobi" }
    },
    {
      sku: "EK-001",
      name: "The Grand Rift Artisan Horn",
      brand: "EyeKart Nairobi Atelier",
      category: "eyeglasses",
      gender: "unisex",
      shape: "round",
      material: "Hand-carved organic horn with 24K gold electroplated precision joints",
      color: "Natural Striated & Blonde Horn",
      finish: "Organic Beeswax Buffed",
      price: 36500,
      compareAtPrice: 42000,
      dimensions: "52 □ 20 - 145",
      weight: "22.4g",
      bridge: 20,
      temple: 145,
      lensWidth: 52,
      lensHeight: 45,
      lensCompatibility: ["single_vision", "progressive", "office"],
      stock: 4,
      variants: [
        { name: "Natural Striated Horn", colorHex: "#654321", price: 36500, skuSuffix: "-HRN" },
        { name: "Blonde Horn", colorHex: "#D2B48C", price: 36500, skuSuffix: "-BLN" }
      ],
      gallery: [
        "https://lh3.googleusercontent.com/aida-public/AB6AXuD2bNV8Py6CdG-28KY9TyjteO5zkkeYXFJTocGA6fY_OMLt4PAz1cKnZfGSbuMagOPDfvWhLqUvewp0Bv5vP3SSrRUzgSH2v6pUFgnrv67CALDoMAn9L3tzhoKOsQeaIOsiDJnjp70kjm6eb3ZpE_NVoWjQIb9E6dK2p8LpW3x3fGhGJotNS2xoRXTSXyb8Zatt_e1X1H29FtYeJ-vuvC0hwgrUjvIu8h-XYiFrN0xweJcxUiqFrcQQnQ"
      ],
      asset3D: { modelUrl: "assets/models/ek001.glb", hasCadBlueprint: true },
      assetVTO: { overlayUrl: "assets/vto/ek001_vto.png", scaleFactor: 1.0 },
      prescriptionCompatibility: { sphMin: -10.00, sphMax: 6.00, cylMax: -3.50 },
      collection: "Bespoke Horn",
      status: "ACTIVE_DEMO",
      seoMetadata: { title: "EK-001 The Grand Rift Artisan Horn | EyeKart Nairobi" }
    }
  ];

  // Helper querying utilities
  const CatalogService = {
    getAll: function () {
      return EyeKartCatalog;
    },
    getBySku: function (sku) {
      if (!sku || typeof sku !== 'string') return EyeKartCatalog[0];
      const cleanSku = sku.toUpperCase().trim();
      return EyeKartCatalog.find(f => f.sku === cleanSku || cleanSku.startsWith(f.sku)) || EyeKartCatalog[0];
    },
    search: function (query) {
      if (!query || typeof query !== 'string') return EyeKartCatalog;
      const q = query.toLowerCase().trim();
      return EyeKartCatalog.filter(f => 
        f.name.toLowerCase().includes(q) ||
        f.sku.toLowerCase().includes(q) ||
        f.shape.toLowerCase().includes(q) ||
        f.material.toLowerCase().includes(q) ||
        (f.collection && f.collection.toLowerCase().includes(q))
      );
    },
    filter: function (criteria) {
      if (!criteria) return EyeKartCatalog;
      return EyeKartCatalog.filter(frame => {
        if (criteria.category && criteria.category !== 'all' && frame.category !== criteria.category) return false;
        if (criteria.gender && criteria.gender !== 'all' && frame.gender !== criteria.gender && frame.gender !== 'unisex') return false;
        if (criteria.shape && criteria.shape !== 'all') {
          if (Array.isArray(criteria.shape)) {
            if (criteria.shape.length > 0 && !criteria.shape.includes(frame.shape.toLowerCase())) return false;
          } else if (frame.shape.toLowerCase() !== criteria.shape.toLowerCase()) {
            return false;
          }
        }
        if (criteria.material && criteria.material !== 'all') {
          if (Array.isArray(criteria.material)) {
            if (criteria.material.length > 0 && !criteria.material.some(m => frame.material.toLowerCase().includes(m.toLowerCase()))) return false;
          } else if (!frame.material.toLowerCase().includes(criteria.material.toLowerCase())) {
            return false;
          }
        }
        if (criteria.bridge && frame.bridge !== parseInt(criteria.bridge, 10)) return false;
        if (criteria.bridgeMin && frame.bridge < criteria.bridgeMin) return false;
        if (criteria.bridgeMax && frame.bridge > criteria.bridgeMax) return false;
        if (criteria.priceMax && frame.price > criteria.priceMax) return false;
        if (criteria.maxWeight) {
          const weightNum = parseFloat(frame.weight) || 99;
          if (weightNum > criteria.maxWeight) return false;
        }
        if (criteria.query) {
          const q = criteria.query.toLowerCase().trim();
          const match = frame.name.toLowerCase().includes(q) ||
                        frame.sku.toLowerCase().includes(q) ||
                        frame.shape.toLowerCase().includes(q) ||
                        frame.material.toLowerCase().includes(q) ||
                        (frame.collection && frame.collection.toLowerCase().includes(q));
          if (!match) return false;
        }
        return true;
      });
    },
    formatPriceKSh: function (price) {
      return 'KSh ' + Number(price || 0).toLocaleString('en-KE');
    }
  };

  global.EyeKartCatalog = EyeKartCatalog;
  global.CatalogService = CatalogService;

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
