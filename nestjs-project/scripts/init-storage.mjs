import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';

const client = new S3Client({ requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', endpoint: process.env.STORAGE_ENDPOINT, region: process.env.STORAGE_REGION, forcePathStyle: true, credentials: { accessKeyId: process.env.STORAGE_ACCESS_KEY, secretAccessKey: process.env.STORAGE_SECRET_KEY } });
try {
  for (const Bucket of [process.env.STORAGE_BUCKET, `${process.env.STORAGE_BUCKET}-test`]) {
    try { await client.send(new HeadBucketCommand({ Bucket })); }
    catch (error) {
      if (error.$metadata?.httpStatusCode !== 404) throw error;
      await client.send(new CreateBucketCommand({ Bucket }));
    }
    console.log(`Private storage bucket ready: ${Bucket}`);
  }
} finally { client.destroy(); }
