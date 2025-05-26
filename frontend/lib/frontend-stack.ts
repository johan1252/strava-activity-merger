import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3Deployment from 'aws-cdk-lib/aws-s3-deployment';

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Get S3 bucket name from export S3BucketName
    const bucketName = cdk.Fn.importValue('FrontendS3BucketName');
    const bucket = s3.Bucket.fromBucketName(this, 'ReactAppBucket', bucketName);

    // Deploy the React app to the S3 bucket
    new s3Deployment.BucketDeployment(this, 'DeployReactApp', {
      sources: [s3Deployment.Source.asset('./build')],
      destinationBucket: bucket,
    });
  }
}