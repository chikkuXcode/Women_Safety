const express = require("express");
const Report = require("../models/Report");

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

router.get("/", async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1, _id: -1 });

    return res.json({
      success: true,
      count: reports.length,
      data: reports,
      reports,
    });
  } catch (error) {
    console.error(`[Reports] Failed to fetch reports: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch reports",
      error: error.message,
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const areaName = String(req.body.areaName || "").trim();

    if (!areaName) {
      return res.status(400).json({
        success: false,
        message: "areaName is required",
      });
    }

    const newReport = await Report.create({
      areaName,
      reason: req.body.reason,
      timeOfIncident: req.body.timeOfIncident || "",
      reportedBy: req.body.reportedBy || "Anonymous",
      incidentText: String(req.body.incidentText || "").trim(),
    });

    return res.status(201).json({
      success: true,
      message: "Report submitted successfully",
      data: newReport,
      report: newReport,
    });
  } catch (error) {
    console.error(`[Reports] Failed to submit report: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Unable to submit report",
      error: error.message,
    });
  }
});

router.put("/:id/status", checkAdmin, async (req, res) => {
  try {
    const updatedReport = await Report.findByIdAndUpdate(
      req.params.id,
      { status: "reviewed" },
      { new: true, runValidators: true }
    );

    if (!updatedReport) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    return res.json({
      success: true,
      message: "Report marked as reviewed",
      data: updatedReport,
    });
  } catch (error) {
    console.error(`[Reports] Failed to update report status: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Unable to update report status",
      error: error.message,
    });
  }
});

router.delete("/:id", checkAdmin, async (req, res) => {
  try {
    const deletedReport = await Report.findByIdAndDelete(req.params.id);

    if (!deletedReport) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    return res.json({
      success: true,
      message: "Report deleted successfully",
      data: deletedReport,
    });
  } catch (error) {
    console.error(`[Reports] Failed to delete report: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Unable to delete report",
      error: error.message,
    });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const total = await Report.countDocuments();
    const pending = await Report.countDocuments({ status: "pending" });
    const reviewed = await Report.countDocuments({ status: "reviewed" });

    const topAreas = await Report.aggregate([
      {
        $group: {
          _id: "$areaName",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 3 },
      {
        $project: {
          _id: 0,
          areaName: "$_id",
          count: 1,
        },
      },
    ]);

    return res.json({
      success: true,
      data: {
        total,
        pending,
        reviewed,
        topAreas,
      },
    });
  } catch (error) {
    console.error(`[Reports] Failed to fetch report statistics: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Unable to fetch report statistics",
      error: error.message,
    });
  }
});

module.exports = router;
