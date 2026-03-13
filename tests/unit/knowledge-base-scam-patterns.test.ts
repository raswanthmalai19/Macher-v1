import * as fs from 'fs';
import * as path from 'path';

/**
 * Example 2: Knowledge Base Scam Patterns
 * 
 * Verify Knowledge Base contains IRS, tech support, grandparent, romance scam documents
 * with fraud indicators.
 * 
 * Validates: Requirements 4.3, 11.1, 11.5
 */
describe('Example 2: Knowledge Base Scam Patterns', () => {
  const knowledgeBasePath = path.join(__dirname, '../../knowledge-base/scam-patterns');

  test('Knowledge Base contains all required scam pattern documents', () => {
    const requiredDocuments = [
      'irs-scams.md',
      'tech-support-scams.md',
      'grandparent-scams.md',
      'romance-scams.md',
      'fraud-indicators.md',
    ];

    for (const document of requiredDocuments) {
      const filePath = path.join(knowledgeBasePath, document);
      
      // Requirement 11.1: Verify document exists
      expect(fs.existsSync(filePath)).toBe(true);
      
      // Verify document is readable and not empty
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content.length).toBeGreaterThan(0);
    }
  });

  test('IRS scam document contains required fraud indicators', () => {
    const filePath = path.join(knowledgeBasePath, 'irs-scams.md');
    const content = fs.readFileSync(filePath, 'utf-8').toLowerCase();

    // Requirement 4.3, 11.5: Verify IRS scam patterns and fraud indicators
    expect(content).toContain('irs');
    expect(content).toContain('tax');
    
    // Common IRS scam indicators
    const indicators = [
      'urgency',
      'payment',
      'threat',
      'arrest',
      'legal action',
    ];

    // At least some of these indicators should be present
    const foundIndicators = indicators.filter(indicator => content.includes(indicator));
    expect(foundIndicators.length).toBeGreaterThan(0);
  });

  test('Tech support scam document contains required fraud indicators', () => {
    const filePath = path.join(knowledgeBasePath, 'tech-support-scams.md');
    const content = fs.readFileSync(filePath, 'utf-8').toLowerCase();

    // Requirement 4.3, 11.5: Verify tech support scam patterns
    expect(content).toContain('tech');
    
    // Common tech support scam indicators
    const indicators = [
      'virus',
      'computer',
      'remote',
      'access',
      'microsoft',
      'windows',
      'refund',
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));
    expect(foundIndicators.length).toBeGreaterThan(0);
  });

  test('Grandparent scam document contains required fraud indicators', () => {
    const filePath = path.join(knowledgeBasePath, 'grandparent-scams.md');
    const content = fs.readFileSync(filePath, 'utf-8').toLowerCase();

    // Requirement 4.3, 11.5: Verify grandparent scam patterns
    expect(content).toContain('grandparent');
    
    // Common grandparent scam indicators
    const indicators = [
      'emergency',
      'bail',
      'accident',
      'trouble',
      'money',
      'urgent',
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));
    expect(foundIndicators.length).toBeGreaterThan(0);
  });

  test('Romance scam document contains required fraud indicators', () => {
    const filePath = path.join(knowledgeBasePath, 'romance-scams.md');
    const content = fs.readFileSync(filePath, 'utf-8').toLowerCase();

    // Requirement 4.3, 11.5: Verify romance scam patterns
    expect(content).toContain('romance');
    
    // Common romance scam indicators
    const indicators = [
      'love',
      'relationship',
      'money',
      'investment',
      'emergency',
      'financial',
    ];

    const foundIndicators = indicators.filter(indicator => content.includes(indicator));
    expect(foundIndicators.length).toBeGreaterThan(0);
  });

  test('Fraud indicators document contains all required indicator types', () => {
    const filePath = path.join(knowledgeBasePath, 'fraud-indicators.md');
    const content = fs.readFileSync(filePath, 'utf-8').toLowerCase();

    // Requirement 11.5: Verify fraud indicators document contains key indicator types
    const requiredIndicators = [
      'urgency',
      'payment',
      'impersonation',
      'threat',
    ];

    for (const indicator of requiredIndicators) {
      expect(content).toContain(indicator);
    }
  });

  test('Knowledge Base documents contain no PII', () => {
    // Requirement 11.3: Verify no PII in Knowledge Base documents
    const documents = [
      'irs-scams.md',
      'tech-support-scams.md',
      'grandparent-scams.md',
      'romance-scams.md',
      'fraud-indicators.md',
    ];

    // Common PII patterns to check for (excluding legitimate public service numbers)
    const piiPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN format
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i, // Email format
      /\b\d{1,5}\s+\w+\s+(street|st|avenue|ave|road|rd|drive|dr|lane|ln)\b/i, // Street address
    ];

    // Legitimate public service numbers to exclude (like IRS hotline)
    const legitimateNumbers = [
      '1-800-366-4484', // IRS fraud reporting hotline
      '800-366-4484',
    ];

    for (const document of documents) {
      const filePath = path.join(knowledgeBasePath, document);
      let content = fs.readFileSync(filePath, 'utf-8');

      // Remove legitimate public service numbers before checking
      for (const legitNumber of legitimateNumbers) {
        content = content.replace(new RegExp(legitNumber, 'g'), '');
      }

      // Check for PII patterns
      for (const pattern of piiPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          // If we find potential PII, fail the test
          throw new Error(`Found potential PII in ${document}: ${matches[0]}`);
        }
      }
    }
  });

  test('Knowledge Base documents are properly formatted markdown', () => {
    const documents = [
      'irs-scams.md',
      'tech-support-scams.md',
      'grandparent-scams.md',
      'romance-scams.md',
      'fraud-indicators.md',
    ];

    for (const document of documents) {
      const filePath = path.join(knowledgeBasePath, document);
      const content = fs.readFileSync(filePath, 'utf-8');

      // Verify markdown structure (should have headers)
      expect(content).toMatch(/^#/m); // Should have at least one header
      
      // Verify reasonable content length (not just a stub)
      expect(content.length).toBeGreaterThan(100);
    }
  });

  test('Knowledge Base documents contain actionable fraud detection guidance', () => {
    const documents = [
      'irs-scams.md',
      'tech-support-scams.md',
      'grandparent-scams.md',
      'romance-scams.md',
    ];

    for (const document of documents) {
      const filePath = path.join(knowledgeBasePath, document);
      const content = fs.readFileSync(filePath, 'utf-8').toLowerCase();

      // Each scam document should contain guidance keywords
      const guidanceKeywords = [
        'scam',
        'fraud',
        'indicator',
        'pattern',
        'tactic',
      ];

      const foundKeywords = guidanceKeywords.filter(keyword => content.includes(keyword));
      expect(foundKeywords.length).toBeGreaterThan(0);
    }
  });
});
