// Shared DynamoDB client — respects LOCAL_DYNAMODB_ENDPOINT for LocalStack
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const endpoint = process.env.LOCAL_DYNAMODB_ENDPOINT; // set by docker-compose / sam local

const rawClient = new DynamoDBClient({
    region: process.env.AWS_REGION || 'us-east-1',
    ...(endpoint ? { endpoint } : {}),
});

const db = DynamoDBDocumentClient.from(rawClient, {
    marshallOptions: { removeUndefinedValues: true },
});

module.exports = db;
