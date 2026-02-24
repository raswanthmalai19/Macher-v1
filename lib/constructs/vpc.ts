import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { EnvironmentConfig } from '../config/types';

/**
 * VPC Construct for VocalShield
 * 
 * Creates a VPC with public and private subnets, designed for future
 * Wavelength Zone integration. The VPC includes:
 * - Public subnet (10.0.1.0/24) for future NAT or bastion hosts
 * - Private subnet (10.0.2.0/24) for Lambda functions in VPC
 * - Reserved CIDR (10.0.10.0/24) for future Wavelength Zone
 * - DynamoDB Gateway VPC endpoint (free) for cost optimization
 * - No NAT Gateway to stay within Free Tier
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.6
 */
export class VpcConstruct extends Construct {
  public readonly vpc: ec2.Vpc;
  public readonly publicSubnet: ec2.ISubnet;
  public readonly privateSubnet: ec2.ISubnet;
  public readonly dynamoDbEndpoint: ec2.GatewayVpcEndpoint;

  constructor(scope: Construct, id: string, config: EnvironmentConfig) {
    super(scope, id);

    // Create VPC with specified CIDR block
    // Note: We explicitly define subnets to control CIDR allocation
    // and reserve space for future Wavelength Zone subnet
    this.vpc = new ec2.Vpc(this, 'VocalShieldVpc', {
      ipAddresses: ec2.IpAddresses.cidr(config.vpcCidr),
      maxAzs: config.maxAzs,
      natGateways: 0, // No NAT Gateway to avoid costs
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24, // Creates 10.0.1.0/24
        },
        {
          name: 'Private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24, // Creates 10.0.2.0/24
        }
      ],
      enableDnsHostnames: true,
      enableDnsSupport: true,
    });

    // Get references to the created subnets
    // Note: CDK creates subnets across multiple AZs, we'll use the first one
    this.publicSubnet = this.vpc.publicSubnets[0];
    this.privateSubnet = this.vpc.isolatedSubnets[0];

    // Add DynamoDB Gateway VPC Endpoint (free)
    // This allows Lambda functions in VPC to access DynamoDB without NAT Gateway
    this.dynamoDbEndpoint = this.vpc.addGatewayEndpoint('DynamoDbEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
      subnets: [
        {
          subnets: this.vpc.isolatedSubnets,
        }
      ]
    });

    // Add tags to VPC and subnets
    cdk.Tags.of(this.vpc).add('Name', `${config.stackName}-VPC`);
    cdk.Tags.of(this.vpc).add('WavelengthReady', 'true');
    
    // Tag subnets for identification
    this.vpc.publicSubnets.forEach((subnet, index) => {
      cdk.Tags.of(subnet).add('Name', `${config.stackName}-Public-${index + 1}`);
    });
    
    this.vpc.isolatedSubnets.forEach((subnet, index) => {
      cdk.Tags.of(subnet).add('Name', `${config.stackName}-Private-${index + 1}`);
    });

    // Add CFN output for reserved Wavelength CIDR (documentation only)
    new cdk.CfnOutput(this, 'ReservedWavelengthCidr', {
      value: config.wavelengthSubnetCidr,
      description: 'Reserved CIDR block for future Wavelength Zone subnet',
      exportName: `${config.stackName}-WavelengthCidr`,
    });

    // Output VPC ID for reference
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
      exportName: `${config.stackName}-VpcId`,
    });

    // Output DynamoDB endpoint ID
    new cdk.CfnOutput(this, 'DynamoDbEndpointId', {
      value: this.dynamoDbEndpoint.vpcEndpointId,
      description: 'DynamoDB Gateway VPC Endpoint ID',
      exportName: `${config.stackName}-DynamoDbEndpointId`,
    });
  }
}
