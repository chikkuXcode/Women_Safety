const mongoose = require("mongoose");

const areaSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ["safe", "moderate", "unsafe"],
      required: true,
    },
    score: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },
    tip: {
      type: String,
      default: "",
      trim: true,
    },
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
    crimeRate: {
      type: Number,
      min: 1,
      max: 10,
      required: true,
    },
    lighting: {
      type: String,
      enum: ["good", "poor"],
      required: true,
    },
    crowdDensity: {
      type: Number,
      min: 1,
      max: 10,
      required: true,
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

module.exports = mongoose.model("Area", areaSchema);
