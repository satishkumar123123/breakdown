# Daily Breakdown Reporting Portal

React reporting form with an Express API and MongoDB storage.

## Deploy together on Vercel

1. Import this repository and set **Root Directory to the repository root**, not `frontend`.
2. Set framework preset to **Other**; `vercel.json` provides the build and output settings.
3. Add `MONGO_URI` (or `MONGODB_URI`) in Vercel Environment Variables using your MongoDB Atlas connection string and intended database name. Keep credentials out of Git.
4. Ensure Atlas Network Access allows your backend's outbound connections.
5. Deploy/redeploy. `/api/health` must return `{"status":"ok","database":"connected"}` before submitting reports.

The frontend calls `/api` on the same domain. `api/index.js` forwards API requests to Express; the first request waits for MongoDB to connect. A report is only reported as saved after MongoDB returns its ID.

## Separate frontend and backend hosting

Run `backend/server.js` on the backend host and configure `MONGO_URI` there. On the frontend host set `VITE_API_BASE_URL=https://YOUR-BACKEND-HOST/api` and rebuild/redeploy the frontend. An HTTPS frontend needs an HTTPS backend. Never set the live API URL to localhost.

## Local development

1. In `backend`, run `npm ci`, copy `.env.example` to `.env`, and set your MongoDB connection string. Run `npm start`.
2. In `frontend`, run `npm ci` and `npm run dev`.
3. Vite proxies `/api` requests to port 5000. For a different backend port, set `BACKEND_URL` when starting Vite.

If saving fails, the form stays filled and shows the API error. Database connectivity errors return HTTP 503. Check History before retrying a request interrupted after submission, since the database may already have received it.

## Verification

From the repository root: `npm ci`, `npm test`, and `npm run build`. Tests use isolated model stubs for API behavior; testing your deployed Atlas connection requires `/api/health` and a test report on your deployment.

## Reporting improvements

- Summary cards show breakdown count, total downtime, and D/N downtime. The form shows the current draft; History shows saved reports for the selected date and active filters.
- History has machine-name search, section selection and D/N filters. Counts, totals, machine charts, visible rows and Excel exports use the matching entries. **Edit Full Report** always loads the entire saved report.
- Machine analysis can rank machines by downtime or breakdown count. Names are grouped without regard to case or surrounding spaces.
- New-report and edit drafts auto-save separately in this browser/device. Refresh restores the draft. These drafts are not database submissions and do not sync across devices or different deployment domains. Storage failures are displayed in the form.
- History → date → **Edit Full Report** → **Update Report** updates the same record using `PUT /api/reports/:id`. Cancel Edit restores the new-report draft. An outdated edit returns HTTP 409 instead of overwriting a newer update; a deleted report returns 404. Failed saves retain the form and draft.
- Section is optional, including on older reports. Totals are recalculated by the backend from the submitted entries. Redeploy the Express backend along with the frontend to enable the update endpoint.
