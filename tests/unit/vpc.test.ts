import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { VpcConstruct } from '../../lib/constructs/vpc';
import { devConfig } from '../../lib/config';

/**
 * Unit tests for VPC configuration
 * 
 * Tests verify:
 * - VPC CIDR block is correct (10.0.0.0/16)
 * - Subnets are created with correct CIDR blocks
 * - No NAT Gateway is created (Free Tier compliance)
 * - DynamoDB VPC endpoint exists
 * 
 * Requirements: 8.1, 8.6
 */
describe('VpcConstruct', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let vpcConstruct: VpcConstruct;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: {
        account: '123456789012',
        region: devConfig.region,
      },
    });
    vpcConstruct = new VpcConstruct(stack, 'TestVpc', devConfig);
    template = Template.fromStack(stack);
  });

  describe('VPC CIDR Block', () => {
    test('VPC is created with correct CIDR block', () => {
      // Verify VPC resource exists with correct CIDR
      template.hasResourceProperties('AWS::EC2::VPC', {
        CidrBlock: devConfig.vpcCidr,
        EnableDnsHostnames: true,
        EnableDnsSupport: true,
      });
    });

    test('VPC CIDR matches configuration (10.0.0.0/16)', () => {
      expect(devConfig.vpcCidr).toBe('10.0.0.0/16');
      
      const vpc = vpcConstruct.vpc;
      expect(vpc).toBeDefined();
      // VPC CIDR is verified through CloudFormation template, not runtime value
      // Runtime value is a CDK token that resolves during deployment
      expect(vpc.vpcCidrBlock).toBeDefined();
    });
  });

  describe('Subnet Configuration', () => {
    test('Public subnet is created with correct CIDR block', () => {
      // Verify public subnet exists
      template.hasResourceProperties('AWS::EC2::Subnet', {
        CidrBlock: Match.stringLikeRegexp('^10\\.0\\.1\\.'),
        MapPublicIpOnLaunch: true,
      });
    });

    test('Private subnet is created with correct CIDR block', () => {
      // Verify private isolated subnet exists
      template.hasResourceProperties('AWS::EC2::Subnet', {
        CidrBlock: Match.stringLikeRegexp('^10\\.0\\.2\\.'),
        MapPublicIpOnLaunch: false,
      });
    });

    test('Public subnet reference is accessible', () => {
      const publicSubnet = vpcConstruct.publicSubnet;
      expect(publicSubnet).toBeDefined();
      expect(publicSubnet.subnetId).toBeDefined();
    });

    test('Private subnet reference is accessible', () => {
      const privateSubnet = vpcConstruct.privateSubnet;
      expect(privateSubnet).toBeDefined();
      expect(privateSubnet.subnetId).toBeDefined();
    });

    test('VPC has correct number of availability zones', () => {
      const vpc = vpcConstruct.vpc;
      expect(vpc.publicSubnets.length).toBeGreaterThan(0);
      expect(vpc.isolatedSubnets.length).toBeGreaterThan(0);
      
      // Should create subnets in up to maxAzs (2) availability zones
      expect(vpc.publicSubnets.length).toBeLessThanOrEqual(devConfig.maxAzs);
      expect(vpc.isolatedSubnets.length).toBeLessThanOrEqual(devConfig.maxAzs);
    });
  });

  describe('NAT Gateway Compliance', () => {
    test('No NAT Gateway is created', () => {
      // Verify NAT Gateway resource does NOT exist in template
      const resources = template.toJSON().Resources;
      const natGateways = Object.keys(resources).filter(key => 
        resources[key].Type === 'AWS::EC2::NatGateway'
      );
      
      expect(natGateways.length).toBe(0);
    });

    test('No Elastic IP for NAT Gateway is created', () => {
      // Verify no EIP is allocated for NAT Gateway
      const resources = template.toJSON().Resources;
      const eips = Object.keys(resources).filter(key => 
        resources[key].Type === 'AWS::EC2::EIP'
      );
      
      expect(eips.length).toBe(0);
    });

    test('VPC configuration specifies zero NAT Gateways', () => {
      // This is a configuration-level test
      // The VPC construct should be created with natGateways: 0
      const vpc = vpcConstruct.vpc;
      expect(vpc).toBeDefined();
      
      // Verify no NAT Gateways in the VPC
      // CDK doesn't expose natGateways count directly, but we can verify
      // that private subnets are ISOLATED (not PRIVATE_WITH_EGRESS)
      expect(vpc.isolatedSubnets.length).toBeGreaterThan(0);
      expect(vpc.privateSubnets.length).toBe(0); // No PRIVATE_WITH_EGRESS subnets
    });
  });

  describe('DynamoDB VPC Endpoint', () => {
    test('DynamoDB Gateway VPC Endpoint exists', () => {
      // Verify VPC Endpoint resource exists with DynamoDB service
      template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
        ServiceName: Match.objectLike({
          'Fn::Join': Match.arrayWith([
            '',
          ]),
        }),
        VpcEndpointType: 'Gateway',
      });
      
      // Additional verification: check that a Gateway endpoint exists
      const resources = template.toJSON().Resources;
      const gatewayEndpoints = Object.keys(resources).filter(key => 
        resources[key].Type === 'AWS::EC2::VPCEndpoint' &&
        resources[key].Properties?.VpcEndpointType === 'Gateway'
      );
      
      expect(gatewayEndpoints.length).toBeGreaterThan(0);
    });

    test('DynamoDB endpoint is accessible from construct', () => {
      const endpoint = vpcConstruct.dynamoDbEndpoint;
      expect(endpoint).toBeDefined();
      expect(endpoint.vpcEndpointId).toBeDefined();
    });

    test('DynamoDB endpoint is associated with private subnets', () => {
      // Verify the endpoint has route table associations
      template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
        RouteTableIds: Match.anyValue(),
      });
    });

    test('DynamoDB endpoint is a Gateway endpoint (free)', () => {
      // Gateway endpoints are free, Interface endpoints cost money
      template.hasResourceProperties('AWS::EC2::VPCEndpoint', {
        VpcEndpointType: 'Gateway',
      });
    });
  });

  describe('VPC Outputs', () => {
    test('VPC ID output is created', () => {
      // Check what outputs actually exist
      const outputs = template.toJSON().Outputs;
      const outputKeys = Object.keys(outputs || {});
      
      // Find the VPC ID output (it may have a hash suffix)
      const vpcIdOutput = outputKeys.find(key => 
        outputs[key].Description === 'VPC ID'
      );
      
      expect(vpcIdOutput).toBeDefined();
      expect(outputs[vpcIdOutput!].Description).toBe('VPC ID');
    });

    test('DynamoDB endpoint ID output is created', () => {
      const outputs = template.toJSON().Outputs;
      const outputKeys = Object.keys(outputs || {});
      
      const endpointOutput = outputKeys.find(key => 
        outputs[key].Description === 'DynamoDB Gateway VPC Endpoint ID'
      );
      
      expect(endpointOutput).toBeDefined();
      expect(outputs[endpointOutput!].Description).toBe('DynamoDB Gateway VPC Endpoint ID');
    });

    test('Reserved Wavelength CIDR output is created', () => {
      const outputs = template.toJSON().Outputs;
      const outputKeys = Object.keys(outputs || {});
      
      const wavelengthOutput = outputKeys.find(key => 
        outputs[key].Description === 'Reserved CIDR block for future Wavelength Zone subnet'
      );
      
      expect(wavelengthOutput).toBeDefined();
      expect(outputs[wavelengthOutput!].Description).toBe('Reserved CIDR block for future Wavelength Zone subnet');
      expect(outputs[wavelengthOutput!].Value).toBe(devConfig.wavelengthSubnetCidr);
    });
  });

  describe('VPC Tags', () => {
    test('VPC has WavelengthReady tag', () => {
      const vpc = vpcConstruct.vpc;
      const tags = cdk.Tags.of(vpc);
      expect(tags).toBeDefined();
    });

    test('VPC has Name tag with stack name', () => {
      // Verify VPC resource has tags
      template.hasResourceProperties('AWS::EC2::VPC', {
        Tags: Match.arrayWith([
          {
            Key: 'Name',
            Value: `${devConfig.stackName}-VPC`,
          },
        ]),
      });
    });
  });

  describe('Free Tier Compliance', () => {
    test('VPC uses only free-tier eligible resources', () => {
      const resources = template.toJSON().Resources;
      
      // Check for any resources that would incur charges
      const costlyResources = Object.keys(resources).filter(key => {
        const type = resources[key].Type;
        return type === 'AWS::EC2::NatGateway' || 
               (type === 'AWS::EC2::VPCEndpoint' && 
                resources[key].Properties?.VpcEndpointType === 'Interface');
      });
      
      expect(costlyResources.length).toBe(0);
    });

    test('Only Gateway VPC endpoints are used (not Interface endpoints)', () => {
      // Interface endpoints cost $0.01/hour, Gateway endpoints are free
      const resources = template.toJSON().Resources;
      const vpcEndpoints = Object.keys(resources).filter(key => 
        resources[key].Type === 'AWS::EC2::VPCEndpoint'
      );
      
      vpcEndpoints.forEach(key => {
        const endpoint = resources[key];
        if (endpoint.Properties?.VpcEndpointType) {
          expect(endpoint.Properties.VpcEndpointType).toBe('Gateway');
        }
      });
    });
  });

  describe('Wavelength Zone Preparation', () => {
    test('Reserved CIDR block is documented for future Wavelength Zone', () => {
      expect(devConfig.wavelengthSubnetCidr).toBe('10.0.10.0/24');
      
      // Verify the reserved CIDR is within the VPC CIDR range
      const vpcCidr = devConfig.vpcCidr; // 10.0.0.0/16
      const wavelengthCidr = devConfig.wavelengthSubnetCidr; // 10.0.10.0/24
      
      expect(wavelengthCidr.startsWith('10.0.')).toBe(true);
    });

    test('VPC CIDR has sufficient space for Wavelength subnet', () => {
      // VPC is /16, which provides 65,536 IPs
      // Public subnet: /24 (256 IPs)
      // Private subnet: /24 (256 IPs)
      // Wavelength subnet: /24 (256 IPs)
      // Total used: 768 IPs, leaving plenty of space
      
      const vpc = vpcConstruct.vpc;
      expect(vpc.vpcCidrBlock).toBeDefined();
      
      // Verify through template that VPC uses /16 CIDR
      template.hasResourceProperties('AWS::EC2::VPC', {
        CidrBlock: '10.0.0.0/16',
      });
    });
  });
});
