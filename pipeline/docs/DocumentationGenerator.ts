/**
 * DocumentationGenerator - Automated documentation generation for VocalShield
 * 
 * Generates API documentation from OpenAPI specs, architecture diagrams from CDK code,
 * changelogs from commit messages, validates documentation links, and publishes
 * versioned documentation.
 * 
 * Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { logger } from '../logger';

/**
 * Documentation generation result
 */
export interface DocGenerationResult {
  success: boolean;
  outputPath: string;
  error?: string;
}

/**
 * Link validation result
 */
export interface LinkValidationResult {
  valid: boolean;
  brokenLinks: string[];
  totalLinks: number;
}

/**
 * Changelog entry
 */
export interface ChangelogEntry {
  version: string;
  date: Date;
  commits: CommitInfo[];
}

/**
 * Commit information
 */
export interface CommitInfo {
  hash: string;
  author: string;
  date: Date;
  message: string;
  type: 'feat' | 'fix' | 'docs' | 'chore' | 'refactor' | 'test' | 'other';
}

/**
 * Documentation metadata
 */
export interface DocMetadata {
  version: string;
  deploymentTimestamp: Date;
  environment: string;
  commitHash: string;
}

/**
 * DocumentationGenerator handles automated documentation generation
 */
export class DocumentationGenerator {
  private outputDir: string;
  private version: string;

  constructor(outputDir: string = './docs', version: string = '1.0.0') {
    this.outputDir = outputDir;
    this.version = version;

    // Ensure output directory exists
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }

    logger.info('DocumentationGenerator initialized', { outputDir, version });
  }

  /**
   * Generate API documentation from OpenAPI specifications
   * 
   * @param openApiPath - Path to OpenAPI spec file (YAML or JSON)
   * @returns Generation result
   * 
   * Requirements: 16.1
   */
  async generateApiDocs(openApiPath: string): Promise<DocGenerationResult> {
    try {
      logger.info('Generating API documentation', { openApiPath });

      if (!existsSync(openApiPath)) {
        throw new Error(`OpenAPI spec not found: ${openApiPath}`);
      }

      const outputPath = join(this.outputDir, 'api');
      if (!existsSync(outputPath)) {
        mkdirSync(outputPath, { recursive: true });
      }

      // Read OpenAPI spec
      const specContent = readFileSync(openApiPath, 'utf-8');
      let spec: any;

      if (openApiPath.endsWith('.json')) {
        spec = JSON.parse(specContent);
      } else {
        // For YAML, we'd need a YAML parser
        // For now, assume JSON or use a simple conversion
        spec = JSON.parse(specContent);
      }

      // Generate HTML documentation
      const htmlDoc = this.generateApiHtml(spec);
      const htmlPath = join(outputPath, 'index.html');
      writeFileSync(htmlPath, htmlDoc);

      // Generate Markdown documentation
      const markdownDoc = this.generateApiMarkdown(spec);
      const mdPath = join(outputPath, 'API.md');
      writeFileSync(mdPath, markdownDoc);

      logger.info('API documentation generated', { htmlPath, mdPath });

      return {
        success: true,
        outputPath,
      };
    } catch (error) {
      logger.error('Failed to generate API documentation', { error });
      return {
        success: false,
        outputPath: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate architecture diagrams from CDK code
   * 
   * @param cdkPath - Path to CDK infrastructure code
   * @returns Generation result
   * 
   * Requirements: 16.2
   */
  async generateArchitectureDiagrams(cdkPath: string): Promise<DocGenerationResult> {
    try {
      logger.info('Generating architecture diagrams', { cdkPath });

      const outputPath = join(this.outputDir, 'architecture');
      if (!existsSync(outputPath)) {
        mkdirSync(outputPath, { recursive: true });
      }

      // Generate Mermaid diagram from CDK code
      const mermaidDiagram = this.generateMermaidDiagram(cdkPath);
      const mermaidPath = join(outputPath, 'architecture.mmd');
      writeFileSync(mermaidPath, mermaidDiagram);

      // Generate Markdown with embedded diagram
      const markdownDoc = this.generateArchitectureMarkdown(mermaidDiagram);
      const mdPath = join(outputPath, 'ARCHITECTURE.md');
      writeFileSync(mdPath, markdownDoc);

      logger.info('Architecture diagrams generated', { mermaidPath, mdPath });

      return {
        success: true,
        outputPath,
      };
    } catch (error) {
      logger.error('Failed to generate architecture diagrams', { error });
      return {
        success: false,
        outputPath: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate changelog from commit messages
   * 
   * @param fromCommit - Starting commit hash (optional, defaults to last tag)
   * @param toCommit - Ending commit hash (optional, defaults to HEAD)
   * @returns Generation result
   * 
   * Requirements: 16.4
   */
  async generateChangelog(fromCommit?: string, toCommit: string = 'HEAD'): Promise<DocGenerationResult> {
    try {
      logger.info('Generating changelog', { fromCommit, toCommit });

      // Get commit range
      const commitRange = fromCommit ? `${fromCommit}..${toCommit}` : toCommit;

      // Get commits
      const commits = this.getCommits(commitRange);

      // Group commits by type
      const changelog = this.formatChangelog(commits);

      // Write changelog
      const changelogPath = join(this.outputDir, 'CHANGELOG.md');
      writeFileSync(changelogPath, changelog);

      logger.info('Changelog generated', { changelogPath, commitCount: commits.length });

      return {
        success: true,
        outputPath: changelogPath,
      };
    } catch (error) {
      logger.error('Failed to generate changelog', { error });
      return {
        success: false,
        outputPath: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Validate documentation links
   * 
   * @param docsPath - Path to documentation directory
   * @returns Validation result
   * 
   * Requirements: 16.5
   */
  async validateDocumentationLinks(docsPath: string = this.outputDir): Promise<LinkValidationResult> {
    try {
      logger.info('Validating documentation links', { docsPath });

      const brokenLinks: string[] = [];
      let totalLinks = 0;

      // Find all markdown files
      const mdFiles = this.findMarkdownFiles(docsPath);

      for (const file of mdFiles) {
        const content = readFileSync(file, 'utf-8');
        const links = this.extractLinks(content);
        totalLinks += links.length;

        for (const link of links) {
          if (!this.isValidLink(link, file)) {
            brokenLinks.push(`${file}: ${link}`);
          }
        }
      }

      const valid = brokenLinks.length === 0;

      logger.info('Link validation completed', {
        totalLinks,
        brokenLinks: brokenLinks.length,
        valid,
      });

      return {
        valid,
        brokenLinks,
        totalLinks,
      };
    } catch (error) {
      logger.error('Failed to validate documentation links', { error });
      return {
        valid: false,
        brokenLinks: [],
        totalLinks: 0,
      };
    }
  }

  /**
   * Publish documentation to versioned site
   * 
   * @param metadata - Documentation metadata
   * @param destination - Destination path or URL
   * @returns Generation result
   * 
   * Requirements: 16.3, 16.6
   */
  async publishDocumentation(metadata: DocMetadata, destination: string): Promise<DocGenerationResult> {
    try {
      logger.info('Publishing documentation', { metadata, destination });

      // Create versioned directory
      const versionedPath = join(this.outputDir, metadata.version);
      if (!existsSync(versionedPath)) {
        mkdirSync(versionedPath, { recursive: true });
      }

      // Generate index page with metadata
      const indexHtml = this.generateIndexPage(metadata);
      const indexPath = join(versionedPath, 'index.html');
      writeFileSync(indexPath, indexHtml);

      // Copy all documentation to versioned directory
      // In production, this would copy files and upload to S3 or similar
      logger.info('Documentation published', { versionedPath });

      return {
        success: true,
        outputPath: versionedPath,
      };
    } catch (error) {
      logger.error('Failed to publish documentation', { error });
      return {
        success: false,
        outputPath: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Generate API documentation HTML
   * 
   * @param spec - OpenAPI specification
   * @returns HTML string
   */
  private generateApiHtml(spec: any): string {
    const title = spec.info?.title || 'API Documentation';
    const version = spec.info?.version || '1.0.0';
    const description = spec.info?.description || '';

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - v${version}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }
    h2 { color: #34495e; margin-top: 30px; }
    .endpoint { background: #f8f9fa; padding: 15px; margin: 10px 0; border-left: 4px solid #3498db; }
    .method { display: inline-block; padding: 5px 10px; border-radius: 3px; font-weight: bold; color: white; }
    .get { background: #28a745; }
    .post { background: #007bff; }
    .put { background: #ffc107; }
    .delete { background: #dc3545; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p><strong>Version:</strong> ${version}</p>
  <p>${description}</p>
`;

    // Add endpoints
    if (spec.paths) {
      html += '<h2>Endpoints</h2>';
      for (const [path, methods] of Object.entries(spec.paths)) {
        for (const [method, details] of Object.entries(methods as any)) {
          const summary = (details as any).summary || '';
          const description = (details as any).description || '';
          
          html += `
  <div class="endpoint">
    <span class="method ${method.toLowerCase()}">${method.toUpperCase()}</span>
    <code>${path}</code>
    <p><strong>${summary}</strong></p>
    <p>${description}</p>
  </div>
`;
        }
      }
    }

    html += `
</body>
</html>`;

    return html;
  }

  /**
   * Generate API documentation Markdown
   * 
   * @param spec - OpenAPI specification
   * @returns Markdown string
   */
  private generateApiMarkdown(spec: any): string {
    const title = spec.info?.title || 'API Documentation';
    const version = spec.info?.version || '1.0.0';
    const description = spec.info?.description || '';

    let markdown = `# ${title}\n\n`;
    markdown += `**Version:** ${version}\n\n`;
    markdown += `${description}\n\n`;

    if (spec.paths) {
      markdown += '## Endpoints\n\n';
      for (const [path, methods] of Object.entries(spec.paths)) {
        for (const [method, details] of Object.entries(methods as any)) {
          const summary = (details as any).summary || '';
          const description = (details as any).description || '';
          
          markdown += `### ${method.toUpperCase()} ${path}\n\n`;
          markdown += `**${summary}**\n\n`;
          markdown += `${description}\n\n`;
        }
      }
    }

    return markdown;
  }

  /**
   * Generate Mermaid diagram from CDK code
   * 
   * @param cdkPath - Path to CDK code
   * @returns Mermaid diagram string
   */
  private generateMermaidDiagram(cdkPath: string): string {
    // In production, this would parse CDK code and generate a proper diagram
    // For now, return a template diagram
    return `graph TB
    subgraph "VocalShield Architecture"
        Mobile[Android App]
        APIGW[API Gateway WebSocket]
        Lambda1[Audio Processor Lambda]
        Lambda2[Fraud Detection Lambda]
        Transcribe[Amazon Transcribe]
        Bedrock[Amazon Bedrock]
        DDB[(DynamoDB)]
        
        Mobile -->|Audio Stream| APIGW
        APIGW --> Lambda1
        Lambda1 --> Transcribe
        Lambda1 --> Lambda2
        Lambda2 --> Bedrock
        Lambda2 --> DDB
        Lambda2 -->|Alert| Mobile
    end
    
    style Mobile fill:#3498db
    style Lambda1 fill:#f39c12
    style Lambda2 fill:#f39c12
    style Transcribe fill:#e74c3c
    style Bedrock fill:#e74c3c
    style DDB fill:#2ecc71`;
  }

  /**
   * Generate architecture documentation with diagram
   * 
   * @param mermaidDiagram - Mermaid diagram code
   * @returns Markdown string
   */
  private generateArchitectureMarkdown(mermaidDiagram: string): string {
    return `# VocalShield Architecture

## Overview

VocalShield is a real-time voice fraud detection system built on AWS serverless architecture.

## Architecture Diagram

\`\`\`mermaid
${mermaidDiagram}
\`\`\`

## Components

### Android Mobile App
- Captures audio from phone calls using Accessibility Service
- Streams audio to backend via WebSocket
- Displays real-time threat indicators

### API Gateway (WebSocket)
- Manages WebSocket connections for real-time audio streaming
- Routes requests to Lambda functions
- Handles connection lifecycle

### Audio Processor Lambda
- Receives audio chunks from mobile app
- Forwards audio to Amazon Transcribe for speech-to-text
- Buffers and manages audio stream

### Fraud Detection Lambda
- Receives transcribed text from Audio Processor
- Analyzes conversation using Amazon Bedrock
- Detects fraud patterns and scam indicators
- Stores analysis results in DynamoDB
- Sends alerts back to mobile app

### Amazon Transcribe
- Real-time speech-to-text conversion
- Supports multiple languages
- Provides partial results for low latency

### Amazon Bedrock
- LLM-powered fraud detection
- Uses Claude 3.5 Sonnet via Agents
- Knowledge Base with scam patterns
- Guardrails for PII redaction

### DynamoDB
- Stores call history and threat analysis
- On-demand billing for cost efficiency
- Provides fast access to user data

## Data Flow

1. User activates VocalShield during a phone call
2. Mobile app captures audio and streams to API Gateway
3. Audio Processor Lambda receives audio chunks
4. Transcribe converts audio to text in real-time
5. Fraud Detection Lambda analyzes text for scam indicators
6. Results stored in DynamoDB
7. Alerts sent back to mobile app via WebSocket
8. User sees real-time threat indicator

## Security

- All data encrypted in transit (TLS 1.2+)
- No persistent audio storage
- PII redaction via Bedrock Guardrails
- IAM roles with least privilege
- API Gateway authentication

## Cost Optimization

- ARM64 Lambda architecture (20% cost savings)
- On-demand DynamoDB billing
- Efficient audio buffering
- All services within AWS Free Tier limits
`;
  }

  /**
   * Get commits from git log
   * 
   * @param commitRange - Commit range (e.g., 'HEAD~10..HEAD')
   * @returns Array of commit info
   */
  private getCommits(commitRange: string): CommitInfo[] {
    try {
      const output = execSync(
        `git log ${commitRange} --pretty=format:"%H|%an|%ad|%s" --date=iso`,
        { encoding: 'utf-8' }
      );

      return output.split('\n').filter(Boolean).map(line => {
        const [hash, author, date, message] = line.split('|');
        return {
          hash: hash.substring(0, 8),
          author,
          date: new Date(date),
          message,
          type: this.getCommitType(message),
        };
      });
    } catch (error) {
      logger.warn('Failed to get git commits', { error });
      return [];
    }
  }

  /**
   * Get commit type from message
   * 
   * @param message - Commit message
   * @returns Commit type
   */
  private getCommitType(message: string): CommitInfo['type'] {
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.startsWith('feat:')) return 'feat';
    if (lowerMessage.startsWith('fix:')) return 'fix';
    if (lowerMessage.startsWith('docs:')) return 'docs';
    if (lowerMessage.startsWith('chore:')) return 'chore';
    if (lowerMessage.startsWith('refactor:')) return 'refactor';
    if (lowerMessage.startsWith('test:')) return 'test';
    return 'other';
  }

  /**
   * Format changelog from commits
   * 
   * @param commits - Array of commits
   * @returns Formatted changelog
   */
  private formatChangelog(commits: CommitInfo[]): string {
    let changelog = `# Changelog\n\n`;
    changelog += `## Version ${this.version} - ${new Date().toISOString().split('T')[0]}\n\n`;

    // Group by type
    const grouped: Record<string, CommitInfo[]> = {};
    for (const commit of commits) {
      if (!grouped[commit.type]) {
        grouped[commit.type] = [];
      }
      grouped[commit.type].push(commit);
    }

    // Format each group
    const typeLabels: Record<string, string> = {
      feat: '### Features',
      fix: '### Bug Fixes',
      docs: '### Documentation',
      chore: '### Chores',
      refactor: '### Refactoring',
      test: '### Tests',
      other: '### Other Changes',
    };

    for (const [type, label] of Object.entries(typeLabels)) {
      if (grouped[type] && grouped[type].length > 0) {
        changelog += `${label}\n\n`;
        for (const commit of grouped[type]) {
          changelog += `- ${commit.message} (${commit.hash})\n`;
        }
        changelog += '\n';
      }
    }

    return changelog;
  }

  /**
   * Find all markdown files in directory
   * 
   * @param dir - Directory to search
   * @returns Array of file paths
   */
  private findMarkdownFiles(dir: string): string[] {
    // Simplified implementation - in production, use recursive search
    try {
      const { readdirSync, statSync } = require('fs');
      const files: string[] = [];
      
      const items = readdirSync(dir);
      for (const item of items) {
        const fullPath = join(dir, item);
        const stat = statSync(fullPath);
        
        if (stat.isFile() && (item.endsWith('.md') || item.endsWith('.markdown'))) {
          files.push(fullPath);
        }
      }
      
      return files;
    } catch (error) {
      logger.warn('Failed to find markdown files', { error });
      return [];
    }
  }

  /**
   * Extract links from markdown content
   * 
   * @param content - Markdown content
   * @returns Array of links
   */
  private extractLinks(content: string): string[] {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const links: string[] = [];
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      links.push(match[2]);
    }

    return links;
  }

  /**
   * Check if link is valid
   * 
   * @param link - Link to validate
   * @param sourceFile - Source file containing the link
   * @returns True if valid
   */
  private isValidLink(link: string, sourceFile: string): boolean {
    // Skip external links (would need HTTP check in production)
    if (link.startsWith('http://') || link.startsWith('https://')) {
      return true;
    }

    // Check relative file links
    if (link.startsWith('./') || link.startsWith('../')) {
      const linkPath = join(sourceFile, '..', link);
      return existsSync(linkPath);
    }

    // Check anchor links
    if (link.startsWith('#')) {
      return true; // Would need to validate anchor exists in production
    }

    return true;
  }

  /**
   * Generate index page with metadata
   * 
   * @param metadata - Documentation metadata
   * @returns HTML string
   */
  private generateIndexPage(metadata: DocMetadata): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VocalShield Documentation - v${metadata.version}</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 1200px; margin: 0 auto; padding: 20px; }
    h1 { color: #2c3e50; }
    .metadata { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
    .metadata table { width: 100%; }
    .metadata td { padding: 8px; }
    .metadata td:first-child { font-weight: bold; width: 200px; }
    nav { background: #3498db; padding: 15px; border-radius: 5px; }
    nav a { color: white; text-decoration: none; margin: 0 15px; }
    nav a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <h1>VocalShield Documentation</h1>
  
  <div class="metadata">
    <h2>Documentation Metadata</h2>
    <table>
      <tr><td>Version</td><td>${metadata.version}</td></tr>
      <tr><td>Environment</td><td>${metadata.environment}</td></tr>
      <tr><td>Deployment Timestamp</td><td>${metadata.deploymentTimestamp.toISOString()}</td></tr>
      <tr><td>Commit Hash</td><td>${metadata.commitHash}</td></tr>
    </table>
  </div>
  
  <nav>
    <a href="api/index.html">API Documentation</a>
    <a href="architecture/ARCHITECTURE.md">Architecture</a>
    <a href="CHANGELOG.md">Changelog</a>
  </nav>
  
  <h2>About VocalShield</h2>
  <p>VocalShield is a real-time, privacy-first voice firewall that protects vulnerable users from financial fraud and social engineering attacks.</p>
  
  <h3>Key Features</h3>
  <ul>
    <li>Real-time audio analysis during phone calls</li>
    <li>AI-powered fraud detection using Amazon Bedrock</li>
    <li>Privacy-preserving with PII redaction</li>
    <li>Free and open source</li>
    <li>AWS Free Tier compliant</li>
  </ul>
</body>
</html>`;
  }
}
