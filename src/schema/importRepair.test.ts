import { describe, expect, it } from 'vitest';
import { buildImportRepairRequest } from './importRepair';

describe('copyable model repair request', () => {
  it('keeps exact input, precise validation errors and the complete current contract together', () => {
    const source = '{"schema_version":2,"title":"Keep &amp; text"}';
    const result = buildImportRepairRequest(source, '点 ID 重复：A（solid.points 与 constructions）', '协议2完整提示词');
    expect(result).toContain(source); expect(result).toContain('点 ID 重复：A');
    expect(result).toContain('协议2完整提示词');
    expect(result).toContain('不执行');
  });
  it('bounds native clipboard requests by actual text bytes and rejects nontext arguments', () => {
    expect(() => buildImportRepairRequest(null, 'error', 'prompt')).toThrow();
    expect(() => buildImportRepairRequest('{}', {}, 'prompt')).toThrow();
    expect(() => buildImportRepairRequest('汉'.repeat(750000), 'error', 'prompt')).toThrow(/2 MB/);
    expect(() => buildImportRepairRequest('{}', 'x'.repeat(16000), 'prompt')).toThrow(/错误/);
  });
});
