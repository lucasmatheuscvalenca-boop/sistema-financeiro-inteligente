import "dotenv/config";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.APP_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
