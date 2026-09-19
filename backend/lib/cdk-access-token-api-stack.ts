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
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

interface CdkAccessTokenApiStackProps extends cdk.StackProps {
    stage: string;
}

export class CdkAccessTokenApiStack extends cdk.Stack {
    public readonly hostedZone: route53.IHostedZone;
    public readonly certificate: certificatemanager.ICertificate;
    public readonly cloudFrontDistribution: cloudfront.Distribution;
    public readonly s3Bucket: s3.Bucket;
    public readonly strevenTmpBucket: s3.Bucket;

    constructor(scope: Construct, id: string, props: CdkAccessTokenApiStackProps) {
        super(scope, id, props);

        const { stage } = props;
        const isProd = stage === 'prod';
        const suffix = isProd ? '' : `-${stage}`;
        const domain = isProd ? 'streventools.com' : `${stage}.streventools.com`;

        // Prod creates and manages the hosted zone; staging imports the existing one
        this.hostedZone = isProd
            ? new route53.HostedZone(this, 'HostedZone', { zoneName: 'streventools.com' })
            : route53.HostedZone.fromLookup(this, 'HostedZone', { domainName: 'streventools.com' });

        // Create a certificate for HTTPS
        this.certificate = new certificatemanager.Certificate(this, 'SiteCertificate', {
            domainName: domain,
            validation: certificatemanager.CertificateValidation.fromDns(this.hostedZone),
        });

        // Export the hosted zone ID
        new cdk.CfnOutput(this, 'HostedZoneId', {
            value: this.hostedZone.hostedZoneId,
            exportName: `StrevenHostedZoneId${suffix}`,
        });

        // Export the certificate ARN
        new cdk.CfnOutput(this, 'CertificateArn', {
            value: this.certificate.certificateArn,
            exportName: `StrevenCertificateArn${suffix}`,
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
            exportName: `FrontendS3BucketName${suffix}`,
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
                    referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
                    override: true,
                },
            },
        });

        // Create a CloudFront distribution
        this.cloudFrontDistribution = new cloudfront.Distribution(this, 'ReactAppDistribution', {
            defaultBehavior: {
                origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(this.s3Bucket, { originAccessLevels: [cloudfront.AccessLevel.READ, cloudfront.AccessLevel.LIST] }),
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                responseHeadersPolicy: securityHeadersPolicy,
            },
            domainNames: [domain],
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

        cdk.Annotations.of(this).acknowledgeWarning('@aws-cdk/aws-cloudfront-origins:listBucketSecurityRisk', 'defaultRootObject is set to index.html');

        // Export the CloudFront distribution domain name and ID (used by frontend stack for deployment + invalidation)
        new cdk.CfnOutput(this, 'CloudFrontDistributionDomainName', {
            value: this.cloudFrontDistribution.distributionDomainName,
            exportName: `CloudFrontDistributionDomainName${suffix}`,
        });

        new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
            value: this.cloudFrontDistribution.distributionId,
            exportName: `CloudFrontDistributionId${suffix}`,
        });

        // Create a Route 53 record for the CloudFront distribution
        new route53.ARecord(this, 'CloudFrontAliasRecord', {
            zone: this.hostedZone,
            recordName: domain,
            target: route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(this.cloudFrontDistribution)),
        });

        // Create an S3 bucket for storing temporary app files
        this.strevenTmpBucket = new s3.Bucket(this, 'StrevenTmpBucket', {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            enforceSSL: true,
            removalPolicy: cdk.RemovalPolicy.DESTROY, // Change to RETAIN for production
            objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
            // Lifecycle rule to automatically delete objects after 30 days
            lifecycleRules: [{
                expiration: cdk.Duration.days(30),
            }],
        });

        // Export the S3 bucket name
        new cdk.CfnOutput(this, 'StrevenTmpBucketName', {
            value: this.strevenTmpBucket.bucketName,
            exportName: `StrevenTmpBucketName${suffix}`,
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

        // DynamoDB table for caching Strava activities
        const activityCacheTable = new dynamodb.TableV2(this, 'ActivityCacheTable', {
            tableName: `StravaActivityCache${suffix}`,
            partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
            billing: dynamodb.Billing.onDemand(),
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            globalSecondaryIndexes: [
                {
                    indexName: 'GSI1-SportDate',
                    partitionKey: { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
                    sortKey: { name: 'gsi1sk', type: dynamodb.AttributeType.STRING },
                    projectionType: dynamodb.ProjectionType.ALL,
                },
                {
                    indexName: 'GSI2-AllDist',
                    partitionKey: { name: 'gsi2pk', type: dynamodb.AttributeType.STRING },
                    sortKey: { name: 'gsi2sk', type: dynamodb.AttributeType.STRING },
                    projectionType: dynamodb.ProjectionType.ALL,
                },
                {
                    indexName: 'GSI3-SportDist',
                    partitionKey: { name: 'gsi3pk', type: dynamodb.AttributeType.STRING },
                    sortKey: { name: 'gsi3sk', type: dynamodb.AttributeType.STRING },
                    projectionType: dynamodb.ProjectionType.ALL,
                },
                {
                    indexName: 'GSI4-AllPace',
                    partitionKey: { name: 'gsi2pk', type: dynamodb.AttributeType.STRING },
                    sortKey: { name: 'gsi4sk', type: dynamodb.AttributeType.STRING },
                    projectionType: dynamodb.ProjectionType.ALL,
                },
                {
                    indexName: 'GSI5-SportPace',
                    partitionKey: { name: 'gsi3pk', type: dynamodb.AttributeType.STRING },
                    sortKey: { name: 'gsi5sk', type: dynamodb.AttributeType.STRING },
                    projectionType: dynamodb.ProjectionType.ALL,
                },
            ],
        });

        // Background Lambda for full activity sync (invoked async by getActivitiesLambda)
        const syncActivitiesLambda = new lambdaNodeJs.NodejsFunction(this, 'SyncActivitiesHandler', {
            runtime: lambda.Runtime.NODEJS_22_X,
            memorySize: 512,
            entry: './lib/handlers/syncActivities.ts',
            timeout: cdk.Duration.seconds(900),
            environment: {
                ACTIVITY_CACHE_TABLE_NAME: activityCacheTable.tableName,
            },
        });

        activityCacheTable.grantReadWriteData(syncActivitiesLambda);

        // Define the Lambda function for fetching activities
        const getActivitiesLambda = new lambdaNodeJs.NodejsFunction(this, 'GetActivitiesHandler', {
            runtime: lambda.Runtime.NODEJS_22_X,
            memorySize: 1024,
            entry: './lib/handlers/getActivities.ts', // Path to the handler file
            timeout: cdk.Duration.seconds(30),
            environment: {
                ACTIVITY_CACHE_TABLE_NAME: activityCacheTable.tableName,
                SYNC_ACTIVITIES_FUNCTION_ARN: syncActivitiesLambda.functionArn,
            },
        });

        activityCacheTable.grantReadWriteData(getActivitiesLambda);
        syncActivitiesLambda.grantInvoke(getActivitiesLambda);

        // Aggregated training stats (volume/pace trends, streak, sport breakdown,
        // calendar, gear mileage) computed from the cached activities.
        const getStatsLambda = new lambdaNodeJs.NodejsFunction(this, 'GetStatsHandler', {
            runtime: lambda.Runtime.NODEJS_22_X,
            memorySize: 1024,
            entry: './lib/handlers/getStats.ts',
            timeout: cdk.Duration.seconds(30),
            environment: {
                ACTIVITY_CACHE_TABLE_NAME: activityCacheTable.tableName,
            },
        });

        activityCacheTable.grantReadData(getStatsLambda);

        // AI-generated training summary — a short natural-language digest of the
        // athlete's recent training (volume/pace trends, streaks, race predictions),
        // fetched separately from /stats since it depends on Bedrock and shouldn't
        // block the deterministic charts from rendering. Calls Grok 4.3 via Amazon
        // Bedrock's Mantle endpoint, authenticating with a bearer token minted at
        // request time (via @aws/bedrock-token-generator) from this Lambda's own
        // execution role — no API key/secret to manage.
        const getTrainingSummaryLambda = new lambdaNodeJs.NodejsFunction(this, 'GetTrainingSummaryHandler', {
            runtime: lambda.Runtime.NODEJS_22_X,
            memorySize: 512,
            entry: './lib/handlers/getTrainingSummary.ts',
            timeout: cdk.Duration.seconds(30),
            environment: {
                ACTIVITY_CACHE_TABLE_NAME: activityCacheTable.tableName,
            },
            // The project-wide sdkV3ExcludeSmithyPackages feature flag externalizes
            // @smithy/* on the assumption the Lambda runtime's built-in SDK layer
            // provides it — but @aws/bedrock-token-generator imports @smithy/signature-v4
            // directly, which isn't reliably resolvable from that layer, causing a
            // "Cannot find module '@smithy/signature-v4'" error at runtime. Bundle
            // everything for this function instead of relying on the runtime-provided SDK.
            bundling: {
                externalModules: [],
            },
        });

        // Read/write — it reads cached activities and also writes/reads the cached
        // training summary itself (TRAINING_SUMMARY item, 24h TTL).
        activityCacheTable.grantReadWriteData(getTrainingSummaryLambda);
        // Permissions backing the minted bearer token, both under the bedrock-mantle
        // namespace: `CallWithBearerToken` authorizes minting/using the token at all
        // (AWS checks this against resource `*`, not a model/project ARN), while the
        // actual inference call against the Mantle endpoint is authorized separately as
        // `CreateInference` against a Mantle "project" resource. Model access for Grok
        // 4.3 must still be manually enabled in the Bedrock console for this
        // account/region; that toggle isn't exposed via CDK/IAM.
        getTrainingSummaryLambda.role?.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: ['bedrock-mantle:CallWithBearerToken'],
            resources: ['*'],
        }));
        getTrainingSummaryLambda.role?.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: ['bedrock-mantle:CreateInference'],
            resources: [`arn:aws:bedrock-mantle:${this.region}:${this.account}:project/default`],
        }));

        // Async worker for training plan generation (invoked by trainingPlanLambda,
        // not behind API Gateway) — kept off the request path entirely since a single
        // Grok call producing a full multi-week structured plan can plausibly exceed
        // API Gateway's hard 29s integration timeout. No route; internal-invoke only.
        const generateTrainingPlanLambda = new lambdaNodeJs.NodejsFunction(this, 'GenerateTrainingPlanHandler', {
            runtime: lambda.Runtime.NODEJS_22_X,
            memorySize: 512,
            entry: './lib/handlers/generateTrainingPlan.ts',
            timeout: cdk.Duration.seconds(90),
            environment: {
                ACTIVITY_CACHE_TABLE_NAME: activityCacheTable.tableName,
            },
            // Same reason as getTrainingSummaryLambda above — @aws/bedrock-token-generator
            // imports @smithy/signature-v4 directly.
            bundling: {
                externalModules: [],
            },
        });

        activityCacheTable.grantReadWriteData(generateTrainingPlanLambda);
        generateTrainingPlanLambda.role?.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: ['bedrock-mantle:CallWithBearerToken'],
            resources: ['*'],
        }));
        generateTrainingPlanLambda.role?.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: ['bedrock-mantle:CreateInference'],
            resources: [`arn:aws:bedrock-mantle:${this.region}:${this.account}:project/default`],
        }));

        // Request-facing handler — fast (no Grok call), just validates input, flips the
        // plan status to "generating", and fires the worker above asynchronously.
        const trainingPlanLambda = new lambdaNodeJs.NodejsFunction(this, 'TrainingPlanHandler', {
            runtime: lambda.Runtime.NODEJS_22_X,
            memorySize: 256,
            entry: './lib/handlers/trainingPlan.ts',
            timeout: cdk.Duration.seconds(10),
            environment: {
                ACTIVITY_CACHE_TABLE_NAME: activityCacheTable.tableName,
                GENERATE_TRAINING_PLAN_FUNCTION_ARN: generateTrainingPlanLambda.functionArn,
            },
        });

        activityCacheTable.grantReadWriteData(trainingPlanLambda);
        generateTrainingPlanLambda.grantInvoke(trainingPlanLambda);

        const combineActivitiesLambda = new lambdaNodeJs.NodejsFunction(this, 'CombineActivitiesHandler', {
            runtime: lambda.Runtime.NODEJS_22_X,
            memorySize: 1024,
            entry: './lib/handlers/combineActivities.ts', // Path to the handler file
            timeout: cdk.Duration.seconds(30),
            environment: {
                STREVEN_TMP_BUCKET_NAME: this.strevenTmpBucket.bucketName,
            },
        });

        // Allow object-level write within the bucket
        combineActivitiesLambda?.role?.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: ['s3:PutObject'],
            resources: [this.strevenTmpBucket.bucketArn + '/*'],
        }));

        const roundUpLambda = new lambdaNodeJs.NodejsFunction(this, 'RoundUpHandler', {
            runtime: lambda.Runtime.NODEJS_22_X,
            memorySize: 1024,
            entry: './lib/handlers/roundUp.ts', // Path to the new handler file
            timeout: cdk.Duration.seconds(30),
            environment: {
                STREVEN_TMP_BUCKET_NAME: this.strevenTmpBucket.bucketName,
            },
        });

        // Allow object-level write within the bucket
        roundUpLambda?.role?.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: ['s3:PutObject'],
            resources: [this.strevenTmpBucket.bucketArn + '/*'],
        }));

        const roundDownLambda = new lambdaNodeJs.NodejsFunction(this, 'RoundDownHandler', {
            runtime: lambda.Runtime.NODEJS_22_X,
            memorySize: 1024,
            entry: './lib/handlers/roundDown.ts', // Path to the new handler file
            timeout: cdk.Duration.seconds(30),
            environment: {
                STREVEN_TMP_BUCKET_NAME: this.strevenTmpBucket.bucketName,
            },
        });

        // Allow object-level write within the bucket
        roundDownLambda?.role?.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: ['s3:PutObject'],
            resources: [this.strevenTmpBucket.bucketArn + '/*'],
        }));

        // Define the API Gateway
        const api = new apigateway.RestApi(this, 'AccessTokenApi', {
            restApiName: 'Access Token Service',
            description: 'This service handles Strava access token requests.',
            defaultCorsPreflightOptions: {
                allowOrigins: [domain],
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

        // Create the /stats endpoint
        const statsResource = apiResource.addResource('stats');
        statsResource.addMethod('GET', new apigateway.LambdaIntegration(getStatsLambda));

        // Create the /stats/training-summary endpoint
        const trainingSummaryResource = statsResource.addResource('training-summary');
        trainingSummaryResource.addMethod('GET', new apigateway.LambdaIntegration(getTrainingSummaryLambda));

        // Create the /training-plan endpoint (GET current plan, POST to (re)generate)
        const trainingPlanResource = apiResource.addResource('training-plan');
        const trainingPlanIntegration = new apigateway.LambdaIntegration(trainingPlanLambda);
        trainingPlanResource.addMethod('GET', trainingPlanIntegration);
        trainingPlanResource.addMethod('POST', trainingPlanIntegration);

        // Auto-generated secret used to validate Strava webhook subscription requests
        const webhookVerifyTokenSecret = new secretsmanager.Secret(this, 'StravaWebhookVerifyToken', {
            secretName: `strava-webhook-verify-token${suffix}`,
            generateSecretString: {
                excludePunctuation: true,
                passwordLength: 32,
            },
        });

        // Strava webhook handler — receives real-time activity create/update/delete events
        const stravaWebhookLambda = new lambdaNodeJs.NodejsFunction(this, 'StravaWebhookHandler', {
            runtime: lambda.Runtime.NODEJS_22_X,
            memorySize: 256,
            entry: './lib/handlers/stravaWebhook.ts',
            timeout: cdk.Duration.seconds(10),
            environment: {
                ACTIVITY_CACHE_TABLE_NAME: activityCacheTable.tableName,
                STRAVA_WEBHOOK_VERIFY_TOKEN_SECRET_ARN: webhookVerifyTokenSecret.secretArn,
            },
        });

        activityCacheTable.grantReadWriteData(stravaWebhookLambda);
        webhookVerifyTokenSecret.grantRead(stravaWebhookLambda);

        // Create the /webhook/strava endpoint (GET for validation, POST for events)
        const webhookResource = apiResource.addResource('webhook');
        const stravaWebhookResource = webhookResource.addResource('strava');
        stravaWebhookResource.addMethod('GET', new apigateway.LambdaIntegration(stravaWebhookLambda));
        stravaWebhookResource.addMethod('POST', new apigateway.LambdaIntegration(stravaWebhookLambda));
    }
}