import { Client } from 'minio';
import { env } from '~/env';

export const minioClient = new Client({
  endPoint: env.MINIO_ENDPOINT,
  port: parseInt(env.MINIO_PORT),
  useSSL: env.MINIO_USE_SSL === 'true',
  accessKey: env.MINIO_ROOT_USER,
  secretKey: env.MINIO_ROOT_PASSWORD,
});

// Initialize bucket if it doesn't exist
const initBucket = async () => {
  try {
    const bucketExists = await minioClient.bucketExists('cvs');
    if (!bucketExists) {
      await minioClient.makeBucket('cvs');
    }
    
    // Always set bucket policy for public read access (even if bucket exists)
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Sid: 'PublicReadGetObject',
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: 'arn:aws:s3:::cvs/*',
        },
      ],
    };
    
    try {
      await minioClient.setBucketPolicy('cvs', JSON.stringify(policy));
    } catch {
      // Ignore policy setting errors
    }
  } catch {
    // Ignore bucket initialization errors
  }
};

// Initialize on module load
void initBucket();