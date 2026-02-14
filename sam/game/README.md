# AWS SAM Game Service

This directory contains the AWS SAM application for the National Anthem Game service.

## Structure

```
sam/game/
├── template.yaml           # CloudFormation template
├── functions/             # Lambda function code
│   ├── session/          # Session creation
│   ├── matchup/          # Get next matchup
│   └── vote/             # Submit vote
├── events/               # Test events for local development
├── tests/                # Unit and integration tests
└── README.md
```

## Setup

1. Install AWS SAM CLI:
   ```bash
   pip install aws-sam-cli
   ```

2. Configure AWS credentials:
   ```bash
   aws configure
   ```

## Local Development

```bash
# Start local API
sam local start-api --port 3001

# Invoke function locally
sam local invoke SessionFunction -e events/session-event.json

# Generate test event
sam local generate-event apigateway aws-proxy > events/matchup-event.json
```

## Deployment

```bash
# Build
sam build

# Deploy (first time)
sam deploy --guided

# Deploy (subsequent)
sam deploy
```

## Testing

```bash
# Unit tests
npm test

# Integration tests
sam local invoke MatchupFunction -e events/matchup-event.json

# API tests
curl http://localhost:3001/session
```

## Environment Variables

Set in `template.yaml`:
- `RANKINGS_TABLE` - DynamoDB table for rankings
- `VOTES_TABLE` - DynamoDB table for vote history
- `SESSIONS_TABLE` - DynamoDB table for user sessions

## API Endpoints

- `GET /session` - Create/get user session
- `GET /matchup?session_id={id}` - Get next anthem matchup
- `POST /vote` - Submit vote

See `/docs/game.md` for detailed API documentation.
