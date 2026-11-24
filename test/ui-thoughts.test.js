import test from 'node:test';
import assert from 'node:assert/strict';
import {dayText, clockText, thoughtParts, edgeNumbers, padNumber} from '../src/ui/app.js';

test('thought text splits the first line into a title and the rest into a body', () => {
  assert.deepEqual(thoughtParts({thought: '第一行标题\n\n正文第一段\n正文第二段'}), {title: '第一行标题', body: '正文第一段\n正文第二段', empty: false});
  assert.deepEqual(thoughtParts({thought: '只有一行'}), {title: '只有一行', body: '', empty: false});
  assert.deepEqual(thoughtParts({thought: '   '}), {title: '', body: '', empty: true});
  assert.deepEqual(thoughtParts({}), {title: '', body: '', empty: true});
});
test('edge numbers stay stable in creation order', () => {
  const numbers = edgeNumbers([{id: 'b', created: 20}, {id: 'a', created: 10}, {id: 'c', created: 30}]);
  assert.equal(numbers.get('a'), 1); assert.equal(numbers.get('b'), 2); assert.equal(numbers.get('c'), 3);
  assert.equal(numbers.get('missing'), undefined);
});
test('thought book dates and numbers stay readable', () => {
  const stamp = new Date(2026, 10, 24, 14, 32).getTime();
  assert.equal(dayText(stamp), '2026.11.24');
  assert.equal(clockText(stamp), '14:32');
  assert.equal(dayText(NaN), '时间未知');
  assert.equal(clockText(NaN), '');
  assert.equal(padNumber(7), '007');
});
