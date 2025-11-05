import * as fs from 'fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({ serviceName: 'saveToS3' });

export const saveToS3 = async (s3Key: string, fileName: string): Promise<void> => {

    if (!s3Key) {
        logger.error("No S3 key provided, skipping backup upload");
        return;
    }

    if (!process.env.AWS_REGION) {
        logger.error("No AWS region provided, skipping backup upload");
        return;
    }

    // Backup file to S3 bucket for debugging
    const s3Client = new S3Client({ region: process.env.AWS_REGION });

    const bucketName = process.env.STREVEN_TMP_BUCKET_NAME;
    if (bucketName) {
        const fileStream = fs.createReadStream(fileName);
        const putCommand = new PutObjectCommand({
            Bucket: bucketName,
            Key: s3Key,
            Body: fileStream,
            ContentType: 'application/gpx+xml'
        });
        await s3Client.send(putCommand);
        logger.info("Uploaded backup GPX to S3", s3Key);
    } else {
        logger.error("No S3 bucket name provided, skipping backup upload");
    }
};