import { describe, expect, it } from 'vitest';
import { toggleTaskAtIndex } from '../markdownEditing';

describe('toggleTaskAtIndex', () => {
  it('ticks an unchecked box', () => {
    expect(toggleTaskAtIndex('- [ ] one', 0)).toBe('- [x] one');
  });

  it('unticks a checked box, upper or lower case', () => {
    expect(toggleTaskAtIndex('- [x] one', 0)).toBe('- [ ] one');
    expect(toggleTaskAtIndex('- [X] one', 0)).toBe('- [ ] one');
  });

  it('counts tasks in document order', () => {
    const md = '- [ ] a\n- [ ] b\n- [ ] c';
    expect(toggleTaskAtIndex(md, 1)).toBe('- [ ] a\n- [x] b\n- [ ] c');
  });

  it('keeps indentation, bullet style and trailing text', () => {
    expect(toggleTaskAtIndex('   * [ ] nested item', 0)).toBe('   * [x] nested item');
    expect(toggleTaskAtIndex('2. [ ] ordered', 0)).toBe('2. [x] ordered');
  });

  it('leaves other lines untouched', () => {
    const md = '# Title\n\n- [ ] task\n\nplain text';
    expect(toggleTaskAtIndex(md, 0)).toBe('# Title\n\n- [ ] task\n\nplain text'.replace('[ ]', '[x]'));
  });

  it('skips task syntax inside fenced code, which renders no checkbox', () => {
    const md = ['```', '- [ ] not a checkbox', '```', '- [ ] real one'].join('\n');
    expect(toggleTaskAtIndex(md, 0)).toBe(
      ['```', '- [ ] not a checkbox', '```', '- [x] real one'].join('\n'),
    );
  });

  it('handles ~~~ fences too', () => {
    const md = ['~~~', '- [ ] fenced', '~~~', '- [ ] real'].join('\n');
    expect(toggleTaskAtIndex(md, 0)).toBe(
      ['~~~', '- [ ] fenced', '~~~', '- [x] real'].join('\n'),
    );
  });

  it('returns null when the index does not exist', () => {
    expect(toggleTaskAtIndex('- [ ] only', 1)).toBeNull();
    expect(toggleTaskAtIndex('no tasks here', 0)).toBeNull();
    expect(toggleTaskAtIndex('- [ ] a', -1)).toBeNull();
  });

  it('ignores a bare bracket that is not a task item', () => {
    expect(toggleTaskAtIndex('[ ] no bullet', 0)).toBeNull();
  });
});
