# Daily Breakdown Reporting Portal

A monthly breakdown register built with React, Vite, Express and MongoDB.

## Daily entries and month-end history

- The main table has **Date immediately after SL. NO.** Each row has its own date; there is no report-date field above the table.
- Choose a **Working month**, click **Add Breakdown Row**, and fill its date, machine, D/N shift, breakdown details, times, manpower and spares.
- **Save Daily Entries** submits only the draft rows. Saved rows stay on the main page after saving and refreshing. Rows are sorted by date descending, then newest saved report first.
- Add the following day's rows the same way. Different dates within the same month may be saved together. The server rejects invalid dates and mixed-month submissions.
- At month end, save any pending drafts and click **Save Month to History**. Confirming closes that month, removes its saved entries from the main register and displays a month card in **Monthly History**.
- A month archive is a durable MongoDB marker. It does not copy, delete or re-create any report. Repeating a close request is safe. All devices see the same closed months.
- On a new calendar month, the main page defaults to that month. Other unclosed months remain selectable, so unfinished work is still accessible. Existing reports remain in their respective open months until explicitly closed.
- Closed months reject new submissions. Existing reports can still be corrected from History with **Edit report**, within the same month.
- Drafts for each month and edit drafts are stored separately in this browser. Previously stored daily drafts and saved reports without per-row dates retain their original report date.
- Excel exports include the actual date of every row. Main-page exports label unsaved drafts; History exports follow the selected machine, date and D/N filters.
- QR popup/download, automatic overnight downtime, machine analysis, print/PDF and the ten-day bar/line chart remain available. Charts count entries using their individual dates.

**Edit/Delete scope:** the action on a saved row edits or deletes its entire submitted report, which may contain several rows. Deletion requires confirmation showing the row count.

## Deploy together on Vercel

1. Import this repository with **Root Directory at the repository root**.
2. Set framework preset to **Other**. The root vercel.json supplies build/output settings.
3. Configure MONGO_URI (or MONGODB_URI) with the intended MongoDB Atlas database. Keep credentials out of Git.
4. Ensure Atlas Network Access permits the backend connection.
5. Deploy. GET /api/health must return a connected database status.

The frontend calls /api on the same domain. The serverless API reuses MongoDB connections and waits for the initial connection before saving.

## Separate frontend and backend hosting

Deploy backend/server.js on the backend host with MONGO_URI configured. Set VITE_API_BASE_URL=https://YOUR-BACKEND-HOST/api (VITE_API_URL is also accepted) on the frontend and rebuild. The frontend-only Vercel configuration proxies /api to the existing Render backend.

**Deploy both frontend and backend for the monthly workflow.** An old backend cannot return archive metadata or close months; the UI reports this mismatch instead of treating a daily save as a month close.

## Local development

1. Run npm ci at the repository root.
2. Copy backend/.env.example to backend/.env and set the MongoDB connection string.
3. Start the API with npm start.
4. Run npm --prefix frontend ci and npm --prefix frontend run dev.

Vite proxies /api to localhost:5000. Set BACKEND_URL for a different backend address.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | /api/health | Check the database connection |
| GET | /api/reports | Existing array response for report clients |
| GET | /api/reports?view=monthly | Reports plus archivedMonths for the register |
| GET | /api/reports?date=YYYY-MM-DD | Reports containing entries on the given date; legacy report-date fallback |
| POST | /api/reports | Save draft rows within one open month |
| PUT | /api/reports/:id | Update a report, preserving its month |
| DELETE | /api/reports/:id | Delete a report |
| POST | /api/report-months/YYYY-MM/archive | Close a month containing saved reports |

Each new entry carries entryDate in YYYY-MM-DD format. reportDate remains for compatibility and anchors the month. Older entries without entryDate use reportDate. Totals are recalculated on the server.

Updates send expectedUpdatedAt. A conflicting update returns 409; a missing report returns 404. Failed submissions retain the draft. After a network interruption, refresh and inspect saved rows before retrying because the server may already have received the submission.

## Verification

Run npm test and npm run build. Automated tests cover API failures, legacy reports, row dates, monthly grouping, newest-first ordering, month-specific draft restoration, chart counts, archive persistence, repeated archive requests, closed-month rejection and corrections to archived reports.

API tests use isolated Mongoose model stubs. Live MongoDB connectivity and hosting require deployment verification.

