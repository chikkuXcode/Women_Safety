const express = require("express");
const Area = require("../models/Area");
const Report = require("../models/Report");

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const password = String(req.body.password || "");

    if (password === process.env.ADMIN_PASSWORD) {
      return res.json({
        success: true,
        token: "admin-session-granted",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Wrong password",
    });
  } catch (error) {
    console.error(`[Admin] Login failed: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Unable to process login",
      error: error.message,
    });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const totalAreas = await Area.countDocuments();
    const safeCount = await Area.countDocuments({ category: "safe" });
    const moderateCount = await Area.countDocuments({ category: "moderate" });
    const unsafeCount = await Area.countDocuments({ category: "unsafe" });

    const avgScoreResult = await Area.aggregate([
      {
        $group: {
          _id: null,
          avgScore: { $avg: "$score" },
        },
      },
    ]);

    const avgScore = avgScoreResult.length
      ? Number(avgScoreResult[0].avgScore.toFixed(2))
      : 0;

    const totalReports = await Report.countDocuments();
    const pendingReports = await Report.countDocuments({ status: "pending" });
    const recentReports = await Report.find().sort({ createdAt: -1 }).limit(5);

    return res.json({
      success: true,
      data: {
        totalAreas,
        safeCount,
        moderateCount,
        unsafeCount,
        avgScore,
        totalReports,
        pendingReports,
        recentReports,
      },
    });
  } catch (error) {
    console.error(`[Admin] Failed to fetch dashboard stats: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch dashboard stats",
      error: error.message,
    });
  }
});

module.exports = router;
