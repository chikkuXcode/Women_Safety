const path = require("path");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env") });

const connectDB = require("./config/db");
const Area = require("./models/Area");
const areasRouter = require("./routes/areas");
const reportsRouter = require("./routes/reports");
const adminRouter = require("./routes/admin");

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = ["http://localhost:5000", "http://localhost:3000"];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origin not allowed by CORS policy"));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "../frontend")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

app.get("/explore", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/explore.html"));
});

app.get("/report", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/report.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/admin.html"));
});

app.use("/api/areas", areasRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/admin", adminRouter);

app.use((error, req, res, next) => {
  if (error && error.message === "Origin not allowed by CORS policy") {
    console.warn(`[Server] CORS blocked origin: ${req.headers.origin || "unknown"}`);
    return res.status(403).json({
      success: false,
      message: "CORS access denied",
    });
  }

  return next(error);
});

const seedInitialAreas = async () => {
  try {
    const count = await Area.countDocuments();

    if (count > 0) {
      console.log(`[Seed] Existing data found (${count} areas). Seed skipped.`);
      return;
    }

    const dataset = [
      {
        name: "Company Bagh",
        category: "safe",
        score: 92,
        tip: "Well lit park area",
        lat: 27.5706,
        lng: 76.617,
        crimeRate: 2,
        lighting: "good",
        crowdDensity: 8,
      },
      {
        name: "Scheme No 2",
        category: "safe",
        score: 88,
        tip: "Residential, good patrolling",
        lat: 27.558,
        lng: 76.621,
        crimeRate: 2,
        lighting: "good",
        crowdDensity: 7,
      },
      {
        name: "Civil Lines",
        category: "safe",
        score: 90,
        tip: "Government zone, high security",
        lat: 27.5645,
        lng: 76.629,
        crimeRate: 1,
        lighting: "good",
        crowdDensity: 6,
      },
      {
        name: "Lajpat Nagar",
        category: "safe",
        score: 85,
        tip: "Active residential colony",
        lat: 27.56,
        lng: 76.625,
        crimeRate: 2,
        lighting: "good",
        crowdDensity: 7,
      },
      {
        name: "Rajeev Nagar",
        category: "safe",
        score: 87,
        tip: "Well lit streets",
        lat: 27.562,
        lng: 76.623,
        crimeRate: 2,
        lighting: "good",
        crowdDensity: 6,
      },
      {
        name: "Model Town",
        category: "safe",
        score: 89,
        tip: "Planned locality",
        lat: 27.566,
        lng: 76.631,
        crimeRate: 1,
        lighting: "good",
        crowdDensity: 7,
      },
      {
        name: "Hope Circus",
        category: "moderate",
        score: 58,
        tip: "Busy, stay alert in crowds",
        lat: 27.5561,
        lng: 76.6255,
        crimeRate: 5,
        lighting: "good",
        crowdDensity: 8,
      },
      {
        name: "Bus Stand",
        category: "moderate",
        score: 52,
        tip: "Watch belongings in crowds",
        lat: 27.5534,
        lng: 76.6198,
        crimeRate: 5,
        lighting: "good",
        crowdDensity: 9,
      },
      {
        name: "Railway Station",
        category: "moderate",
        score: 55,
        tip: "Avoid after 10PM",
        lat: 27.5523,
        lng: 76.6167,
        crimeRate: 6,
        lighting: "good",
        crowdDensity: 8,
      },
      {
        name: "Nangli Circle",
        category: "moderate",
        score: 50,
        tip: "High traffic, risky after dark",
        lat: 27.5545,
        lng: 76.622,
        crimeRate: 5,
        lighting: "poor",
        crowdDensity: 5,
      },
      {
        name: "Purana Shahar",
        category: "moderate",
        score: 48,
        tip: "Narrow lanes, avoid at night",
        lat: 27.551,
        lng: 76.618,
        crimeRate: 6,
        lighting: "poor",
        crowdDensity: 6,
      },
      {
        name: "Kala Kuan",
        category: "unsafe",
        score: 18,
        tip: "Poorly lit, avoid at night",
        lat: 27.548,
        lng: 76.605,
        crimeRate: 9,
        lighting: "poor",
        crowdDensity: 2,
      },
      {
        name: "Moti Dungri",
        category: "unsafe",
        score: 22,
        tip: "Remote, minimal police",
        lat: 27.543,
        lng: 76.612,
        crimeRate: 8,
        lighting: "poor",
        crowdDensity: 2,
      },
      {
        name: "Industrial Area",
        category: "unsafe",
        score: 20,
        tip: "Deserted after hours",
        lat: 27.532,
        lng: 76.64,
        crimeRate: 9,
        lighting: "poor",
        crowdDensity: 1,
      },
      {
        name: "Delhi Road Bypass",
        category: "unsafe",
        score: 15,
        tip: "Isolated highway, HIGH RISK",
        lat: 27.59,
        lng: 76.66,
        crimeRate: 9,
        lighting: "poor",
        crowdDensity: 1,
      },
      {
        name: "Sariska Road",
        category: "unsafe",
        score: 12,
        tip: "Forest road, extreme danger",
        lat: 27.51,
        lng: 76.58,
        crimeRate: 10,
        lighting: "poor",
        crowdDensity: 1,
      },
    ];

    const areasToInsert = dataset.map((item) => ({
      name: item.name,
      category: item.category,
      score: item.score,
      tip: item.tip,
      latitude: item.lat,
      longitude: item.lng,
      crimeRate: item.crimeRate,
      lighting: item.lighting,
      crowdDensity: item.crowdDensity,
    }));

    await Area.insertMany(areasToInsert);
    console.log(`[Seed] Inserted ${areasToInsert.length} default areas into database.`);
  } catch (error) {
    console.error(`[Seed] Failed to seed area collection: ${error.message}`);
  }
};

const startServer = async () => {
  try {
    await connectDB();
    await seedInitialAreas();

    app.listen(PORT, () => {
      console.log(`[Server] App running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error(`[Server] Startup failed: ${error.message}`);
    process.exit(1);
  }
};

startServer();
