"""Run: python -m unittest discover -s tests -v. No live database is used."""
import os
import secrets
import subprocess
import sys
import unittest
from unittest.mock import patch

# Isolated, ephemeral test configuration, never deployment credentials.
os.environ.update(APP_ENV='production', SECRET_KEY=secrets.token_hex(32),
                  ADMIN_USERNAME='deployment-test', ADMIN_PASSWORD=secrets.token_urlsafe(24),
                  DB_PASSWORD=secrets.token_urlsafe(24), COOKIE_SECURE='true', BEHIND_PROXY='true')
import app as module


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.client = module.app.test_client()
        self.origin = 'https://sarvathaa.com'

    def login(self):
        return self.client.post('/api/admin-login', base_url=self.origin,
                                json={'username': module.ADMIN_USERNAME, 'password': module.ADMIN_PASSWORD})

    def test_public_pages_and_health(self):
        for url in ['/', '/course-login.html', '/assets/js/course-app.js', '/health']:
            with self.client.get(url, base_url=self.origin) as response:
                self.assertEqual(response.status_code, 200)

    def test_session_and_dashboard_refresh(self):
        response = self.login()
        self.assertEqual(response.status_code, 200)
        cookie = response.headers['Set-Cookie']
        for flag in ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/']:
            self.assertIn(flag, cookie)
        for _ in range(4):
            self.assertTrue(self.client.get('/api/admin/check', base_url=self.origin).json['ok'])
            response = self.client.get('/admin', base_url=self.origin)
            self.assertEqual(response.status_code, 200)
            self.assertIn('no-store', response.headers['Cache-Control'])
            response.close()

    def test_public_favicons(self):
        icons = ['favicon.ico', 'favicon.png', 'favicon-16x16.png',
                 'favicon-32x32.png', 'favicon-48x48.png', 'apple-touch-icon.png']
        for filename in icons:
            for suffix in ['', '?v=sarvathaa-round-1']:
                with self.client.get('/' + filename + suffix, base_url=self.origin) as response:
                    self.assertEqual(response.status_code, 200, filename)
                    self.assertTrue(response.mimetype.startswith('image/'))
                    self.assertEqual(response.data, (module.BASE_DIR / filename).read_bytes())
        for url in ['/favicon.png.py', '/favicon-99x99.png', '/other.png',
                    '/favicon.ico/../app.py', '/assets/../app.py']:
            self.assertEqual(self.client.get(url, base_url=self.origin).status_code, 404, url)

    def test_all_html_pages_link_favicons(self):
        from html.parser import HTMLParser
        from urllib.parse import urlsplit

        class IconLinks(HTMLParser):
            def __init__(self):
                super().__init__()
                self.icons = []

            def handle_starttag(self, tag, attrs):
                attrs = dict(attrs)
                if tag == 'link' and attrs.get('rel') in ('icon', 'apple-touch-icon'):
                    self.icons.append(attrs)

        for page in module.BASE_DIR.glob('*.html'):
            parser = IconLinks()
            parser.feed(page.read_text())
            self.assertEqual(len(parser.icons), 6, page.name)
            for icon in parser.icons:
                self.assertTrue((module.BASE_DIR / urlsplit(icon['href']).path).is_file())

    def test_authenticated_db_error_does_not_clear_session(self):
        self.login()
        with patch.object(module, 'get_db', side_effect=RuntimeError('Simulated database outage')):
            with self.assertLogs(module.app.logger, level='ERROR'):
                response = self.client.get('/api/admin/students', base_url=self.origin)
        self.assertEqual(response.status_code, 500)
        self.assertTrue(response.is_json)
        self.assertTrue(self.client.get('/api/admin/check', base_url=self.origin).json['ok'])

    def test_unauthenticated_access(self):
        self.assertEqual(self.client.get('/admin', base_url=self.origin).status_code, 302)
        self.assertEqual(self.client.get('/api/admin/students', base_url=self.origin).status_code, 401)
        self.assertEqual(self.client.get('/course-document/baking', base_url=self.origin).status_code, 401)

    def test_private_files_are_not_public(self):
        for url in ['/app.py', '/database.sql', '/.env', '/.git/config', '/deploy/sarvathaa.service',
                    '/private_course_docs/baking.pdf', '/private_course_docs/rendered/baking/page-1.png']:
            self.assertEqual(self.client.get(url, base_url=self.origin).status_code, 404, url)

    def test_logout(self):
        self.login()
        self.assertEqual(self.client.post('/api/admin-logout', base_url=self.origin).status_code, 200)
        self.assertFalse(self.client.get('/api/admin/check', base_url=self.origin).json['ok'])

    def test_missing_production_secret_is_rejected(self):
        env = dict(os.environ, SECRET_KEY='')
        result = subprocess.run([sys.executable, '-c', 'import app'], env=env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Set SECRET_KEY', result.stderr)

    def test_session_signature_is_valid_with_shared_key(self):
        self.login()
        cookie = self.client.get_cookie('sarvathaa_session', domain='sarvathaa.com')
        serializer = module.app.session_interface.get_signing_serializer(module.app)
        self.assertTrue(serializer.loads(cookie.value)['admin_logged_in'])


if __name__ == '__main__':
    unittest.main()
