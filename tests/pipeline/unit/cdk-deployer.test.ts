import { CDKDeployer } from '../../../pipeline/deploy/CDKDeployer';
import { BootstrapChecker } from '../../../pipeline/deploy/BootstrapChecker';
import { execSync } from 'child_process';

jest.mock('child_process');
jest.mock('fs');

const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('CDKDeployer', () => {
  let cdkDeployer: CDKDeployer;

  beforeEach(() => {
    cdkDeployer = new CDKDeployer();
    jest.clearAllMocks();
  });

  describe('bootstrap', () => {
    it('should successfully bootstrap an account/region', async () => {
      mockExecSync.mockReturnValue('Bootstrap version: 21\n');

      const result = await cdkDeployer.bootstrap('123456789012', 'us-east-1');

      expect(result.success).toBe(true);
      expect(result.version).toBeGreaterThan(0);
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('cdk bootstrap aws://123456789012/us-east-1'),
        expect.any(Object)
      );
    });

    it('should handle bootstrap failure', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Bootstrap failed');
      });

      const result = await cdkDeployer.bootstrap('123456789012', 'us-east-1');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.version).toBe(0);
    });
  });

  describe('synthesize', () => {
    it('should synthesize valid CloudFormation template', async () => {
      const mockTemplate = {
        Resources: {
          MyFunction: {
            Type: 'AWS::Lambda::Function',
          },
        },
      };

      mockExecSync.mockReturnValue(JSON.stringify(mockTemplate));

      const result = await cdkDeployer.synthesize('VocalShield-Dev', {
        environment: 'dev',
      });

      expect(result).toEqual(mockTemplate);
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('cdk synth VocalShield-Dev'),
        expect.any(Object)
      );
    });

    it('should throw error on invalid CDK code', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Synthesis failed');
      });

      await expect(
        cdkDeployer.synthesize('VocalShield-Dev', { environment: 'dev' })
      ).rejects.toThrow('Failed to synthesize CDK stack');
    });

    it('should pass context values to synthesis', async () => {
      const mockTemplate = { Resources: {} };
      mockExecSync.mockReturnValue(JSON.stringify(mockTemplate));

      await cdkDeployer.synthesize('VocalShield-Dev', {
        environment: 'dev',
        region: 'us-east-1',
      });

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--context environment="dev"'),
        expect.any(Object)
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--context region="us-east-1"'),
        expect.any(Object)
      );
    });
  });

  describe('deploy', () => {
    it('should deploy with auto-approval for non-production', async () => {
      mockExecSync.mockReturnValue('Deployment successful\n');

      const result = await cdkDeployer.deploy(
        'VocalShield-Dev',
        { environment: 'dev' },
        false
      );

      expect(result.success).toBe(true);
      expect(result.stackName).toBe('VocalShield-Dev');
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--require-approval never'),
        expect.any(Object)
      );
    });

    it('should require manual approval for production', async () => {
      mockExecSync.mockReturnValue('Deployment successful\n');

      await cdkDeployer.deploy(
        'VocalShield-Prod',
        { environment: 'production' },
        true
      );

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('--require-approval any-change'),
        expect.any(Object)
      );
    });

    it('should handle deployment failure', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Deployment failed');
      });

      const result = await cdkDeployer.deploy(
        'VocalShield-Dev',
        { environment: 'dev' },
        false
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should include deployment duration', async () => {
      mockExecSync.mockReturnValue('Deployment successful\n');

      const result = await cdkDeployer.deploy(
        'VocalShield-Dev',
        { environment: 'dev' },
        false
      );

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('diff', () => {
    it('should generate changeset with additions', async () => {
      const diffOutput = `
Stack VocalShield-Dev
[+] AWS::Lambda::Function MyFunction
[+] AWS::DynamoDB::Table MyTable
      `;

      mockExecSync.mockReturnValue(diffOutput);

      const result = await cdkDeployer.diff('VocalShield-Dev', {
        environment: 'dev',
      });

      expect(result.stackName).toBe('VocalShield-Dev');
      expect(result.changes).toHaveLength(2);
      expect(result.changes[0].action).toBe('Add');
      expect(result.changes[0].resourceType).toBe('AWS::Lambda::Function');
    });

    it('should detect removals requiring approval', async () => {
      const diffOutput = `
Stack VocalShield-Dev
[-] AWS::Lambda::Function OldFunction
      `;

      mockExecSync.mockReturnValue(diffOutput);

      const result = await cdkDeployer.diff('VocalShield-Dev', {
        environment: 'dev',
      });

      expect(result.requiresApproval).toBe(true);
      expect(result.changes[0].action).toBe('Remove');
    });

    it('should detect modifications with replacement', async () => {
      const diffOutput = `
Stack VocalShield-Dev
[~] AWS::Lambda::Function MyFunction (replacement)
      `;

      mockExecSync.mockReturnValue(diffOutput);

      const result = await cdkDeployer.diff('VocalShield-Dev', {
        environment: 'dev',
      });

      expect(result.changes[0].action).toBe('Modify');
      expect(result.changes[0].replacement).toBe(true);
      expect(result.requiresApproval).toBe(true);
    });

    it('should return empty changeset on error', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Diff failed');
      });

      const result = await cdkDeployer.diff('VocalShield-Dev', {
        environment: 'dev',
      });

      expect(result.changes).toHaveLength(0);
      expect(result.requiresApproval).toBe(false);
    });
  });

  describe('rollback', () => {
    it('should successfully rollback a stack', async () => {
      mockExecSync.mockReturnValue('Rollback initiated\n');

      const result = await cdkDeployer.rollback('VocalShield-Dev', 'v1.0.0');

      expect(result.success).toBe(true);
      expect(result.previousVersion).toBe('v1.0.0');
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('rollback-stack'),
        expect.any(Object)
      );
      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('wait stack-rollback-complete'),
        expect.any(Object)
      );
    });

    it('should handle rollback failure', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Rollback failed');
      });

      const result = await cdkDeployer.rollback('VocalShield-Dev', 'v1.0.0');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('detectDrift', () => {
    it('should detect no drift when stack is in sync', async () => {
      mockExecSync
        .mockReturnValueOnce('drift-detection-id-123\n') // detect-stack-drift
        .mockReturnValueOnce('') // wait
        .mockReturnValueOnce('IN_SYNC\n'); // describe-stack-drift-detection-status

      const result = await cdkDeployer.detectDrift('VocalShield-Dev');

      expect(result.driftStatus).toBe('IN_SYNC');
      expect(result.driftedResources).toHaveLength(0);
    });

    it('should detect drifted resources', async () => {
      const driftedResourcesOutput = JSON.stringify([
        {
          LogicalResourceId: 'MyFunction',
          PhysicalResourceId: 'my-function-abc123',
          ResourceType: 'AWS::Lambda::Function',
          StackResourceDriftStatus: 'MODIFIED',
          PropertyDifferences: [
            {
              PropertyPath: '/MemorySize',
              ExpectedValue: '512',
              ActualValue: '1024',
              DifferenceType: 'NOT_EQUAL',
            },
          ],
        },
      ]);

      mockExecSync
        .mockReturnValueOnce('drift-detection-id-123\n')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('DRIFTED\n')
        .mockReturnValueOnce(driftedResourcesOutput);

      const result = await cdkDeployer.detectDrift('VocalShield-Dev');

      expect(result.driftStatus).toBe('DRIFTED');
      expect(result.driftedResources).toHaveLength(1);
      expect(result.driftedResources[0].logicalResourceId).toBe('MyFunction');
      expect(result.driftedResources[0].propertyDifferences).toHaveLength(1);
    });

    it('should handle drift detection failure', async () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Drift detection failed');
      });

      const result = await cdkDeployer.detectDrift('VocalShield-Dev');

      expect(result.driftStatus).toBe('UNKNOWN');
      expect(result.driftedResources).toHaveLength(0);
    });
  });
});
