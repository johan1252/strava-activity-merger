// filepath: /lib/cdk-access-token-api-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambdaNodeJs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import 'dotenv/config';

export class CdkAccessTokenApiStack extends cdk.Stack {
    public readonly hostedZone: route53.IHostedZone;
    public readonly certificate: certificatemanager.ICertificate;
    public readonly cloudFrontDistribution: cloudfront.Distribution;
    public readonly s3Bucket: s3.Bucket;

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Create a hosted zone for streventools.com
        this.hostedZone = new route53.HostedZone(this, 'HostedZone', {
            zoneName: 'streventools.com',
        });

        // Create a certificate for HTTPS
        this.certificate = new certificatemanager.Certificate(this, 'SiteCertificate', {
            domainName: 'streventools.com',
            validation: certificatemanager.CertificateValidation.fromDns(this.hostedZone),
        });

        // Export the hosted zone ID
        new cdk.CfnOutput(this, 'HostedZoneId', {
            value: this.hostedZone.hostedZoneId,
            exportName: 'StrevenHostedZoneId',
        });

        // Export the certificate ARN
        new cdk.CfnOutput(this, 'CertificateArn', {
            value: this.certificate.certificateArn,
            exportName: 'StrevenCertificateArn',
        });

        // Create an S3 bucket for the React app
        this.s3Bucket = new s3.Bucket(this, 'ReactAppBucket', {
            websiteIndexDocument: 'index.html',
            websiteErrorDocument: 'index.html',
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            enforceSSL: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY, // Change to RETAIN for production
            objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
        });

        // Export the S3 bucket name
        new cdk.CfnOutput(this, 'FrontendS3BucketName', {
            value: this.s3Bucket.bucketName,
            exportName: 'FrontendS3BucketName',
        });

        const securityHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeadersPolicy', {
            securityHeadersBehavior: {
                contentSecurityPolicy: {
                    contentSecurityPolicy: "default-src 'self'; script-src 'self'; img-src 'self' data: https://www.strava.com https://*.facebook.com https://platform-lookaside.fbsbx.com https://*.openstreetmap.org https://*.cloudfront.net/pictures/athletes/ ; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self';",
                    override: true,
                },
                strictTransportSecurity: {
                    accessControlMaxAge: cdk.Duration.days(365),
                    override: true,
                    includeSubdomains: true,
                    preload: true,
                },
                xssProtection: {
                    protection: true,
                    override: true,
                    modeBlock: true,
                },
                frameOptions: {
                    frameOption: cloudfront.HeadersFrameOption.DENY,
                    override: true,
                },
                referrerPolicy: {
                    referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER,
                    override: true,

                },
            },
        });

        // Create a CloudFront distribution
        this.cloudFrontDistribution = new cloudfront.Distribution(this, 'ReactAppDistribution', {
            defaultBehavior: {
                origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(this.s3Bucket, { originAccessLevels: [cloudfront.AccessLevel.READ, cloudfront.AccessLevel.LIST]}),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                responseHeadersPolicy: securityHeadersPolicy,
            },
            domainNames: ['streventools.com'],
            certificate: this.certificate,
            defaultRootObject: 'index.html',
            errorResponses: [
                {
                    httpStatus: 404,
                    responseHttpStatus: 200,
                    responsePagePath: '/index.html',
                    ttl: cdk.Duration.minutes(5),
                }
            ]
        });

        // Export the CloudFront distribution domain name
        new cdk.CfnOutput(this, 'CloudFrontDistributionDomainName', {
            value: this.cloudFrontDistribution.distributionDomainName,
            exportName: 'CloudFrontDistributionDomainName',
        });

        // Create a Route 53 record for the CloudFront distribution
        new route53.ARecord(this, 'CloudFrontAliasRecord', {
            zone: this.hostedZone,
            recordName: 'streventools.com',
            target: route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(this.cloudFrontDistribution)),
        });

        // Define the Lambda function
        const getAccessTokenLambda = new lambdaNodeJs.NodejsFunction(this, 'GetAccessTokenHandler', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: './lib/handlers/getAccessToken.ts',
            environment: {
                STRAVA_CLIENT_ID: process.env.STRAVA_CLIENT_ID || '',
                STRAVA_CLIENT_SECRET: process.env.STRAVA_CLIENT_SECRET || '',
                STRAVA_ACCESS_TOKEN: process.env.STRAVA_ACCESS_TOKEN || '',
                STRAVA_REFRESH_TOKEN: process.env.STRAVA_REFRESH_TOKEN || '',
                STRAVA_REDIRECT_URI: process.env.STRAVA_REDIRECT_URI || '',
            },
        });

        const refreshTokenLambda = new lambdaNodeJs.NodejsFunction(this, 'RefreshTokenHandler', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: './lib/handlers/refreshToken.ts',
            environment: {
                STRAVA_CLIENT_ID: process.env.STRAVA_CLIENT_ID || '',
                STRAVA_CLIENT_SECRET: process.env.STRAVA_CLIENT_SECRET || '',
                STRAVA_ACCESS_TOKEN: process.env.STRAVA_ACCESS_TOKEN || '',
                STRAVA_REFRESH_TOKEN: process.env.STRAVA_REFRESH_TOKEN || '',
                STRAVA_REDIRECT_URI: process.env.STRAVA_REDIRECT_URI || '',
            },
        });

        // Define the Lambda function for fetching activities
        const getActivitiesLambda = new lambdaNodeJs.NodejsFunction(this, 'GetActivitiesHandler', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: './lib/handlers/getActivities.ts', // Path to the handler file
            timeout: cdk.Duration.seconds(30),
        });

        const combineActivitiesLambda = new lambdaNodeJs.NodejsFunction(this, 'CombineActivitiesHandler', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: './lib/handlers/combineActivities.ts', // Path to the handler file
            timeout: cdk.Duration.seconds(240),
        });

        const roundUpLambda = new lambdaNodeJs.NodejsFunction(this, 'RoundUpHandler', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: './lib/handlers/roundUp.ts', // Path to the new handler file
            timeout: cdk.Duration.seconds(240),
        });

        const roundDownLambda = new lambdaNodeJs.NodejsFunction(this, 'RoundDownHandler', {
            runtime: lambda.Runtime.NODEJS_22_X,
            entry: './lib/handlers/roundDown.ts', // Path to the new handler file
            timeout: cdk.Duration.seconds(240),
        });

        // Define the API Gateway
        const api = new apigateway.RestApi(this, 'AccessTokenApi', {
            restApiName: 'Access Token Service',
            description: 'This service handles Strava access token requests.',
            defaultCorsPreflightOptions: {
                allowOrigins: ["streventools.com"],
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: ["Content-Type", "Authorization"],
            },
        });

        // Add cloudfront origin for the API Gateway
        const apiOrigin = new cloudfrontOrigins.HttpOrigin(cdk.Fn.select(2, cdk.Fn.split('/', api.url)), {
            originPath: '/prod', // Use the stage name
        });
        this.cloudFrontDistribution.addBehavior('/api/*', apiOrigin, {
            allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
            cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
            viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED, // Disable caching for API responses
            originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER, // Forward all headers except Host
            responseHeadersPolicy: securityHeadersPolicy,
        });

        // Add /api resource to the API Gateway
        const apiResource = api.root.addResource('api');

        // Create the /access-token endpoint
        const accessTokenResource = apiResource.addResource('access-token');
        accessTokenResource.addMethod('POST', new apigateway.LambdaIntegration(getAccessTokenLambda));

        // Create the /refresh-token endpoint
        const refreshTokenResource = apiResource.addResource('refresh-token');
        refreshTokenResource.addMethod('POST', new apigateway.LambdaIntegration(refreshTokenLambda));

        // Create the /activities endpoint
        const activitiesResource = apiResource.addResource('activities');
        activitiesResource.addMethod('GET', new apigateway.LambdaIntegration(getActivitiesLambda));

        // Create the /activities/combine endpoint
        const combineActivitiesResource = activitiesResource.addResource('combine');
        combineActivitiesResource.addMethod('POST', new apigateway.LambdaIntegration(combineActivitiesLambda));

        // Create the /activities/roundup endpoint
        const roundUpResource = activitiesResource.addResource('roundup');
        roundUpResource.addMethod('POST', new apigateway.LambdaIntegration(roundUpLambda));

        // Create the /activities/rounddown endpoint
        const roundDownResource = activitiesResource.addResource('rounddown');
        roundDownResource.addMethod('POST', new apigateway.LambdaIntegration(roundDownLambda));
    }
}