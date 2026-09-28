// lib/env-validation.ts
import path from 'node:path';

export function validateEnv() {
  const requiredEnvVars = [
    'DATABASE_URL',
    'NEXTAUTH_SECRET',
    'NEXTAUTH_URL'
  ];

  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  console.log('✅ Environment variables validated successfully');
}

// Optional: Add specific validation for different environments
export function validateEnvForProduction() {
  validateEnv();
  
  // Additional production-specific checks
  if (process.env.NODE_ENV === 'production') {
    if (process.env.NEXTAUTH_URL?.includes('localhost')) {
      console.warn('⚠️  NEXTAUTH_URL contains localhost in production');
    }
    
    if (!process.env.NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET.length < 32) {
      throw new Error('NEXTAUTH_SECRET must be at least 32 characters long in production');
    }

    // Uploads live on disk now (lib/local-storage.ts), outside the web root.
    // That module already refuses to run without an absolute UPLOAD_DIR, but it
    // only finds out when someone uploads a file; checking here means a bad
    // deploy shows up on the first page load instead of weeks later.
    const uploadDir = process.env.UPLOAD_DIR;
    if (!uploadDir) {
      throw new Error('UPLOAD_DIR is required in production — an absolute path outside the web root');
    }
    if (!path.isAbsolute(uploadDir)) {
      throw new Error('UPLOAD_DIR must be an absolute path');
    }

    // Every background job this deployment has — the payment event processor, the
    // settlement reconciler and the notification drain — is an HTTP endpoint guarded by
    // this one secret. Without it they all answer 401 to cPanel's cron and nothing runs:
    // a parent's payment is never recovered when a webhook is missed, and no message ever
    // leaves the outbox. Nothing about the application looks broken while that is true,
    // which is exactly why it has to fail here instead.
    const cronSecret = process.env.PAYMENT_CRON_SECRET;
    if (!cronSecret || cronSecret.trim().length < 24) {
      throw new Error(
        'PAYMENT_CRON_SECRET is required in production and must be at least 24 characters — '
        + 'without it the payment and notification cron endpoints reject every call',
      );
    }

    // Checked for shape, not for presence. A school collecting only cash needs no gateway
    // key at all, so demanding one would refuse to start a deployment that is perfectly
    // correct. A malformed one is different: it is silent until the first school tries to
    // save its Paystack credentials, and then it fails in a place nobody connects to this.
    const gatewayKey = process.env.PAYMENT_GATEWAY_ENCRYPTION_KEY;
    if (gatewayKey && gatewayKey.trim().length > 0) {
      const decoded = Buffer.from(gatewayKey, 'base64');
      if (decoded.length !== 32) {
        throw new Error(
          'PAYMENT_GATEWAY_ENCRYPTION_KEY must be exactly 32 random bytes encoded as base64',
        );
      }
    }
  }
}
