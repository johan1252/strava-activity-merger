#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CdkAccessTokenApiStack } from '../lib/cdk-access-token-api-stack';

const app = new cdk.App();

const backendStack = new CdkAccessTokenApiStack(app, 'CdkAccessTokenApiStack');