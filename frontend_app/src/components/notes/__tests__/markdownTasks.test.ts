import { describe, expect, it } from 'vitest';
import { normalizeBareTasks, toggleTaskAtIndex } from '../markdownEditing';

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


  it('accepts the bare form people actually type', () => {
    expect(toggleTaskAtIndex('[x] sdafsadf', 0)).toBe('[ ] sdafsadf');
    expect(toggleTaskAtIndex('[ ] sdfsdf', 0)).toBe('[x] sdfsdf');
  });

  it('counts bare and bulleted tasks as one sequence', () => {
    const md = '[x] one\n- [ ] two\n[ ] three';
    expect(toggleTaskAtIndex(md, 2)).toBe('[x] one\n- [ ] two\n[x] three');
  });

  it('does not mistake a link whose text is x for a task', () => {
    expect(toggleTaskAtIndex('[x](https://example.com)', 0)).toBeNull();
  });
});

describe('normalizeBareTasks', () => {
  it('gives a bare box the bullet GFM needs', () => {
    expect(normalizeBareTasks('[x] a\n[ ] b')).toBe('- [x] a\n- [ ] b');
  });

  it('leaves already-bulleted tasks alone', () => {
    expect(normalizeBareTasks('- [x] a')).toBe('- [x] a');
  });

  it('keeps indentation', () => {
    expect(normalizeBareTasks('   [ ] a')).toBe('   - [ ] a');
  });

  it('leaves fenced code alone', () => {
    const md = ['```', '[ ] literal', '```', '[ ] real'].join('\n');
    expect(normalizeBareTasks(md)).toBe(['```', '[ ] literal', '```', '- [ ] real'].join('\n'));
  });

  it('returns the input untouched when there is nothing to do', () => {
    const md = '# Title\n\nplain text';
    expect(normalizeBareTasks(md)).toBe(md);
  });

  it('renders the same number of boxes as the toggler counts', () => {
    const md = '[x] one\n- [ ] two\n[ ] three';
    const boxes = (normalizeBareTasks(md).match(/\[[ xX]\]/g) ?? []).length;
    expect(boxes).toBe(3);
    expect(toggleTaskAtIndex(md, 3)).toBeNull();
  });
});
