import * as cdk from 'aws-cdk-lib';
import { FrontendStack } from '../lib/frontend-stack';

const app = new cdk.App();
const stage = (app.node.tryGetContext('stage') as string) ?? 'prod';
const stackName = stage === 'prod' ? 'FrontendStack' : `FrontendStack-${stage}`;

new FrontendStack(app, stackName);
