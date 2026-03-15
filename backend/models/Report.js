const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    areaName: {
      type: String,
      required: true,
      trim: true,
    },
    reason: {
      type: String,
      enum: [
        "Poor Lighting",
        "Suspicious Activity",
        "No Police Patrol",
        "Isolated Road",
        "History of Incidents",
        "Other",
      ],
      default: "Other",
    },
    timeOfIncident: {
      type: String,
      default: "",
      trim: true,
    },
    reportedBy: {
      type: String,
      default: "Anonymous",
      trim: true,
    },
    incidentText: {
      type: String,
      default: "",
      trim: true,
    },
    status: {
      type: String,
      enum: ["pending", "reviewed"],
      default: "pending",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  }
);

module.exports = mongoose.model("Report", reportSchema);
