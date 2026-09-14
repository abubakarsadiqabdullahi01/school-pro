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
  }
}
