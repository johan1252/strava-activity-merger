// filepath: /lib/cdk-access-token-api-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambdaNodeJs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import 'dotenv/config';

export class CdkAccessTokenApiStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Define the Lambda function
        const getAccessTokenLambda = new lambdaNodeJs.NodejsFunction(this, 'GetAccessTokenHandler', {
            runtime: lambda.Runtime.NODEJS_22_X,
            //code: lambda.Code.fromAsset(path.join(__dirname, './handlers')),
            entry: './lib/handlers/getAccessToken.ts',
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

        // Define the API Gateway
        const api = new apigateway.RestApi(this, 'AccessTokenApi', {
            restApiName: 'Access Token Service',
            description: 'This service handles Strava access token requests.',
            defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: ["Content-Type", "Authorization"],
            },
        });

        // Create the /access-token endpoint
        const accessTokenResource = api.root.addResource('access-token');
        accessTokenResource.addMethod('POST', new apigateway.LambdaIntegration(getAccessTokenLambda));

        // Create the /activities endpoint
        const activitiesResource = api.root.addResource('activities');
        activitiesResource.addMethod('GET', new apigateway.LambdaIntegration(getActivitiesLambda));

        // Create the /activities/combine endpoint
        const combineActivitiesResource = activitiesResource.addResource('combine');
        combineActivitiesResource.addMethod('POST', new apigateway.LambdaIntegration(combineActivitiesLambda));
    }
}