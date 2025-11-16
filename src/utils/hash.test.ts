import { sha256, sha256Object, sha256File, sha256Sync } from './hash';

describe('Hash Utilities', () => {
  // Test string hashing
  it('should generate correct SHA-256 hash for strings', async () => {
    const testString = 'hello world';
    const expectedHash = 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9';
    
    const hash = await sha256(testString);
    expect(hash).toBe(expectedHash);
  });

  // Test empty string
  it('should handle empty strings', async () => {
    const expectedHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const hash = await sha256('');
    expect(hash).toBe(expectedHash);
  });

  // Test object hashing with consistent output
  it('should generate consistent hashes for objects', async () => {
    const obj1 = { a: 1, b: 'test', c: [1, 2, 3] };
    const obj2 = { c: [1, 2, 3], b: 'test', a: 1 }; // Same as obj1 but different order
    const differentObj = { a: 2, b: 'test', c: [1, 2, 3] };

    const hash1 = await sha256Object(obj1);
    const hash2 = await sha256Object(obj2);
    const hash3 = await sha256Object(differentObj);

    expect(hash1).toBe(hash2); // Same content, different order
    expect(hash1).not.toBe(hash3); // Different content
  });

  // Test file hashing (mocked for both environments)
  it('should generate hashes for file-like objects', async () => {
    const content = 'test file content';
    
    if (typeof window === 'undefined') {
      // Node.js environment - test with file path
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const tempFile = path.join(__dirname, 'test-file.txt');
      await fs.writeFile(tempFile, content);
      
      try {
        const hash = await sha256File(tempFile);
        const expectedHash = await sha256(content);
        expect(hash).toBe(expectedHash);
      } finally {
        await fs.unlink(tempFile);
      }
    } else {
      // Browser environment - test with Blob
      const blob = new Blob([content]);
      const hash = await sha256File(blob);
      const expectedHash = await sha256(content);
      expect(hash).toBe(expectedHash);
    }
  });

  // Test sync hashing (Node.js only)
  if (sha256Sync) {
    it('should support synchronous hashing in Node.js', () => {
      const testString = 'test sync';
      const hash = sha256Sync(testString);
      expect(hash).toMatch(/^[a-f0-9]{64}$/); // Should be a valid SHA-256 hash
    });
  }
});
