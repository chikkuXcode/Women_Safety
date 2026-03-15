# AI Based Unsafe Area Detection System for Women Safety – Alwar Rajasthan

A complete full-stack web application to assess area safety in Alwar, Rajasthan using dynamic risk scoring, incident reporting, geolocation support, and an admin dashboard for area/report management.

## Tech Stack

- **Frontend:** HTML, CSS, Vanilla JavaScript
- **Backend:** Node.js, Express.js
- **Database:** MongoDB, Mongoose
- **Admin Access:** Simple session-based dashboard (no JWT)

## Installation & Run

1. `npm install`
2. Make sure MongoDB is running locally
3. `npm run dev`
4. Open `http://localhost:5000`

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/areas` | Fetch all areas from MongoDB |
| GET | `/api/areas/:name` | Get area by name (case-insensitive) with dynamic final score |
| POST | `/api/areas` | Add new area (admin header required) |
| PUT | `/api/areas/:id` | Update area by ID (admin header required) |
| DELETE | `/api/areas/:id` | Delete area by ID (admin header required) |
| GET | `/api/reports` | Fetch all reports (newest first) |
| POST | `/api/reports` | Submit a new report |
| PUT | `/api/reports/:id/status` | Mark a report as reviewed (admin header required) |
| DELETE | `/api/reports/:id` | Delete a report (admin header required) |
| GET | `/api/reports/stats` | Get report analytics (total/pending/reviewed/top areas) |
| POST | `/api/admin/login` | Admin login using password |
| GET | `/api/admin/stats` | Dashboard stats for areas and reports |

## Admin Dashboard

- URL: `http://localhost:5000/admin`
- Default admin password: `alwar@admin123`
- Admin-protected API calls use header: `x-admin-password`

## Folder Structure

```text
safetty project/
├─ package.json
├─ README.md
├─ backend/
│  ├─ .env
│  ├─ server.js
│  ├─ config/
│  │  └─ db.js
│  ├─ models/
│  │  ├─ Area.js
│  │  └─ Report.js
│  └─ routes/
│     ├─ admin.js
│     ├─ areas.js
│     └─ reports.js
└─ frontend/
   ├─ index.html
   ├─ admin.html
   ├─ css/
   │  └─ style.css
   └─ js/
      └─ main.js
```

## Notes

- Seed data is inserted only once when the `areas` collection is empty.
- CORS allows `http://localhost:5000` and `http://localhost:3000`.
- Root pages:
  - `/` → public area checker dashboard
  - `/admin` → admin management dashboard
