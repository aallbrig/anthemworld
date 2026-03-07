// Shared DynamoDB client — respects LOCAL_DYNAMODB_ENDPOINT for LocalStack
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const endpoint = process.env.LOCAL_DYNAMODB_ENDPOINT;

// When using LocalStack, force us-east-1 (tables are created there).
// Otherwise use the Lambda runtime's AWS_REGION.
const region = endpoint ? 'us-east-1' : (process.env.AWS_REGION || 'us-east-1');

const rawClient = new DynamoDBClient({
    region,
    ...(endpoint ? { endpoint } : {}),
});

const db = DynamoDBDocumentClient.from(rawClient, {
    marshallOptions: { removeUndefinedValues: true },
});

module.exports = db;
