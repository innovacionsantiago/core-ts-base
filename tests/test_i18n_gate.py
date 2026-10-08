"""Pruebas del gate con la CLI real instalada en PATH, sin servicios ni bases."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
GATE = ROOT / 'scripts/i18n-check.sh'


class CatalogGateTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(shutil.which('cis-i18n'), 'Instala el tarball privado y añade su bin a PATH')
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)

    def catalog(self):
        shutil.copytree(ROOT / 'messages', self.directory / 'messages')
        shutil.copyfile(ROOT / 'i18n.config.json', self.directory / 'i18n.config.json')

    def run_gate(self):
        return subprocess.run(['bash', str(GATE)], cwd=self.directory, text=True, capture_output=True)

    def test_existing_repo_without_catalog_is_allowed(self):
        result = self.run_gate()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('Sin catálogo', result.stdout)

    def test_new_catalog_passes_real_cli(self):
        self.catalog()
        result = self.run_gate()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('0 errores', result.stdout)

    def test_missing_english_blocks(self):
        self.catalog()
        (self.directory / 'messages/en.json').write_text('{}')
        self.assertNotEqual(self.run_gate().returncode, 0)

    def test_invalid_icu_blocks(self):
        self.catalog()
        (self.directory / 'messages/es.json').write_text(json.dumps({'app': {'name': '{broken'}}))
        self.assertNotEqual(self.run_gate().returncode, 0)

    def test_unknown_enabled_locale_blocks(self):
        self.catalog()
        (self.directory / 'i18n.config.json').write_text('{"locales":["es","inventado"]}')
        self.assertNotEqual(self.run_gate().returncode, 0)


if __name__ == '__main__':
    unittest.main()
