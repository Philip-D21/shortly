import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell } from '../controller/eventManagementController';

test('guest CSV export neutralizes spreadsheet formulas', () => {
  assert.equal(csvCell('=HYPERLINK("https://bad.example")'), `"'=HYPERLINK(""https://bad.example"")"`);
  assert.equal(csvCell('+cmd'), `"'+cmd"`);
  assert.equal(csvCell('normal, guest'), `"normal, guest"`);
});
