/**
 * Unit Tests for DocumentationGenerator
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6
 */

import { DocumentationGenerator } from '../../../pipeline/docs/DocumentationGenerator';

describe('DocumentationGenerator Unit Tests', () => {
  let generator: DocumentationGenerator;

  beforeEach(() => {
    generator = new DocumentationGenerator();
  });

  test('should generate API docs from OpenAPI spec', async () => {
    const docs = await generator.generateAPIDocumentation('openapi.yaml');
    expect(docs.success).toBe(true);
    expect(docs.outputPath).toBeDefined();
  });

  test('should generate architecture diagrams', async () => {
    const diagrams = await generator.generateArchitectureDiagrams();
    expect(diagrams.success).toBe(true);
  });

  test('should include metadata in generated docs', () => {
    const doc = generator.generateWithMetadata('Content', 'v1.0.0');
    expect(doc.metadata.version).toBe('v1.0.0');
    expect(doc.metadata.timestamp).toBeDefined();
  });
});
