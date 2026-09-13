#!/usr/bin/env node
import * as dotenv from 'dotenv';
import * as cdk from 'aws-cdk-lib';
import { CdkAccessTokenApiStack } from '../lib/cdk-access-token-api-stack';

const app = new cdk.App();
const stage = (app.node.tryGetContext('stage') as string) ?? 'prod';

// Load stage-specific .env first, then fall back to .env for any missing vars
dotenv.config({ path: `.env.${stage}` });
dotenv.config();

const stackName = stage === 'prod' ? 'CdkAccessTokenApiStack' : `CdkAccessTokenApiStack-${stage}`;
const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
};

new CdkAccessTokenApiStack(app, stackName, { stage, env });
