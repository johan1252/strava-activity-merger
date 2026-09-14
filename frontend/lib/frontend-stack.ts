import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const stage = (this.node.tryGetContext('stage') as string) ?? 'prod';
    const suffix = stage === 'prod' ? '' : `-${stage}`;

    const bucket = s3.Bucket.fromBucketName(
      this, 'ReactAppBucket',
      cdk.Fn.importValue(`FrontendS3BucketName${suffix}`),
    );

    const distribution = cloudfront.Distribution.fromDistributionAttributes(
      this, 'CloudFrontDistribution',
      {
        distributionId: cdk.Fn.importValue(`CloudFrontDistributionId${suffix}`),
        domainName: cdk.Fn.importValue(`CloudFrontDistributionDomainName${suffix}`),
      },
    );

    new s3deploy.BucketDeployment(this, 'DeployReactApp', {
      sources: [s3deploy.Source.asset('./build')],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
    });
  }
}
