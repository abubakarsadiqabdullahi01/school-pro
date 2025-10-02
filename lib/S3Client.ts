// lib/S3Client.ts
import "server-only"
import { S3Client } from "@aws-sdk/client-s3";

function getS3Config() {
  const requiredEnvVars = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_ENDPOINT_URL_S3',
    'NEXT_PUBLIC_S3_BUCKET_IMAGES'
  ];

  const missing = requiredEnvVars.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing S3 environment variables: ${missing.join(', ')}`);
  }

  return {
    region: process.env.AWS_REGION || 'auto',
    endpoint: process.env.AWS_ENDPOINT_URL_S3,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
    forcePathStyle: false,
  };
}

let S3: S3Client;

try {
  const config = getS3Config();
  S3 = new S3Client(config);
} catch (error) {
  console.error('Failed to initialize S3 client:', error);
  S3 = new S3Client({
    region: 'auto',
    endpoint: 'invalid-endpoint',
    credentials: {
      accessKeyId: 'invalid',
      secretAccessKey: 'invalid',
    }
  });
}

export { S3 };