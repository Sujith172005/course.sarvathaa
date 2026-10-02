# Sarvathaa — GitHub to VPS

Flask + MySQL application, served by Gunicorn behind Nginx.

1. Extract this ZIP on your computer.
2. Push the extracted files to a **private** GitHub repository, not the ZIP.
3. Follow `VPS_DEPLOYMENT_GUIDE.md`. It separates NEW installations from updates
   to an ALREADY-HOSTED site. Do not overwrite a working database or HTTPS config.

Keep `app.py`, `wsgi.py`, `requirements.txt`, `database.sql`, HTML pages,
`assets/`, `private_course_docs/`, `deploy/`, and `.env.example` at the repo root.

## Fixes included

- All company WhatsApp links use +91 98869 16067; mobile floating button spacing retained.
- Admin loading failures show Retry controls instead of redirecting back and forth.
- Only a confirmed missing/expired session redirects to login.
- Login verifies the browser kept its session cookie before opening the dashboard.
- Changed JS/CSS have cache-busting URLs to avoid old cached behavior.
- Blank production environment template and Nginx/Gunicorn/systemd configs included.
- Regression tests cover redirects, cookies and protected routes.

## Credentials and private material

The ZIP includes course PDFs and rendered note images, so keep the repo PRIVATE.
Production credentials belong in `/etc/sarvathaa.env` on the VPS, never in Git.
`.env.example` is a blank template. Hard-coded admin/database password defaults
were removed. If a real password was pushed previously, rotate it: `.gitignore`
does not erase old commits.

The Windows virtual environment, Python caches, real `.env` files and logs are
excluded. Create a Linux virtual environment on the VPS. Existing course notes
and their rendered pages are retained because the app needs them. Only the demo
video is bundled; add real paid videos separately. Paid videos are Git-ignored.

## Tests and limitations

After installing requirements, run:

```bash
python -m unittest discover -s tests -v
node tests/admin_frontend.test.cjs
```

Node 18+ is needed only for JavaScript tests, not to run the website.
Tests simulate database/network failures. They do not verify your live VPS,
MySQL data, DNS or TLS. Follow the guide's live checks. This is not a complete
security audit; existing dependency versions were retained for compatibility
and should be reviewed before a wider launch.
