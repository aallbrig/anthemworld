# AWS SAM Leaderboard Service

This directory contains the AWS SAM application for the National Anthem Leaderboard service.

## Structure

```
sam/leaderboard/
├── template.yaml           # CloudFormation template
├── functions/             # Lambda function code
│   ├── rankings/         # Get rankings
│   ├── country/          # Get country details
│   └── stats/            # Get global stats
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
sam local start-api --port 3002

# Invoke function locally
sam local invoke RankingsFunction -e events/rankings-event.json
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

# API tests
curl http://localhost:3002/leaderboard
curl http://localhost:3002/leaderboard/country/usa
curl http://localhost:3002/leaderboard/stats
```

## Environment Variables

Set in `template.yaml`:
- `RANKINGS_TABLE` - DynamoDB table for rankings (shared with game service)
- `VOTES_TABLE` - DynamoDB table for vote history (shared with game service)

## API Endpoints

- `GET /leaderboard` - Get ranked countries
- `GET /leaderboard/country/{id}` - Get country details
- `GET /leaderboard/stats` - Get global statistics

See `/docs/game.md` for detailed API documentation.
