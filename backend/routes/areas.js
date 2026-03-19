const express = require("express");
const Area = require("../models/Area");

const router = express.Router();

const checkAdmin = (req, res, next) => {
  const adminPassword = req.headers["x-admin-password"];

  if (!adminPassword || adminPassword !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({
      success: false,
      message: "Admin authorization failed",
    });
  }

  return next();
};

const clampScore = (score) => {
  if (score < 0) return 0;
  if (score > 100) return 100;
  return score;
};

const getAdjustedCategory = (score) => {
  if (score >= 70) return "safe";
  if (score >= 40) return "moderate";
  return "unsafe";
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

router.get("/", async (req, res) => {
  try {
    const areas = await Area.find().sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: areas.length,
      data: areas,
    });
  } catch (error) {
    console.error(`[Areas] Failed to fetch areas: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch areas",
      error: error.message,
    });
  }
});

// Helper function to calculate haversine distance
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const toRad = (degree) => (degree * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = toRad(lat2 - lat1);
  const deltaLon = toRad(lon2 - lon1);

  const calculation =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);

  const arc = 2 * Math.atan2(Math.sqrt(calculation), Math.sqrt(1 - calculation));
  return earthRadiusKm * arc;
};

// Helper function to build safety reasons
const buildAreaReasons = (area, finalScore, adjustedCategory, modifiers = []) => {
  const reasons = [];

  if (typeof area.crimeRate === "number") {
    if (area.crimeRate >= 7) {
      reasons.push(`High crime rate (${area.crimeRate}/10) increases region risk.`);
    } else if (area.crimeRate <= 3) {
      reasons.push(`Low crime rate (${area.crimeRate}/10) supports safer conditions.`);
    } else {
      reasons.push(`Moderate crime rate (${area.crimeRate}/10) requires caution.`);
    }
  }

  if (area.lighting === "poor") {
    reasons.push("Poor lighting reduces visibility after sunset.");
  } else if (area.lighting === "good") {
    reasons.push("Good lighting improves visibility and confidence.");
  }

  if (typeof area.crowdDensity === "number") {
    if (area.crowdDensity <= 3) {
      reasons.push(`Low crowd density (${area.crowdDensity}/10) means fewer nearby helpers.`);
    } else if (area.crowdDensity >= 7) {
      reasons.push(`Higher crowd density (${area.crowdDensity}/10) generally improves perceived safety.`);
    }
  }

  if (Array.isArray(modifiers) && modifiers.length) {
    modifiers.forEach((modifier) => {
      reasons.push(`${modifier.reason} applied (${modifier.impact}).`);
    });
  }

  reasons.push(
    `Final score is ${finalScore}/100, so this region is currently ${
      adjustedCategory === "safe" ? "Safe" : adjustedCategory === "moderate" ? "Moderate" : "Unsafe"
    }.`
  );

  return reasons;
};

// GET nearby areas endpoint (MUST come before /:name route)
router.get("/nearby/:latitude/:longitude", async (req, res) => {
  try {
    const userLat = parseFloat(req.params.latitude);
    const userLon = parseFloat(req.params.longitude);
    const radiusKm = parseFloat(req.query.radius) || 5; // Default 5km radius

    if (isNaN(userLat) || isNaN(userLon)) {
      return res.status(400).json({
        success: false,
        message: "Invalid latitude or longitude",
      });
    }

    const allAreas = await Area.find();
    const currentHour = new Date().getHours();

    // Calculate distances and apply modifiers
    const areasWithDistance = allAreas
      .map((area) => {
        const distanceKm = haversineDistance(userLat, userLon, area.latitude, area.longitude);

        let finalScore = area.score;
        const modifiers = [];

        // Apply time-based risk
        if (currentHour >= 20 || currentHour <= 5) {
          finalScore -= 15;
          modifiers.push({
            reason: "Night time risk (20:00 - 05:59)",
            impact: -15,
          });
        }

        // Apply crime rate modifier
        if (area.crimeRate >= 7) {
          finalScore -= 10;
          modifiers.push({
            reason: "High crime rate (>=7)",
            impact: -10,
          });
        }

        // Apply lighting + crowd density modifier
        if (area.lighting === "poor" && area.crowdDensity <= 3) {
          finalScore -= 10;
          modifiers.push({
            reason: "Poor lighting + low crowd density",
            impact: -10,
          });
        }

        finalScore = clampScore(finalScore);
        const adjustedCategory = getAdjustedCategory(finalScore);

        return {
          area,
          distanceKm,
          baseScore: area.score,
          finalScore,
          adjustedCategory,
          modifiers,
          reasons: buildAreaReasons(area, finalScore, adjustedCategory, modifiers),
        };
      })
      .filter((item) => item.distanceKm <= radiusKm)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    return res.json({
      success: true,
      userLocation: { latitude: userLat, longitude: userLon },
      radiusKm,
      count: areasWithDistance.length,
      data: areasWithDistance,
    });
  } catch (error) {
    console.error(`[Areas] Failed to fetch nearby areas: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch nearby areas",
      error: error.message,
    });
  }
});

router.get("/:name", async (req, res) => {
  try {
    const areaName = req.params.name.trim();
    const area = await Area.findOne({
      name: { $regex: `^${escapeRegex(areaName)}$`, $options: "i" },
    });

    if (!area) {
      return res.status(404).json({
        success: false,
        message: "Area not found",
      });
    }

    let finalScore = area.score;
    const modifiers = [];
    const currentHour = new Date().getHours();

    if (currentHour >= 20 || currentHour <= 5) {
      finalScore -= 15;
      modifiers.push({
        reason: "Night time risk (20:00 - 05:59)",
        impact: -15,
      });
    }

    if (area.crimeRate >= 7) {
      finalScore -= 10;
      modifiers.push({
        reason: "High crime rate (>=7)",
        impact: -10,
      });
    }

    if (area.lighting === "poor" && area.crowdDensity <= 3) {
      finalScore -= 10;
      modifiers.push({
        reason: "Poor lighting + low crowd density",
        impact: -10,
      });
    }

    finalScore = clampScore(finalScore);
    const adjustedCategory = getAdjustedCategory(finalScore);

    return res.json({
      success: true,
      data: area,
      baseScore: area.score,
      finalScore,
      adjustedCategory,
      modifiers,
      serverHour: currentHour,
    });
  } catch (error) {
    console.error(`[Areas] Failed to evaluate area risk: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Unable to evaluate area safety",
      error: error.message,
    });
  }
});

router.post("/", checkAdmin, async (req, res) => {
  try {
    const requiredFields = [
      "name",
      "category",
      "score",
      "latitude",
      "longitude",
      "crimeRate",
      "lighting",
      "crowdDensity",
    ];

    for (const field of requiredFields) {
      if (
        req.body[field] === undefined ||
        req.body[field] === null ||
        req.body[field] === ""
      ) {
        return res.status(400).json({
          success: false,
          message: `Missing required field: ${field}`,
        });
      }
    }

    const existingArea = await Area.findOne({
      name: { $regex: `^${escapeRegex(String(req.body.name).trim())}$`, $options: "i" },
    });

    if (existingArea) {
      return res.status(409).json({
        success: false,
        message: "Area with this name already exists",
      });
    }

    const newArea = await Area.create({
      name: String(req.body.name).trim(),
      category: req.body.category,
      score: req.body.score,
      tip: req.body.tip || "",
      latitude: req.body.latitude,
      longitude: req.body.longitude,
      crimeRate: req.body.crimeRate,
      lighting: req.body.lighting,
      crowdDensity: req.body.crowdDensity,
    });

    return res.status(201).json({
      success: true,
      message: "Area created successfully",
      data: newArea,
    });
  } catch (error) {
    console.error(`[Areas] Failed to create area: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Unable to create area",
      error: error.message,
    });
  }
});

router.put("/:id", checkAdmin, async (req, res) => {
  try {
    const updatedArea = await Area.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updatedArea) {
      return res.status(404).json({
        success: false,
        message: "Area not found",
      });
    }

    return res.json({
      success: true,
      message: "Area updated successfully",
      data: updatedArea,
    });
  } catch (error) {
    console.error(`[Areas] Failed to update area: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Unable to update area",
      error: error.message,
    });
  }
});

router.delete("/:id", checkAdmin, async (req, res) => {
  try {
    const deletedArea = await Area.findByIdAndDelete(req.params.id);

    if (!deletedArea) {
      return res.status(404).json({
        success: false,
        message: "Area not found",
      });
    }

    return res.json({
      success: true,
      message: "Area deleted successfully",
      data: deletedArea,
    });
  } catch (error) {
    console.error(`[Areas] Failed to delete area: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Unable to delete area",
      error: error.message,
    });
  }
});

module.exports = router;
